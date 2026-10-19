import { Array, Context, Effect, Layer, Option, Order, Queue, Schema, Stream } from "effect"
import * as AsyncData from "foldkit/asyncData"
import * as Command from "foldkit/command"
import * as Query from "foldkit/experimental/query"
import { defineMessageUnion } from "foldkit/message"
import * as Subscription from "foldkit/subscription"
import { type Case, Event, send, Trace, until } from "./harness"

const updated = (observed: unknown) => Event.Updated({ observed })

/** Logs a Stream's lifetime under `key`, so start, stop, and restart show up in the trace. */
const logged =
	(record: Trace["Service"]["record"], key: string) =>
	<A>(stream: Stream.Stream<A>): Stream.Stream<A> =>
		stream.pipe(
			Stream.onStart(Effect.sync(() => record(Event.Started({ key })))),
			Stream.ensuring(Effect.sync(() => record(Event.Stopped({ key }))))
		)

// 1. Init: the init Model is in place and init Commands deliver their Messages first.
const InitMessage = defineMessageUnion({ Loaded: { value: Schema.Finite } })
type InitMessage = typeof InitMessage.Type
const Load = Command.define("Load", {
	messages: [InitMessage.Loaded],
	execute: Effect.succeed(InitMessage.Loaded({ value: 1 })),
})

export const init: Case<number, InitMessage> = {
	program: Effect.succeed({
		Model: Schema.Finite,
		Message: InitMessage,
		init: () => ({ model: 0, commands: [Load()] }),
		update: (model, message) => ({ model: model + message.value }),
		observe: (message, model) => ({ message, model }),
		resources: Layer.empty,
		initialized: until.updated(1),
		steps: [],
	}),
	expected: [updated({ message: InitMessage.Loaded({ value: 1 }), model: 1 })],
}

// 2. FIFO: Messages sent together are applied in the order they were sent.
const ListModel = Schema.Array(Schema.Finite)
type ListModel = typeof ListModel.Type
const FifoMessage = defineMessageUnion({ Added: { value: Schema.Finite } })
type FifoMessage = typeof FifoMessage.Type

export const fifo: Case<ListModel, FifoMessage> = {
	program: Effect.succeed({
		Model: ListModel,
		Message: FifoMessage,
		init: () => ({ model: [] }),
		update: (model, { value }) => ({ model: Array.append(model, value) }),
		observe: (message, model) => ({ message, model }),
		resources: Layer.empty,
		initialized: until.initialized,
		steps: [
			{
				act: Effect.forEach([1, 2, 3], (value) => send(FifoMessage.Added({ value })), { discard: true }),
				until: until.updated(3),
			},
		],
	}),
	expected: [
		updated({ message: FifoMessage.Added({ value: 1 }), model: [1] }),
		updated({ message: FifoMessage.Added({ value: 2 }), model: [1, 2] }),
		updated({ message: FifoMessage.Added({ value: 3 }), model: [1, 2, 3] }),
	],
}

// 3. Command chain: a Command's Message arrives after the Message whose update returned it.
const ChainMessage = defineMessageUnion({ Started: {}, Stepped: { step: Schema.Finite } })
type ChainMessage = typeof ChainMessage.Type
const Advance = Command.define("Advance", {
	args: { step: Schema.Finite },
	messages: [ChainMessage.Stepped],
	execute: ({ step }) => Effect.succeed(ChainMessage.Stepped({ step })),
})

export const commandChain: Case<ListModel, ChainMessage> = {
	program: Effect.succeed({
		Model: ListModel,
		Message: ChainMessage,
		init: () => ({ model: [] }),
		update: (model, message) =>
			ChainMessage.match(message, {
				Started: () => ({ model, commands: [Advance({ step: 1 })] }),
				Stepped: ({ step }) => ({
					model: Array.append(model, step),
					commands: step < 2 ? [Advance({ step: step + 1 })] : [],
				}),
			}),
		observe: (message, model) => ({ message, model }),
		resources: Layer.empty,
		initialized: until.initialized,
		steps: [{ act: send(ChainMessage.Started()), until: until.updated(3) }],
	}),
	expected: [
		updated({ message: ChainMessage.Started(), model: [] }),
		updated({ message: ChainMessage.Stepped({ step: 1 }), model: [1] }),
		updated({ message: ChainMessage.Stepped({ step: 2 }), model: [1, 2] }),
	],
}

