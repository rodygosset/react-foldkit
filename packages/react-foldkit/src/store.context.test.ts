import { it } from "@effect/vitest"
import { Deferred, Effect, Logger, Option, Stream } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"
import * as Store from "./store"
import * as Subscription from "./subscription"

it.effect("preserves the acquisition logger and clock in commands and subscriptions", () =>
	Effect.scoped(
		Effect.gen(function* () {
			const logged: unknown[] = []
			const logger = Logger.make(function (options) {
				logged.push(options.message)
			})
			const started = yield* Deferred.make<void>()
			const subscriptions = Subscription.make<number, number>()((entry) => ({
				watch: entry(
					{},
					{
						modelToDependencies: () => ({}),
						dependenciesToStream: () =>
							Stream.fromEffect(Effect.logInfo("subscription-context").pipe(Effect.as(1))),
					}
				),
			}))
			const store = yield* Store.make(
				{ update: (model: number, message: number) => ({ model: model + message }), subscriptions },
				{
					model: 0,
					commands: [
						{
							name: "Context",
							effect: Deferred.succeed(started, undefined).pipe(
								Effect.andThen(Effect.sleep("1 second")),
								Effect.andThen(Effect.logInfo("command-context")),
								Effect.as(1)
							),
						},
					],
				}
			).pipe(Effect.provide(Logger.layer([logger])))
			yield* Deferred.await(started)
			yield* TestClock.adjust("1 second")
			expect(yield* Store.takeWhen(store, (model) => (model === 2 ? Option.some(model) : Option.none()))).toBe(2)
			expect(logged).toEqual(expect.arrayContaining([["subscription-context"], ["command-context"]]))
		})
	)
)
