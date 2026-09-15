import { describe, it } from "@effect/vitest"
import { Cause, Context, Effect, Fiber, Layer, Option, Schema } from "effect"
import { afterEach, expect, vi } from "vitest"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import * as Store from "./store"
import type * as Update from "./update"

/**
 * Pins the message-processing / resources / dispose contract of Store.boot,
 * mirrored from Foldkit's runtime tests (messageProcessing, resources, embed,
 * commandMessageMappers) with React/VDOM assertions replaced by getModel and
 * processedLog.
 *
 * - Messages are processed synchronously at dispatch time, in arrival order.
 * - A Command result never jumps ahead of an earlier Message.
 * - Over-budget sync bursts defer via MessageChannel and still complete in order.
 * - Init Command results arrive after boot; the init Model is visible first.
 * - A crash is terminal: later dispatches are dropped; pre-crash forks do not run.
 * - Layer builds once, is shared across Commands, and releases on dispose.
 * - mapMessages lifts child results into the parent Message space.
 */

const Message = defineMessageUnion({
	AppendedFirst: {},
	AppendedSecond: {},
	AppendedCommandResult: {},
	AppendedInitResult: {},
	AppendedChainedResult: {},
	AppendedAfterCrash: {},
	ThrewInUpdate: {},
	BurnedBudget: { label: Schema.String },
})
type Message = typeof Message.Type

const Model = Schema.Struct({ log: Schema.Array(Schema.String) })
type Model = typeof Model.Type

type UpdateReturn = Store.Config<Model, Message>["update"] extends (model: Model, message: Message) => infer R
	? R
	: never

// NOTE: the store's drain budget is 5ms. Each burn advances the mocked
// clock 4ms, so two burns cross the budget and the third dispatch defers.
const BURN_MS = 4
const OVER_BUDGET_GAP_MS = 6

const freezeDrainClock = () => vi.spyOn(performance, "now").mockImplementation(() => 0)

afterEach(function () {
	vi.restoreAllMocks()
})