// 4. Batch: every Command in one batch delivers. Foldkit promises no order within a batch.
const BatchMessage = defineMessageUnion({ Fired: {}, ReceivedA: {}, ReceivedB: {} })
type BatchMessage = typeof BatchMessage.Type
const EmitA = Command.define("EmitA", { messages: [BatchMessage.ReceivedA], execute: Effect.succeed(BatchMessage.ReceivedA()) })
const EmitB = Command.define("EmitB", { messages: [BatchMessage.ReceivedB], execute: Effect.succeed(BatchMessage.ReceivedB()) })
const byObservedTag = Order.mapInput(Order.String, (event: Event) => (event._tag === "Updated" ? String(event.observed) : ""))

export const batch: Case<number, BatchMessage> = {
	program: Effect.succeed({
		Model: Schema.Finite,
		Message: BatchMessage,
		init: () => ({ model: 0 }),
		update: (model, message) => ({
			model: model + 1,
			commands: message._tag === "Fired" ? [EmitA(), EmitB()] : [],
		}),
		observe: (message) => message._tag,
		resources: Layer.empty,
		initialized: until.initialized,
		steps: [{ act: send(BatchMessage.Fired()), until: until.updated(3) }],
	}),
	expected: [updated("Fired"), updated("ReceivedA"), updated("ReceivedB")],
	normalize: Array.sort(byObservedTag),
}

// 5. Subscription lifecycle: dependencies start, keep, restart, and stop a Stream.
const RoomModel = Schema.Struct({ room: Schema.Option(Schema.String) })
type RoomModel = typeof RoomModel.Type
const RoomMessage = defineMessageUnion({ Joined: { room: Schema.String }, Left: {} })
type RoomMessage = typeof RoomMessage.Type

const updateRoom = (_model: RoomModel, message: RoomMessage) =>
	RoomMessage.match(message, {
		Joined: ({ room }) => ({ model: { room: Option.some(room) } }),
		Left: () => ({ model: { room: Option.none() } }),
	})

export const subscriptionLifecycle: Case<RoomModel, RoomMessage> = {
	program: Effect.gen(function* () {
		const { record } = yield* Trace
		const presence = (room: string) => logged(record, room)(Stream.never)
		return {
			Model: RoomModel,
			Message: RoomMessage,
			init: () => ({ model: { room: Option.none() } }),
			update: updateRoom,
			subscriptions: Subscription.make<RoomModel, RoomMessage>()((entry) => ({
				presence: entry(
					{ room: Schema.Option(Schema.String) },
					{
						modelToDependencies: (model) => ({ room: model.room }),
						dependenciesToStream: ({ room }) => Option.match(room, { onNone: () => Stream.empty, onSome: presence }),
					}
				),
			})),
			observe: (message, model) => ({ message: message._tag, room: model.room }),
			resources: Layer.empty,
			initialized: until.initialized,
			steps: [
				{ act: send(RoomMessage.Joined({ room: "r1" })), until: until.started("r1") },
				{ act: send(RoomMessage.Joined({ room: "r1" })), until: until.updated(2) },
				{ act: send(RoomMessage.Joined({ room: "r2" })), until: until.started("r2") },
				{ act: send(RoomMessage.Left()), until: until.stopped("r2") },
			],
		}
	}),
	expected: [
		updated({ message: "Joined", room: Option.some("r1") }),
		Event.Started({ key: "r1" }),
		updated({ message: "Joined", room: Option.some("r1") }),
		updated({ message: "Joined", room: Option.some("r2") }),
		Event.Stopped({ key: "r1" }),
		Event.Started({ key: "r2" }),
		updated({ message: "Left", room: Option.none() }),
		Event.Stopped({ key: "r2" }),
	],
}

