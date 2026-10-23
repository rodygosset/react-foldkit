import { it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import type * as Update from "foldkit/update"
import * as Subscription from "foldkit/subscription"
import { expect } from "vitest"
import * as Engine from "../test/fixtures/managedResource"
import * as Store from "./store"

const saw = (store: Store.Store<Engine.Model, Engine.Message>, event: string) =>
	Store.takeWhen(store, (model) => Option.liftPredicate(model, (model) => model.events.includes(event)))

it.effect("provides unavailable and acquired values, keeps equal requirements, and releases before replacing", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const log: string[] = []
			const program = Engine.make(
				(id) =>
					Effect.sync(function () {
						log.push(`acquire:${id}`)
						return { id }
					}),
				({ id }) =>
					Effect.sync(function () {
						log.push(`release:${id}`)
					})
			)
			const store = yield* Store.make(program, program.init())
			store.dispatch(Engine.Message.RequestedRead())
			yield* saw(store, "EngineUnavailable")
			store.dispatch(Engine.Message.RequestedEngine({ id: "a" }))
			yield* saw(store, "AcquiredEngine:a")
			store.dispatch(Engine.Message.RequestedRead())
			yield* saw(store, "CompletedReadEngine:a")
			store.dispatch(Engine.Message.RequestedEngine({ id: "a" }))
			store.dispatch(Engine.Message.RequestedEngine({ id: "b" }))
			yield* saw(store, "AcquiredEngine:b")
			store.dispatch(Engine.Message.DisabledEngine())
			yield* Store.takeWhen(store, (model) =>
				Option.liftPredicate(
					model,
					(model) => model.events.filter((event) => event === "ReleasedEngine").length === 2
				)
			)
			expect(log).toEqual(["acquire:a", "release:a", "acquire:b", "release:b"])
			yield* store.dispose()
			expect(log).toHaveLength(4)
		})
	)
)

it.effect("recovers from acquisition failure after requirements change", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const program = Engine.make((id) => (id === "bad" ? Effect.fail("failed") : Effect.succeed({ id })))
			const store = yield* Store.make(program, program.init())
			store.dispatch(Engine.Message.RequestedEngine({ id: "bad" }))
			yield* saw(store, "FailedAcquireEngine")
			expect(Option.isNone(store.getCrash())).toBe(true)
			store.dispatch(Engine.Message.RequestedRead())
			yield* saw(store, "EngineUnavailable")
			store.dispatch(Engine.Message.RequestedEngine({ id: "good" }))
			yield* saw(store, "AcquiredEngine:good")
		})
	)
)

it.effect("runs Layer finalizers after explicit release even when release defects", () =>
	Effect.scoped(
		Effect.gen(function* () {
			class Service extends Context.Service<Service, Engine.EngineShape>()("ManagedLayer") {}
			const finalized = yield* Deferred.make<void>()
			const log: string[] = []
			const program = Engine.make(
				(id) =>
					Layer.build(
						Layer.effect(
							Service,
							Effect.acquireRelease(Effect.succeed({ id }), () =>
								Effect.sync(function () {
									log.push("finalize")
								}).pipe(Effect.andThen(Deferred.succeed(finalized, undefined)))
							)
						)
					).pipe(Effect.map((context) => Context.get(context, Service))),
				() =>
					Effect.sync(function () {
						log.push("release")
						throw new Error("release failed")
					}),
				Option.some("a")
			)
			const store = yield* Store.make(program, program.init())
			yield* saw(store, "AcquiredEngine:a")
			store.dispatch(Engine.Message.DisabledEngine())
			yield* Deferred.await(finalized)
			yield* saw(store, "ReleasedEngine")
			store.dispatch(Engine.Message.RequestedRead())
			yield* saw(store, "EngineUnavailable")
			expect(log).toEqual(["release", "finalize"])
			expect(Option.isNone(store.getCrash())).toBe(true)
		})
	)
)

it.effect("stops Commands and Subscriptions before resources, then closes static services", () =>
	Effect.scoped(
		Effect.gen(function* () {
			class Service extends Context.Service<Service, string>()("StaticService") {}
			const log: string[] = []
			const started = yield* Deferred.make<void>()
			const subscribed = yield* Deferred.make<void>()
			const program = Engine.make(
				undefined,
				() =>
					Effect.sync(function () {
						log.push("managed")
					}),
				Option.some("a")
			)
			const subscriptions = Subscription.make<Engine.Model, Engine.Message, Engine.EngineService>()((entry) => ({
				watch: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () =>
							Stream.fromEffect(
								Deferred.succeed(subscribed, undefined).pipe(Effect.andThen(Effect.never))
							).pipe(
								Stream.ensuring(
									Effect.sync(function () {
										log.push("subscription")
									})
								)
							),
					}
				),
			}))
			const store = yield* Store.make(
				{
					...program,
					update: (
						model: Engine.Model,
						message: Engine.Message
					): Update.Return<Engine.Model, Engine.Message, Engine.EngineService | Service> =>
						program.update(model, message),
					subscriptions,
					resources: Layer.effect(
						Service,
						Effect.acquireRelease(Effect.succeed("static"), () =>
							Effect.sync(function () {
								log.push("static")
							})
						)
					),
				},
				{
					...program.init(),
					commands: [
						{
							name: "HoldEngine",
							effect: Effect.gen(function* () {
								yield* Service
								yield* Deferred.succeed(started, undefined)
								return yield* Effect.never
							}).pipe(
								Effect.ensuring(
									Effect.sync(function () {
										log.push("command")
									})
								)
							),
						},
					],
				}
			)
			yield* saw(store, "AcquiredEngine:a")
			yield* Deferred.await(started)
			yield* Deferred.await(subscribed)
			yield* store.dispose()
			expect(log.slice(0, 2).sort()).toEqual(["command", "subscription"])
			expect(log.slice(2)).toEqual(["managed", "static"])
		})
	)
)

