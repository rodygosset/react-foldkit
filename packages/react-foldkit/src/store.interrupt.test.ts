import { describe, it } from "@effect/vitest"
import { Array, Context, Deferred, Effect, Fiber, Layer, Option, Schema } from "effect"
import { expect, vi } from "vitest"
import * as Command from "./command"
import {
	CurrentInterruptRegistry as __CurrentRegistry,
	makeInterruptRegistry as __makeRegistry,
	type InterruptRegistry as __Registry,
} from "./internal/interrupt"
import { defineMessageUnion } from "./message"
import * as Store from "./store"
import { modifyFields } from "./struct"
import type * as Update from "./update"

/**
 * Interrupt registry contract — mirrored from Foldkit's
 * command/interruptible/interruptible.test.ts (it.effect + provideRegistry).
 *
 * Plus one store-wiring case: Store.boot must provide the registry so
 * interruptible Commands forked through the store can be cancelled.
 */

const Message = defineMessageUnion({
	CompletedWork: {},
	SucceededTask: { taskId: Schema.Finite },
})

const provideRegistry =
	(registry: __Registry) =>
	<A, E, R>(effect: Effect.Effect<A, E, R>) =>
		Effect.provideService(effect, __CurrentRegistry, registry)

describe("interruptible Command.define", function () {
	it("derives the key from args at construction, prefixed by the Command name", function () {
		const RunTask = Command.define("RunTask", {
			args: { taskId: Schema.Finite, label: Schema.String },
			messages: [Message.SucceededTask],
			interrupt: {
				keyFields: ["taskId"],
				toKey: ({ taskId }) => taskId.toString(),
			},
			execute: ({ taskId }) => Effect.succeed(Message.SucceededTask({ taskId })),
		})

		const instance = RunTask({ taskId: 7, label: "seven" })
		expect(instance.name).toBe("RunTask")
		expect(instance.args).toEqual({ taskId: 7, label: "seven" })
		expect(instance.key).toBe("RunTask:7")

		const interrupt = RunTask.Interrupt({ taskId: 7 }, (outcome) => outcome)
		expect(interrupt.name).toBe("RunTask.Interrupt")
		expect(interrupt.args).toEqual({ taskId: 7 })
		expect(interrupt.interruptsKey).toBe("RunTask:7")
	})

	it("uses the Command name as the key on the no-args form", function () {
		const SyncLibrary = Command.define("SyncLibrary", {
			messages: [Message.CompletedWork],
			interrupt: true,
			execute: Effect.succeed(Message.CompletedWork()),
		})

		const instance = SyncLibrary()
		expect(instance.name).toBe("SyncLibrary")
		expect(instance.key).toBe("SyncLibrary")

		const interrupt = SyncLibrary.Interrupt((outcome) => outcome)
		expect(interrupt.name).toBe("SyncLibrary.Interrupt")
		expect(interrupt.interruptsKey).toBe("SyncLibrary")
	})

	it.effect("interrupts the in-flight holder and reports Interrupted", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()
			let didProduceResult = false

			const RunForever = Command.define("RunForever", {
				messages: [Message.CompletedWork],
				interrupt: true,
				execute: Effect.as(Effect.never, Message.CompletedWork()),
			})

			const fiber = yield* Effect.forkChild(
				RunForever().effect.pipe(
					Effect.tap(() =>
						Effect.sync(function () {
							didProduceResult = true
						})
					),
					provideRegistry(registry)
				)
			)
			yield* Effect.yieldNow

			expect(Array.isReadonlyArrayNonEmpty(registry.lookup("RunForever"))).toBe(true)

			const outcome = yield* RunForever.Interrupt((outcome) => outcome).effect.pipe(provideRegistry(registry))

			expect(outcome._tag).toBe("Interrupted")
			expect(didProduceResult).toBe(false)
			expect(Array.isReadonlyArrayEmpty(registry.lookup("RunForever"))).toBe(true)

			const exit = yield* Fiber.await(fiber)
			expect(exit._tag).toBe("Failure")
		})
	)

	it.effect("reports NotFound when no Command holds the key", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()

			const RunForever = Command.define("RunForever", {
				messages: [Message.CompletedWork],
				interrupt: true,
				execute: Effect.as(Effect.never, Message.CompletedWork()),
			})

			const outcome = yield* RunForever.Interrupt((outcome) => outcome).effect.pipe(provideRegistry(registry))

			expect(outcome._tag).toBe("NotFound")
		})
	)

	it.effect("reports NotFound after the holder completed", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()

			const RunTask = Command.define("RunTask", {
				args: { taskId: Schema.Finite },
				messages: [Message.SucceededTask],
				interrupt: {
					keyFields: ["taskId"],
					toKey: ({ taskId }) => String(taskId),
				},
				execute: ({ taskId }) => Effect.succeed(Message.SucceededTask({ taskId })),
			})

			const message = yield* RunTask({ taskId: 1 }).effect.pipe(provideRegistry(registry))
			expect(message).toEqual(Message.SucceededTask({ taskId: 1 }))

			const outcome = yield* RunTask.Interrupt({ taskId: 1 }, (outcome) => outcome).effect.pipe(
				provideRegistry(registry)
			)

			expect(outcome._tag).toBe("NotFound")
		})
	)

	it.effect("only interrupts the holder of the derived key", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()
			const interruptedTaskIds: Array<number> = []

			const RunTask = Command.define("RunTask", {
				args: { taskId: Schema.Finite },
				messages: [Message.SucceededTask],
				interrupt: {
					keyFields: ["taskId"],
					toKey: ({ taskId }) => String(taskId),
				},
				execute: ({ taskId }) =>
					Effect.onInterrupt(Effect.as(Effect.never, Message.SucceededTask({ taskId })), () =>
						Effect.sync(function () {
							interruptedTaskIds.push(taskId)
						})
					),
			})

			const firstFiber = yield* Effect.forkChild(RunTask({ taskId: 1 }).effect.pipe(provideRegistry(registry)))
			const secondFiber = yield* Effect.forkChild(RunTask({ taskId: 2 }).effect.pipe(provideRegistry(registry)))
			yield* Effect.yieldNow

			const outcome = yield* RunTask.Interrupt({ taskId: 2 }, (outcome) => outcome).effect.pipe(
				provideRegistry(registry)
			)

			expect(outcome._tag).toBe("Interrupted")
			expect(interruptedTaskIds).toEqual([2])
			expect(Array.isReadonlyArrayNonEmpty(registry.lookup("RunTask:1"))).toBe(true)
			expect(Array.isReadonlyArrayEmpty(registry.lookup("RunTask:2"))).toBe(true)

			yield* Fiber.interrupt(firstFiber)
			yield* Fiber.await(secondFiber)
		})
	)

	it.effect("same-key invocations run concurrently and Interrupt stops every holder", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()
			const events: Array<string> = []
			let runCount = 0

			const Watch = Command.define("Watch", {
				messages: [Message.CompletedWork],
				interrupt: true,
				execute: Effect.suspend(function () {
					runCount = runCount + 1
					const runId = runCount
					events.push(`started:${runId}`)
					return Effect.onInterrupt(Effect.as(Effect.never, Message.CompletedWork()), () =>
						Effect.sync(function () {
							events.push(`interrupted:${runId}`)
						})
					)
				}),
			})

			const firstFiber = yield* Effect.forkChild(Watch().effect.pipe(provideRegistry(registry)))
			const secondFiber = yield* Effect.forkChild(Watch().effect.pipe(provideRegistry(registry)))
			yield* Effect.yieldNow

			expect(events).toEqual(["started:1", "started:2"])
			expect(registry.lookup("Watch")).toHaveLength(2)

			const outcome = yield* Watch.Interrupt((outcome) => outcome).effect.pipe(provideRegistry(registry))

			expect(outcome._tag).toBe("Interrupted")
			expect(events).toEqual(["started:1", "started:2", "interrupted:1", "interrupted:2"])
			expect(Array.isReadonlyArrayEmpty(registry.lookup("Watch"))).toBe(true)

			yield* Fiber.await(firstFiber)
			yield* Fiber.await(secondFiber)
		})
	)

	it.effect("releases the key when the Effect fails", () =>
		Effect.gen(function* () {
			const registry = __makeRegistry()

			const FailingTask = Command.define("FailingTask", {
				messages: [Message.CompletedWork],
				interrupt: true,
				execute: Effect.map(Effect.fail("boom"), () => Message.CompletedWork()),
			})

			const exit = yield* Effect.exit(FailingTask().effect.pipe(provideRegistry(registry)))

			expect(exit._tag).toBe("Failure")
			expect(Array.isReadonlyArrayEmpty(registry.lookup("FailingTask"))).toBe(true)
		})
	)
})