describe("message processing", function () {
	it("processes Messages synchronously at dispatch, in arrival order, with Command results following", async function () {
		const processedLog: Array<string> = []
		const nowSpy = freezeDrainClock()

		const produceCommandResult: Command.Command<Message> = {
			name: "ProduceCommandResult",
			effect: Effect.succeed(Message.AppendedCommandResult()),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			const nextModel = { log: [...model.log, message._tag] }
			return Message.match(message, {
				AppendedFirst: () => ({ model: nextModel, commands: [produceCommandResult] }),
				AppendedSecond: () => ({ model: nextModel }),
				AppendedCommandResult: () => ({ model: nextModel }),
				AppendedInitResult: () => ({ model: nextModel }),
				AppendedChainedResult: () => ({ model: nextModel }),
				AppendedAfterCrash: () => ({ model: nextModel }),
				ThrewInUpdate: () => ({ model: nextModel }),
				BurnedBudget: () => ({ model: nextModel }),
			})
		}

		const store = Store.boot({ update }, { model: { log: [] } })

		try {
			store.dispatch(Message.AppendedFirst())
			// AppendedFirst has already been processed on this stack; its Command
			// has been forked but its result cannot arrive before the next line.
			expect(processedLog).toEqual(["AppendedFirst"])
			store.dispatch(Message.AppendedSecond())
			expect(processedLog).toEqual(["AppendedFirst", "AppendedSecond"])

			await vi.waitFor(function () {
				expect(processedLog).toEqual(["AppendedFirst", "AppendedSecond", "AppendedCommandResult"])
			})
		} finally {
			nowSpy.mockRestore()
			store.dispose()
		}
	})

	it("defers the remainder of an over-budget synchronous burst to a later task and processes all of it in order", async function () {
		const processedLog: Array<string> = []
		let fakeNow = 0
		const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => fakeNow)

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag === "BurnedBudget" ? message.label : message._tag)
			if (message._tag === "BurnedBudget") {
				fakeNow += BURN_MS
			}
			return { model: { log: [...model.log, message._tag] } }
		}

		const store = Store.boot({ update }, { model: { log: [] } })

		try {
			const labels = ["burn-1", "burn-2", "burn-3", "burn-4"]
			for (const label of labels) {
				store.dispatch(Message.BurnedBudget({ label }))
			}

			// The dispatch loop holds the stack, so the mocked clock never
			// advances between drains and no idle-gap reset can fire: the first
			// two burns fit the budget, the second two must defer to a later
			// task.
			expect(processedLog).toEqual(["burn-1", "burn-2"])

			await vi.waitFor(function () {
				expect(processedLog).toEqual(labels)
			})
		} finally {
			nowSpy.mockRestore()
			store.dispose()
		}
	})

	it("resets the drain budget when the browser had control between dispatches", async function () {
		const processedLog: Array<string> = []
		let fakeNow = 0
		const nowSpy = vi.spyOn(performance, "now").mockImplementation(function () {
			return fakeNow
		})

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag === "BurnedBudget" ? message.label : message._tag)
			if (message._tag === "BurnedBudget") {
				fakeNow += BURN_MS
			}
			return { model: { log: [...model.log, message._tag] } }
		}

		const store = Store.boot({ update }, { model: { log: [] } })

		try {
			const labels = ["burn-1", "burn-2", "burn-3", "burn-4"]
			for (const label of labels) {
				store.dispatch(Message.BurnedBudget({ label }))
				// An idle gap wider than the budget between dispatches means the
				// browser had the stack back; the accumulated budget resets and no
				// burn ever defers.
				fakeNow += OVER_BUDGET_GAP_MS
			}

			expect(processedLog).toEqual(labels)
		} finally {
			nowSpy.mockRestore()
			store.dispose()
		}
	})

	it("processes init Command results after boot, exposing the init Model first, and runs Commands chained from them", async function () {
		const processedLog: Array<string> = []

		const chainedCommand: Command.Command<Message> = {
			name: "ProduceChainedResult",
			effect: Effect.succeed(Message.AppendedChainedResult()),
		}

		const initCommand: Command.Command<Message> = {
			name: "ProduceInitResult",
			effect: Effect.succeed(Message.AppendedInitResult()),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedInitResult") {
				return { model: nextModel, commands: [chainedCommand] }
			}
			return { model: nextModel }
		}

		const store = Store.boot({ update }, { model: { log: [] }, commands: [initCommand] })

		try {
			// Boot schedules init Commands as microtasks; the init Model is
			// visible on this stack before any result can be processed.
			expect(store.getModel()).toEqual({ log: [] })

			await vi.waitFor(function () {
				expect(processedLog).toEqual(["AppendedInitResult", "AppendedChainedResult"])
			})
			expect(store.getModel()).toEqual({
				log: ["AppendedInitResult", "AppendedChainedResult"],
			})
		} finally {
			store.dispose()
		}
	})

	it("stops processing after a crash: later dispatches are dropped and fork no Commands", async function () {
		const processedLog: Array<string> = []
		const crashes: Array<Cause.Cause<unknown>> = []
		const commandEffectSpy = vi.fn()
		const nowSpy = freezeDrainClock()

		const spiedCommand: Command.Command<Message> = {
			name: "ProduceSpiedResult",
			effect: Effect.sync(function () {
				commandEffectSpy()
				return Message.AppendedCommandResult()
			}),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			if (message._tag === "ThrewInUpdate") {
				throw new Error("boom in update")
			}
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedAfterCrash") {
				return { model: nextModel, commands: [spiedCommand] }
			}
			return { model: nextModel }
		}

		const store = Store.boot(
			{
				update,
				onCrash(cause) {
					crashes.push(cause)
				},
			},
			{ model: { log: [] } }
		)

		try {
			store.dispatch(Message.ThrewInUpdate())
			expect(crashes).toHaveLength(1)

			store.dispatch(Message.AppendedAfterCrash())
			expect(processedLog).toEqual(["ThrewInUpdate"])

			await new Promise(function (resolve) {
				setTimeout(resolve, 20)
			})
			expect(processedLog).toEqual(["ThrewInUpdate"])
			expect(commandEffectSpy).not.toHaveBeenCalled()
		} finally {
			nowSpy.mockRestore()
			store.dispose()
		}
	})

	it("does not run a Command forked by a Message processed just before a crash", async function () {
		const commandEffectSpy = vi.fn()
		const nowSpy = freezeDrainClock()

		const spiedCommand: Command.Command<Message> = {
			name: "ProduceSpiedResult",
			effect: Effect.sync(function () {
				commandEffectSpy()
				return Message.AppendedCommandResult()
			}),
		}

		function update(model: Model, message: Message): UpdateReturn {
			if (message._tag === "ThrewInUpdate") {
				throw new Error("boom in update")
			}
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedFirst") {
				return { model: nextModel, commands: [spiedCommand] }
			}
			return { model: nextModel }
		}

		const store = Store.boot(
			{
				update,
				onCrash: function () {},
			},
			{ model: { log: [] } }
		)

		try {
			store.dispatch(Message.AppendedFirst())
			store.dispatch(Message.ThrewInUpdate())

			await new Promise(function (resolve) {
				setTimeout(resolve, 20)
			})
			expect(commandEffectSpy).not.toHaveBeenCalled()
		} finally {
			nowSpy.mockRestore()
			store.dispose()
		}
	})
})