it.effect("gives two Stores using the same tag separate live values", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const program = Engine.make()
			const first = yield* Store.make(program, { model: { requested: Option.some("first"), events: [] } })
			const second = yield* Store.make(program, { model: { requested: Option.some("second"), events: [] } })
			yield* saw(first, "AcquiredEngine:first")
			yield* saw(second, "AcquiredEngine:second")
			first.dispatch(Engine.Message.RequestedRead())
			second.dispatch(Engine.Message.RequestedRead())
			yield* saw(first, "CompletedReadEngine:first")
			yield* saw(second, "CompletedReadEngine:second")
			yield* first.dispose()
			second.dispatch(Engine.Message.RequestedRead())
			expect(second.getModel().events).not.toContain("ReleasedEngine")
		})
	)
)

it.effect("cleans up a resource when update crashes without publishing shutdown Messages", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const released = yield* Deferred.make<void>()
			const program = Engine.make(
				undefined,
				() => Effect.asVoid(Deferred.succeed(released, undefined)),
				Option.some("a")
			)
			const store = yield* Store.make({ ...program, onCrash() {} }, program.init())
			yield* saw(store, "AcquiredEngine:a")
			store.dispatch(Engine.Message.TriggeredCrash())
			yield* Deferred.await(released)
			expect(Option.isSome(store.getCrash())).toBe(true)
			expect(store.getModel().events).toEqual(["AcquiredEngine:a"])
		})
	)
)

it.effect("waits for an in-flight acquire to finish before releasing it on shutdown", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const started = yield* Deferred.make<void>()
			const finish = yield* Deferred.make<Engine.EngineShape>()
			const released: string[] = []
			const program = Engine.make(
				() => Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))),
				({ id }) =>
					Effect.sync(function () {
						released.push(id)
					}),
				Option.some("a")
			)
			const store = yield* Store.make(program, program.init())
			yield* Deferred.await(started)
			const disposing = yield* Effect.forkChild(store.dispose(), { startImmediately: true })
			yield* Deferred.succeed(finish, { id: "a" })
			yield* Fiber.join(disposing)
			expect(released).toEqual(["a"])
			expect(store.getModel().events).toEqual([])
		})
	)
)

it.effect("provides managed values to Subscriptions", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const program = Engine.make(undefined, undefined, Option.some("a"))
			const subscriptions = Subscription.make<Engine.Model, Engine.Message, Engine.EngineService>()((entry) => ({
				read: entry(
					{ ready: Schema.Boolean },
					{
						modelToDependencies: (model) => ({ ready: model.events.includes("AcquiredEngine:a") }),
						dependenciesToStream: ({ ready }) =>
							ready ? Stream.fromEffect(Engine.ReadEngine().effect) : Stream.empty,
					}
				),
			}))
			const store = yield* Store.make({ ...program, subscriptions }, program.init())
			yield* saw(store, "CompletedReadEngine:a")
		})
	)
)

it.effect("crashes on a requirements defect and releases the previous resource outside the failed watcher", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const defect = new Error("requirements failed")
			const released = yield* Deferred.make<void>()
			const crashed = yield* Deferred.make<Cause.Cause<unknown>>()
			const program = Engine.make(
				undefined,
				() => Effect.asVoid(Deferred.succeed(released, undefined)),
				Option.some("a")
			)
			const engine = program.managedResources?.engine
			if (engine === undefined) return yield* Effect.die("missing test resource")
			const store = yield* Store.make(
				{
					...program,
					managedResources: {
						engine: {
							...engine,
							modelToMaybeRequirements(model: Engine.Model) {
								if (Option.contains(model.requested, "bad")) throw defect
								return engine.modelToMaybeRequirements(model)
							},
						},
					},
					onCrash(cause) {
						Deferred.doneUnsafe(crashed, Effect.succeed(cause))
					},
				},
				program.init()
			)
			yield* saw(store, "AcquiredEngine:a")
			store.dispatch(Engine.Message.RequestedEngine({ id: "bad" }))
			expect(yield* Deferred.await(crashed)).toEqual(Cause.die(defect))
			yield* Deferred.await(released)
			yield* store.dispose()
		})
	)
)