// 6. Subscription Messages: values a Subscription emits arrive in emission order.
const FeedMessage = defineMessageUnion({ Joined: {}, Received: { value: Schema.Finite } })
type FeedMessage = typeof FeedMessage.Type
const FeedModel = Schema.Struct({ joined: Schema.Boolean, values: Schema.Array(Schema.Finite) })
type FeedModel = typeof FeedModel.Type

export const subscriptionMessages: Case<FeedModel, FeedMessage> = {
	program: Effect.gen(function* () {
		const feed = yield* Queue.unbounded<number>()
		return {
			Model: FeedModel,
			Message: FeedMessage,
			init: () => ({ model: { joined: false, values: [] } }),
			update: (model, message) =>
				FeedMessage.match(message, {
					Joined: () => ({ model: { ...model, joined: true } }),
					Received: ({ value }) => ({ model: { ...model, values: Array.append(model.values, value) } }),
				}),
			subscriptions: Subscription.make<FeedModel, FeedMessage>()((entry) => ({
				feed: entry(
					{ joined: Schema.Boolean },
					{
						modelToDependencies: (model) => ({ joined: model.joined }),
						dependenciesToStream: ({ joined }) =>
							joined
								? Stream.fromQueue(feed).pipe(Stream.map((value) => FeedMessage.Received({ value })))
								: Stream.empty,
					}
				),
			})),
			observe: (message, model) => ({ message, values: model.values }),
			resources: Layer.empty,
			initialized: until.initialized,
			steps: [
				{ act: send(FeedMessage.Joined()), until: until.updated(1) },
				{ act: Effect.asVoid(Queue.offerAll(feed, [1, 2])), until: until.updated(3) },
			],
		}
	}),
	expected: [
		updated({ message: FeedMessage.Joined(), values: [] }),
		updated({ message: FeedMessage.Received({ value: 1 }), values: [1] }),
		updated({ message: FeedMessage.Received({ value: 2 }), values: [1, 2] }),
	],
}

// 7. Interrupt: Interrupt reports Interrupted, then NotFound, and the interrupted work never delivers.
const WorkMessage = defineMessageUnion({
	Started: {},
	Cancelled: {},
	CompletedWork: {},
	CompletedCancelWork: { interrupted: Schema.Boolean },
})
type WorkMessage = typeof WorkMessage.Type

export const interrupt: Case<number, WorkMessage> = {
	program: Effect.gen(function* () {
		const { record } = yield* Trace
		const Work = Command.define("Work", {
			messages: [WorkMessage.CompletedWork],
			interrupt: true,
			execute: Effect.sync(() => record(Event.Started({ key: "Work" }))).pipe(Effect.andThen(Effect.never)),
		})
		return {
			Model: Schema.Finite,
			Message: WorkMessage,
			init: () => ({ model: 0 }),
			update: (model, message) =>
				WorkMessage.match(message, {
					Started: () => ({ model, commands: [Work()] }),
					Cancelled: () => ({
						model,
						commands: [
							Work.Interrupt((outcome) =>
								WorkMessage.CompletedCancelWork({ interrupted: outcome._tag === "Interrupted" })
							),
						],
					}),
					CompletedWork: () => ({ model: model + 1 }),
					CompletedCancelWork: () => ({ model }),
				}),
			observe: (message) => message,
			resources: Layer.empty,
			initialized: until.initialized,
			steps: [
				{ act: send(WorkMessage.Started()), until: until.started("Work") },
				{ act: send(WorkMessage.Cancelled()), until: until.updated(3) },
				{ act: send(WorkMessage.Cancelled()), until: until.updated(5) },
			],
		}
	}),
	expected: [
		updated(WorkMessage.Started()),
		Event.Started({ key: "Work" }),
		updated(WorkMessage.Cancelled()),
		updated(WorkMessage.CompletedCancelWork({ interrupted: true })),
		updated(WorkMessage.Cancelled()),
		updated(WorkMessage.CompletedCancelWork({ interrupted: false })),
	],
}