describe("store interrupt registry wiring", function () {
	it.live("provides the interrupt registry so Interrupt stops an in-flight store Command", () =>
		Effect.gen(function* () {
			const WiringMessage = defineMessageUnion({
				Completed: {},
				GotOutcome: { tag: Schema.String },
				Start: {},
				Cancel: {},
			})
			type WiringMessage = typeof WiringMessage.Type

			const Model = Schema.Struct({
				status: Schema.String,
				outcome: Schema.NullOr(Schema.String),
			})
			type Model = typeof Model.Type

			const RunForever = Command.define("RunForever", {
				messages: [WiringMessage.Completed],
				interrupt: true,
				execute: Effect.as(Effect.never, WiringMessage.Completed()),
			})

			type UpdateReturn = Update.Return<Model, WiringMessage>

			const update = (model: Model, message: WiringMessage): UpdateReturn =>
				WiringMessage.match<UpdateReturn>(message, {
					Start: () => ({
						model: modifyFields(model, { status: () => "running", outcome: () => null }),
						commands: [RunForever()],
					}),
					Cancel: () => ({
						model,
						commands: [RunForever.Interrupt((outcome) => WiringMessage.GotOutcome({ tag: outcome._tag }))],
					}),
					Completed: () => ({
						model: modifyFields(model, { status: () => "done", outcome: () => null }),
					}),
					GotOutcome: ({ tag }) => ({
						model: modifyFields(model, { status: () => "cancelled", outcome: () => tag }),
					}),
				})

			const store = Store.boot({ update }, { model: { status: "idle", outcome: null } })

			try {
				store.dispatch(WiringMessage.Start())
				expect(store.getModel().status).toBe("running")

				// Yield so the Command fiber can register under its interrupt key.
				yield* Effect.callback<void>(function (resume) {
					queueMicrotask(() => resume(Effect.void))
				})
				yield* Effect.callback<void>(function (resume) {
					queueMicrotask(() => resume(Effect.void))
				})

				store.dispatch(WiringMessage.Cancel())

				yield* Effect.promise(() =>
					vi.waitFor(function () {
						expect(store.getModel()).toEqual({ status: "cancelled", outcome: "Interrupted" })
					})
				)

				yield* Effect.sleep("30 millis")
				expect(store.getModel().status).toBe("cancelled")
			} finally {
				yield* store.dispose()
			}
		})
	)
})

