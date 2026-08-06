import { Cause, Context, Effect, Layer, Match, Schema } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import * as Command from "./command"
import { m } from "./message"
import * as Store from "./store"

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

const AppendedFirst = m("AppendedFirst")
const AppendedSecond = m("AppendedSecond")
const AppendedCommandResult = m("AppendedCommandResult")
const AppendedInitResult = m("AppendedInitResult")
const AppendedChainedResult = m("AppendedChainedResult")
const AppendedAfterCrash = m("AppendedAfterCrash")
const ThrewInUpdate = m("ThrewInUpdate")
const BurnedBudget = m("BurnedBudget", { label: Schema.String })

const Message = Schema.Union([
	AppendedFirst,
	AppendedSecond,
	AppendedCommandResult,
	AppendedInitResult,
	AppendedChainedResult,
	AppendedAfterCrash,
	ThrewInUpdate,
	BurnedBudget,
])
type Message = typeof Message.Type

const Model = Schema.Struct({ log: Schema.Array(Schema.String) })
type Model = typeof Model.Type

type UpdateReturn = Store.Config<typeof Model, Message>["update"] extends (model: Model, message: Message) => infer R
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
			effect: Effect.succeed(AppendedCommandResult()),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			const nextModel = { log: [...model.log, message._tag] }
			return Match.value(message).pipe(
				Match.withReturnType<UpdateReturn>(),
				Match.tagsExhaustive({
					AppendedFirst: () => [nextModel, [produceCommandResult]],
					AppendedSecond: () => [nextModel, []],
					AppendedCommandResult: () => [nextModel, []],
					AppendedInitResult: () => [nextModel, []],
					AppendedChainedResult: () => [nextModel, []],
					AppendedAfterCrash: () => [nextModel, []],
					ThrewInUpdate: () => [nextModel, []],
					BurnedBudget: () => [nextModel, []],
				})
			)
		}

		const store = Store.boot({ schema: Model, update }, [{ log: [] }, []])

		try {
			store.dispatch(AppendedFirst())
			// AppendedFirst has already been processed on this stack; its Command
			// has been forked but its result cannot arrive before the next line.
			expect(processedLog).toEqual(["AppendedFirst"])
			store.dispatch(AppendedSecond())
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
			return [{ log: [...model.log, message._tag] }, []]
		}

		const store = Store.boot({ schema: Model, update }, [{ log: [] }, []])

		try {
			const labels = ["burn-1", "burn-2", "burn-3", "burn-4"]
			for (const label of labels) {
				store.dispatch(BurnedBudget({ label }))
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
			return [{ log: [...model.log, message._tag] }, []]
		}

		const store = Store.boot({ schema: Model, update }, [{ log: [] }, []])

		try {
			const labels = ["burn-1", "burn-2", "burn-3", "burn-4"]
			for (const label of labels) {
				store.dispatch(BurnedBudget({ label }))
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
			effect: Effect.succeed(AppendedChainedResult()),
		}

		const initCommand: Command.Command<Message> = {
			name: "ProduceInitResult",
			effect: Effect.succeed(AppendedInitResult()),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedInitResult") {
				return [nextModel, [chainedCommand]]
			}
			return [nextModel, []]
		}

		const store = Store.boot({ schema: Model, update }, [{ log: [] }, [initCommand]])

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
				return AppendedCommandResult()
			}),
		}

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			if (message._tag === "ThrewInUpdate") {
				throw new Error("boom in update")
			}
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedAfterCrash") {
				return [nextModel, [spiedCommand]]
			}
			return [nextModel, []]
		}

		const store = Store.boot(
			{
				schema: Model,
				update,
				onCrash(cause) {
					crashes.push(cause)
				},
			},
			[{ log: [] }, []]
		)

		try {
			store.dispatch(ThrewInUpdate())
			expect(crashes).toHaveLength(1)

			store.dispatch(AppendedAfterCrash())
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
				return AppendedCommandResult()
			}),
		}

		function update(model: Model, message: Message): UpdateReturn {
			if (message._tag === "ThrewInUpdate") {
				throw new Error("boom in update")
			}
			const nextModel = { log: [...model.log, message._tag] }
			if (message._tag === "AppendedFirst") {
				return [nextModel, [spiedCommand]]
			}
			return [nextModel, []]
		}

		const store = Store.boot(
			{
				schema: Model,
				update,
				onCrash: function () {},
			},
			[{ log: [] }, []]
		)

		try {
			store.dispatch(AppendedFirst())
			store.dispatch(ThrewInUpdate())

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
	const SucceededReadValue = m("SucceededReadValue", { value: Schema.String })
	const ClickedReadValue = m("ClickedReadValue")
	const ResourceMessage = Schema.Union([ClickedReadValue, SucceededReadValue])
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
		messages: [SucceededReadValue],
		execute: Effect.gen(function* () {
			const { value } = yield* ResourceService
			return SucceededReadValue({ value })
		}),
	})

	type ResourceUpdateReturn = readonly [
		ResourceModel,
		ReadonlyArray<Command.Command<ResourceMessage, never, ResourceService>>,
	]

	const resourceUpdate = (model: ResourceModel, message: ResourceMessage): ResourceUpdateReturn =>
		Match.value(message).pipe(
			Match.withReturnType<ResourceUpdateReturn>(),
			Match.tagsExhaustive({
				ClickedReadValue: () => [{ label: "reading" }, [ReadValue()]],
				SucceededReadValue: ({ value }) => [{ label: `${model.label} ${value}` }, []],
			})
		)

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
				schema: ResourceModel,
				update: resourceUpdate,
				layer: CountedResourceLive,
			},
			[{ label: "start" }, [ReadValue()]]
		)

		try {
			await vi.waitFor(function () {
				expect(store.getModel().label).toBe("start build-1")
			})

			store.dispatch(ClickedReadValue())

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
				schema: ResourceModel,
				update: resourceUpdate,
				layer: FailingResourceLive,
				onCrash(cause) {
					crashes.push(cause)
				},
			},
			[{ label: "start" }, [ReadValue(), ReadValue()]]
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
})