// 8. Query: load, replace an in-flight fetch, then revalidate while keeping data.
/** Fetch results the test hands to the Query, one per fetch. */
class Responses extends Context.Service<Responses, Queue.Queue<number>>()("react-foldkit/conformance/Responses") {}

const revision = Query.define({
	name: "Revision",
	data: Schema.Finite,
	error: Schema.String,
	interrupt: true,
	execute: Effect.gen(function* () {
		return yield* Queue.take(yield* Responses)
	}),
})
const RevisionModel = Schema.Struct({ revision: revision.Model })
type RevisionModel = typeof RevisionModel.Type
const RevisionMessage = defineMessageUnion({
	Opened: {},
	Replaced: {},
	Refreshed: {},
	GotRevisionMessage: { message: revision.Message },
})
type RevisionMessage = typeof RevisionMessage.Type
const lifted = revision.lift<RevisionModel, RevisionMessage>({
	parentField: "revision",
	toParentMessage: (message) => RevisionMessage.GotRevisionMessage({ message }),
})

export const query: Case<RevisionModel, RevisionMessage, Responses> = {
	program: Effect.gen(function* () {
		const responses = yield* Queue.unbounded<number>()
		const respond = (value: number) => Effect.asVoid(Queue.offer(responses, value))
		return {
			Model: RevisionModel,
			Message: RevisionMessage,
			init: () => ({ model: { revision: revision.init("conformance") } }),
			update: (model, message) =>
				RevisionMessage.match(message, {
					Opened: () => lifted.loadIfMissing(model),
					Replaced: () => lifted.replace(model),
					Refreshed: () => lifted.revalidate(model),
					GotRevisionMessage: ({ message }) => lifted.fold(model, message),
				}),
			observe: (message, model) => ({
				message: message._tag === "GotRevisionMessage" ? `Revision.${message.message._tag}` : message._tag,
				data: revision.read(model.revision),
			}),
			resources: Layer.succeed(Responses, responses),
			initialized: until.initialized,
			steps: [
				{ act: send(RevisionMessage.Opened()), until: until.updated(1) },
				{ act: send(RevisionMessage.Replaced()), until: until.updated(3) },
				{ act: respond(1), until: until.updated(4) },
				{ act: send(RevisionMessage.Refreshed()), until: until.updated(5) },
				{ act: respond(2), until: until.updated(6) },
			],
		}
	}),
	expected: [
		updated({ message: "Opened", data: AsyncData.Loading() }),
		updated({ message: "Replaced", data: AsyncData.Loading() }),
		updated({ message: "Revision.CompletedCancelFetch", data: AsyncData.Loading() }),
		updated({ message: "Revision.CompletedFetch", data: AsyncData.Success({ data: 1 }) }),
		updated({ message: "Refreshed", data: AsyncData.Refreshing({ data: 1 }) }),
		updated({ message: "Revision.CompletedFetch", data: AsyncData.Success({ data: 2 }) }),
	],
}

// 9. Crash: a throwing update is reported once with its Message, and nothing runs after it.
const CrashMessage = defineMessageUnion({ Added: { value: Schema.Finite }, Exploded: {} })
type CrashMessage = typeof CrashMessage.Type

export const crash: Case<ListModel, CrashMessage> = {
	program: Effect.succeed({
		Model: ListModel,
		Message: CrashMessage,
		init: () => ({ model: [] }),
		update: (model, message) =>
			CrashMessage.match(message, {
				Added: ({ value }) => ({ model: Array.append(model, value) }),
				Exploded() {
					throw new Error("update exploded")
				},
			}),
		observe: (message, model) => ({ message, model }),
		resources: Layer.empty,
		initialized: until.initialized,
		steps: [
			{ act: send(CrashMessage.Added({ value: 1 })), until: until.updated(1) },
			{
				act: Effect.andThen(send(CrashMessage.Exploded()), send(CrashMessage.Added({ value: 2 }))),
				until: until.crashed,
			},
		],
	}),
	expected: [
		updated({ message: CrashMessage.Added({ value: 1 }), model: [1] }),
		Event.Crashed({ message: Option.some(CrashMessage.Exploded()) }),
	],
}