it.live("isolates the same upstream interrupt key across two Stores", () =>
	Effect.gen(function* () {
		const events: string[] = []
		const firstStarted = yield* Deferred.make<void>()
		const secondStarted = yield* Deferred.make<void>()
		class Work extends Context.Service<
			Work,
			{ readonly name: string; readonly started: Deferred.Deferred<void> }
		>()("InterruptIsolationWork") {}
		const Run = Command.define("SharedInterruptKey", {
			messages: [Message.CompletedWork],
			interrupt: true,
			execute: Effect.flatMap(Work, ({ name, started }) =>
				Deferred.succeed(started, undefined).pipe(
					Effect.andThen(Effect.never),
					Effect.ensuring(Effect.sync(() => events.push(name)))
				)
			),
		})
		type IsolationMessage =
			{ readonly _tag: "Cancel" } | { readonly _tag: "Outcome"; readonly tag: string } | typeof Message.Type
		const update = (model: string, message: IsolationMessage): Update.Return<string, IsolationMessage, Work> =>
			message._tag === "Cancel"
				? {
						model,
						commands: [
							Run.Interrupt((outcome): IsolationMessage => ({ _tag: "Outcome", tag: outcome._tag })),
						],
					}
				: { model: message._tag === "Outcome" ? message.tag : "Completed" }
		const first = yield* Store.make(
			{ update, layer: Layer.succeed(Work, { name: "first", started: firstStarted }) },
			{ model: "Running", commands: [Run()] }
		)
		const second = yield* Store.make(
			{ update, layer: Layer.succeed(Work, { name: "second", started: secondStarted }) },
			{ model: "Running", commands: [Run()] }
		)
		yield* Deferred.await(firstStarted)
		yield* Deferred.await(secondStarted)
		first.dispatch({ _tag: "Cancel" })
		yield* Store.takeWhen(first, (model) => (model === "Interrupted" ? Option.some(model) : Option.none()))
		expect(events).toEqual(["first"])
		expect(second.getModel()).toBe("Running")
		yield* second.dispose()
		expect(events).toEqual(["first", "second"])
	})
)