describe("dispose", function () {
	it("dispose is idempotent and silences the store afterwards", async function () {
		const processedLog: Array<string> = []

		function update(model: Model, message: Message): UpdateReturn {
			processedLog.push(message._tag)
			return [{ log: [...model.log, message._tag] }, []]
		}

		const store = Store.boot({ schema: Model, update }, [{ log: [] }, []])

		store.dispose()
		store.dispose()
		store.dispatch(AppendedFirst())

		await new Promise(function (resolve) {
			setTimeout(resolve, 20)
		})
		expect(processedLog).toEqual([])
		expect(store.getModel()).toEqual({ log: [] })
	})

	it("dispose interrupts in-flight Commands so their results never land", async function () {
		const Completed = m("Completed")
		const Start = m("Start")
		const LongMessage = Schema.Union([Start, Completed])
		type LongMessage = typeof LongMessage.Type

		const LongModel = Schema.Struct({ status: Schema.String })
		type LongModel = typeof LongModel.Type

		const LongRunning = Command.define("LongRunning", {
			messages: [Completed],
			execute: Effect.sleep("500 millis").pipe(Effect.as(Completed())),
		})

		type LongUpdateReturn = readonly [LongModel, ReadonlyArray<Command.Command<LongMessage>>]

		function update(model: LongModel, message: LongMessage): LongUpdateReturn {
			return Match.value(message).pipe(
				Match.withReturnType<LongUpdateReturn>(),
				Match.tagsExhaustive({
					Start: function () {
						return [{ status: "running" }, [LongRunning()]]
					},
					Completed: function () {
						return [{ status: "done" }, []]
					},
				})
			)
		}

		const store = Store.boot({ schema: LongModel, update }, [{ status: "idle" }, []])

		store.dispatch(Start())
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
		const CompletedDoChildWork = m("CompletedDoChildWork")
		const ChildMessage = Schema.Union([CompletedDoChildWork])
		type ChildMessage = typeof ChildMessage.Type

		const DoChildWork = Command.define("DoChildWork", {
			messages: [CompletedDoChildWork],
			execute: Effect.succeed(CompletedDoChildWork()),
		})

		const GotChildMessage = m("GotChildMessage", { message: ChildMessage })
		const ParentMessage = Schema.Union([GotChildMessage])
		type ParentMessage = typeof ParentMessage.Type

		const ParentModel = Schema.Struct({ label: Schema.String })
		type ParentModel = typeof ParentModel.Type

		type ParentUpdateReturn = readonly [ParentModel, ReadonlyArray<Command.Command<ParentMessage>>]

		function update(_model: ParentModel, message: ParentMessage): ParentUpdateReturn {
			return Match.value(message).pipe(
				Match.withReturnType<ParentUpdateReturn>(),
				Match.tagsExhaustive({
					GotChildMessage: function ({ message: childMessage }) {
						return Match.value(childMessage).pipe(
							Match.withReturnType<ParentUpdateReturn>(),
							Match.tagsExhaustive({
								CompletedDoChildWork: () => [{ label: "child done" }, []],
							})
						)
					},
				})
			)
		}

		const store = Store.boot({ schema: ParentModel, update }, [
			{ label: "start" },
			Command.mapMessages([DoChildWork()], function (childMessage) {
				return GotChildMessage({ message: childMessage })
			}),
		])

		try {
			await vi.waitFor(function () {
				expect(store.getModel().label).toBe("child done")
			})
		} finally {
			store.dispose()
		}
	})
})
