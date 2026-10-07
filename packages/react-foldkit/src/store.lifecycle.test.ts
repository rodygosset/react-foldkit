import { it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Exit, Layer, Option, Stream } from "effect"
import { describe, expect } from "vitest"
import * as Store from "./store"
import * as Subscription from "./subscription"

class Resource extends Context.Service<Resource, { closed: boolean }>()("StoreLifecycle/Resource") {}

describe("store lifetime", function () {
	it.live("finishes command and subscription cleanup before releasing Layer services", () =>
		Effect.scoped(
			Effect.gen(function* () {
				const events: Array<string> = []
				const commandStarted = yield* Deferred.make<void>()
				const subscriptionStarted = yield* Deferred.make<void>()
				const layer = Layer.effect(
					Resource,
					Effect.acquireRelease(
						Effect.sync((): { closed: boolean } => ({ closed: false })),
						(resource) =>
							Effect.sync(function () {
								resource.closed = true
								events.push("released")
							})
					)
				)
				const work = (name: string, started: Deferred.Deferred<void>) =>
					Effect.gen(function* () {
						const resource = yield* Resource
						return yield* Deferred.succeed(started, undefined).pipe(
							Effect.andThen(Effect.never),
							Effect.ensuring(
								Effect.yieldNow.pipe(
									Effect.andThen(
										Effect.sync(function () {
											events.push(`${name}: closed=${resource.closed}`)
										})
									)
								)
							)
						)
					})
				const subscriptions = Subscription.make<number, number, Resource>()((entry) => ({
					watch: entry(
						{},
						{
							modelToDependencies: () => ({}),
							dependenciesToStream: () => Stream.fromEffect(work("subscription", subscriptionStarted)),
						}
					),
				}))
				const store = yield* Store.make(
					{ update: (_model: number, message: number) => ({ model: message }), layer, subscriptions },
					{ model: 0, commands: [{ name: "Waiting", effect: work("command", commandStarted) }] }
				)
				yield* Deferred.await(commandStarted)
				yield* Deferred.await(subscriptionStarted)
				yield* store.dispose()
				expect(events.slice(0, 2).sort()).toEqual(["command: closed=false", "subscription: closed=false"])
				expect(events[2]).toBe("released")
			})
		)
	)

	it.live("reports an initial dependency projection defect as a terminal store crash", () =>
		Effect.scoped(
			Effect.gen(function* () {
				const defect = new Error("initial projection failed")
				const crashed = yield* Deferred.make<Cause.Cause<unknown>>()
				const subscriptions = Subscription.make<number, number>()((entry) => ({
					watch: entry(
						{},
						{
							modelToDependencies() {
								throw defect
							},
							dependenciesToStream: () => Stream.empty,
						}
					),
				}))
				const store = yield* Store.make(
					{
						update: (_model: number, message: number) => ({ model: message }),
						subscriptions,
						onCrash(cause, message) {
							expect(Option.isNone(message)).toBe(true)
							Deferred.doneUnsafe(crashed, Effect.succeed(cause))
						},
					},
					{ model: 0 }
				)
				const cause = yield* Deferred.await(crashed)
				expect(cause).toEqual(Cause.die(defect))
				expect(store.getCrash()).toEqual(Option.some(cause))
				store.dispatch(1)
				expect(store.getModel()).toBe(0)
			})
		)
	)

	it.live("closes a failed imperative boot before previously scheduled subscriptions can run", () =>
		Effect.gen(function* () {
			const defect = new Error("subscription setup failed")
			const events: Array<string> = []
			const subscriptions = Subscription.make<number, number>()(function (entry) {
				const second = entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () => Stream.empty,
					}
				)
				return {
					first: entry(
						{},
						{
							modelToDependencies: () => ({}),
							dependenciesToStream: () =>
								Stream.fromEffect(
									Effect.sync(function () {
										events.push("ran")
										return 1
									})
								),
						}
					),
					second: {
						...second,
						get dependenciesSchema(): typeof second.dependenciesSchema {
							throw defect
						},
					},
				}
			})
			const exit = yield* Effect.exit(
				Effect.sync(() =>
					Store.boot(
						{ update: (model: number, _message: number) => ({ model }), subscriptions },
						{ model: 0 }
					)
				)
			)
			expect(exit).toEqual(Exit.failCause(Cause.die(defect)))
			yield* Effect.yieldNow
			expect(events).toEqual([])
		})
	)
})