describe("resources", function () {
	const ResourceMessage = defineMessageUnion({
		SucceededReadValue: { value: Schema.String },
		ClickedReadValue: {},
	})
	type ResourceMessage = typeof ResourceMessage.Type

	const ResourceModel = Schema.Struct({ label: Schema.String })
	type ResourceModel = typeof ResourceModel.Type

	type ResourceShape = Readonly<{ value: string }>

	class ResourceService extends Context.Service<ResourceService, ResourceShape>()("ResourceService") {}

	const LAYER_BUILD_ERROR = "RESOURCE_URL environment variable is not set"

	const FailingResourceLive = Layer.sync(ResourceService, function (): ResourceShape {
		throw new Error(LAYER_BUILD_ERROR)
	})

	const ReadValue = Command.define("ReadValue", {
		messages: [ResourceMessage.SucceededReadValue],
		execute: Effect.gen(function* () {
			const { value } = yield* ResourceService
			return ResourceMessage.SucceededReadValue({ value })
		}),
	})

	type ResourceUpdateReturn = Update.Return<ResourceModel, ResourceMessage, ResourceService>

	const resourceUpdate = (model: ResourceModel, message: ResourceMessage): ResourceUpdateReturn =>
		ResourceMessage.match<ResourceUpdateReturn>(message, {
			ClickedReadValue: () => ({ model: { label: "reading" }, commands: [ReadValue()] }),
			SucceededReadValue: ({ value }) => ({ model: { label: `${model.label} ${value}` } }),
		})

	it("builds the Layer once, shares it across Commands, and releases it at teardown", async function () {
		let buildCount = 0
		let releaseCount = 0

		const CountedResourceLive = Layer.effect(
			ResourceService,
			Effect.acquireRelease(
				Effect.sync(function (): ResourceShape {
					buildCount += 1
					return { value: `build-${buildCount}` }
				}),
				() =>
					Effect.sync(function () {
						releaseCount += 1
					})
			)
		)

		const store = Store.boot(
			{
				update: resourceUpdate,
				layer: CountedResourceLive,
			},
			{ model: { label: "start" }, commands: [ReadValue()] }
		)

		try {
			await vi.waitFor(function () {
				expect(store.getModel().label).toBe("start build-1")
			})

			store.dispatch(ResourceMessage.ClickedReadValue())

			await vi.waitFor(function () {
				expect(store.getModel().label).toBe("reading build-1")
			})
			expect(buildCount).toBe(1)
			expect(releaseCount).toBe(0)
		} finally {
			store.dispose()
		}

		await vi.waitFor(function () {
			expect(releaseCount).toBe(1)
		})
	})

	it("reports the crash once when the Layer fails to build for an init Command", async function () {
		const crashes: Array<Cause.Cause<unknown>> = []

		const store = Store.boot(
			{
				update: resourceUpdate,
				layer: FailingResourceLive,
				onCrash(cause) {
					crashes.push(cause)
				},
			},
			{ model: { label: "start" }, commands: [ReadValue(), ReadValue()] }
		)

		try {
			await vi.waitFor(function () {
				expect(crashes).toHaveLength(1)
			})
			expect(store.getModel()).toEqual({ label: "start" })
		} finally {
			store.dispose()
		}
	})

	it("rejects Layer.empty when update requires services", function () {
		function typeConfig(_config: Store.Config<ResourceModel, ResourceMessage, ResourceService>): void {}

		typeConfig({
			update: resourceUpdate,
			layer: Layer.succeed(ResourceService, { value: "ok" }),
		})

		// @ts-expect-error Layer.empty does not provide ResourceService
		typeConfig({ update: resourceUpdate, layer: Layer.empty })

		// @ts-expect-error layer is required when update needs services
		typeConfig({ update: resourceUpdate })
	})
})

describe("dispose", function () {
	it("dispose is idempotent and silences the store afterwards", async function () {
		const processedLog: Array<string> = []

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			return { model: { log: [...model.log, message._tag] } }
		}

		const store = Store.boot({ update }, { model: { log: [] } })

		store.dispose()
		store.dispose()
		store.dispatch(Message.AppendedFirst())

		await new Promise(function (resolve) {
			setTimeout(resolve, 20)
		})
		expect(processedLog).toEqual([])
		expect(store.getModel()).toEqual({ log: [] })
	})

	it("dispose interrupts in-flight Commands so their results never land", async function () {
		const LongMessage = defineMessageUnion({
			Completed: {},
			Start: {},
		})
		type LongMessage = typeof LongMessage.Type

		const LongModel = Schema.Struct({ status: Schema.String })
		type LongModel = typeof LongModel.Type

		const LongRunning = Command.define("LongRunning", {
			messages: [LongMessage.Completed],
			execute: Effect.sleep("500 millis").pipe(Effect.as(LongMessage.Completed())),
		})

		type LongUpdateReturn = Update.Return<LongModel, LongMessage>

		function update(_model: LongModel, message: LongMessage): LongUpdateReturn {
			return LongMessage.match<LongUpdateReturn>(message, {
				Start: () => ({ model: { status: "running" }, commands: [LongRunning()] }),
				Completed: () => ({ model: { status: "done" } }),
			})
		}

		const store = Store.boot({ update }, { model: { status: "idle" } })

		store.dispatch(LongMessage.Start())
		expect(store.getModel()).toEqual({ status: "running" })
		store.dispose()

		await new Promise(function (resolve) {
			setTimeout(resolve, 100)
		})
		expect(store.getModel()).toEqual({ status: "running" })
	})
})

describe("command message mappers", function () {
	it("dispatches a mapped Command result in the parent Message space", async function () {
		const ChildMessage = defineMessageUnion({
			CompletedDoChildWork: {},
		})
		type ChildMessage = typeof ChildMessage.Type

		const DoChildWork = Command.define("DoChildWork", {
			messages: [ChildMessage.CompletedDoChildWork],
			execute: Effect.succeed(ChildMessage.CompletedDoChildWork()),
		})

		const ParentMessage = defineMessageUnion({
			GotChildMessage: { message: ChildMessage },
		})
		type ParentMessage = typeof ParentMessage.Type

		const ParentModel = Schema.Struct({ label: Schema.String })
		type ParentModel = typeof ParentModel.Type

		type ParentUpdateReturn = Update.Return<ParentModel, ParentMessage>

		function update(_model: ParentModel, message: ParentMessage): ParentUpdateReturn {
			return ParentMessage.match<ParentUpdateReturn>(message, {
				GotChildMessage: ({ message: childMessage }) =>
					ChildMessage.match<ParentUpdateReturn>(childMessage, {
						CompletedDoChildWork: () => ({ model: { label: "child done" } }),
					}),
			})
		}

		const store = Store.boot(
			{ update },
			{
				model: { label: "start" },
				commands: Command.mapMessages([DoChildWork()], (childMessage) =>
					ParentMessage.GotChildMessage({ message: childMessage })
				),
			}
		)

		try {
			await vi.waitFor(function () {
				expect(store.getModel().label).toBe("child done")
			})
		} finally {
			store.dispose()
		}
	})

	it.effect("takeWhen succeeds with the current Model when pick already matches", () =>
		Effect.gen(function* () {
			const CountMessage = defineMessageUnion({
				Increment: {},
			})
			type CountMessage = typeof CountMessage.Type
			const store = yield* Effect.acquireRelease(
				Effect.sync(() =>
					Store.boot(
						{
							update: (model: { count: number }, _message: CountMessage) => ({
								model: { count: model.count + 1 },
							}),
						},
						{ model: { count: 0 } }
					)
				),
				(live) => Effect.sync(() => live.dispose())
			)
			const n = yield* Store.takeWhen(store, (model) =>
				model.count === 0 ? Option.some(model.count) : Option.none()
			)
			expect(n).toBe(0)
		})
	)

	it.effect("takeWhen waits until a later Model matches pick", () =>
		Effect.gen(function* () {
			const CountMessage = defineMessageUnion({
				Increment: {},
			})
			type CountMessage = typeof CountMessage.Type
			const store = yield* Effect.acquireRelease(
				Effect.sync(() =>
					Store.boot(
						{
							update: (model: { count: number }, _message: CountMessage) => ({
								model: { count: model.count + 1 },
							}),
						},
						{ model: { count: 0 } }
					)
				),
				(live) => Effect.sync(() => live.dispose())
			)
			const fiber = yield* Effect.forkChild(
				Store.takeWhen(store, (model) => (model.count >= 2 ? Option.some(model.count) : Option.none()))
			)
			store.dispatch(CountMessage.Increment())
			store.dispatch(CountMessage.Increment())
			const n = yield* Fiber.join(fiber)
			expect(n).toBe(2)
		})
	)

	it.effect("takeWhen fails when the store is disposed before pick hits", () =>
		Effect.gen(function* () {
			const CountMessage = defineMessageUnion({
				Increment: {},
			})
			type CountMessage = typeof CountMessage.Type
			const store = yield* Effect.acquireRelease(
				Effect.sync(() =>
					Store.boot(
						{
							update: (model: { count: number }, _message: CountMessage) => ({
								model: { count: model.count + 1 },
							}),
						},
						{ model: { count: 0 } }
					)
				),
				(live) => Effect.sync(() => live.dispose())
			)
			const fiber = yield* Effect.forkChild(
				Store.takeWhen(store, (model) => (model.count >= 99 ? Option.some(model.count) : Option.none()))
			)
			store.dispose()
			const error = yield* Effect.flip(Fiber.join(fiber))
			expect(error).toBeInstanceOf(Store.Disposed)
		})
	)
})
