import { Array, Context, Effect, Function, Layer, Queue, Ref, Schema, Scope } from "effect"
import type * as ManagedResource from "foldkit/managedResource"
import * as Port from "foldkit/port"
import { embed, makeElement } from "foldkit/runtime"
import * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
import * as Store from "../../src/store"

/**
 * What a program run records, in the order it happened. `Updated` comes from the shared
 * `update` wrapper, `Started` and `Stopped` from Streams or Commands that log their lifetime,
 * and `Crashed` from the runtime's crash hook.
 */
export const Event = Schema.TaggedUnion({
	Updated: { observed: Schema.Unknown },
	Started: { key: Schema.String },
	Stopped: { key: Schema.String },
	Crashed: { message: Schema.Option(Schema.Unknown) },
})
export type Event = typeof Event.Type

/** No event arrived that satisfied a step within the deadline. */
export class Unsettled extends Schema.TaggedError<Unsettled>()("Unsettled", { events: Schema.Array(Event) }) {}

const settleDeadline = "2 seconds"

/**
 * The trace one program run writes to. Programs record synchronously, from `update` or from
 * finalizers, and the harness consumes events in order.
 */
export class Trace extends Context.Service<
	Trace,
	{
		readonly record: (event: Event) => void
		readonly settle: (until: (events: ReadonlyArray<Event>) => boolean) => Effect.Effect<void, Unsettled>
		readonly events: Effect.Effect<ReadonlyArray<Event>>
	}
>()("react-foldkit/conformance/Trace") {
	static readonly layer = Layer.effect(
		Trace,
		Effect.gen(function* () {
			const pending = yield* Queue.unbounded<Event>()
			const seen = yield* Ref.make<ReadonlyArray<Event>>([])
			const takeNext = Queue.take(pending).pipe(Effect.flatMap((event) => Ref.update(seen, Array.append(event))))
			const settle = (until: (events: ReadonlyArray<Event>) => boolean) =>
				Effect.gen(function* () {
					while (!until(yield* Ref.get(seen))) yield* takeNext
				}).pipe(
					Effect.timeoutOrElse({
						duration: settleDeadline,
						orElse: () => Effect.flatMap(Ref.get(seen), (events) => Effect.fail(new Unsettled({ events }))),
					})
				)
			return {
				record: (event) => void Queue.offerUnsafe(pending, event),
				settle,
				events: Effect.zipWith(Ref.get(seen), Queue.clear(pending), (consumed, rest) => [...consumed, ...rest]),
			}
		})
	)
}

/** Sends Messages into the runtime under test, the way an external caller would. */
export class Driver extends Context.Service<Driver, { readonly send: (message: unknown) => Effect.Effect<void> }>()(
	"react-foldkit/conformance/Driver"
) {}

export const send = (message: unknown): Effect.Effect<void, never, Driver> =>
	Effect.gen(function* () {
		const driver = yield* Driver
		yield* driver.send(message)
	})

export interface Step {
	readonly act: Effect.Effect<void, never, Driver>
	readonly until: (events: ReadonlyArray<Event>) => boolean
}

/** Foldkit runtimes dispatch tagged Messages. */
export type Tagged = { readonly _tag: string }

/** A plain Foldkit program, plus how to observe and drive it. */
export interface Program<
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R = never,
> {
	readonly Model: ModelSchema
	readonly Message: MessageSchema
	readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
	readonly update: (
		model: ModelSchema["Type"],
		message: MessageSchema["Type"]
	) => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>
	readonly subscriptions?: Subscription.Subscriptions<ModelSchema["Type"], MessageSchema["Type"], R>
	readonly managedResources?: ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]>
	/** Services for Commands and Subscriptions. Each runtime builds it as its own resources Layer. */
	readonly resources: Layer.Layer<R>
	/** Projects each update into the value its `Updated` event records. */
	readonly observe: (message: MessageSchema["Type"], model: ModelSchema["Type"]) => unknown
	readonly initialized: (events: ReadonlyArray<Event>) => boolean
	readonly steps: ReadonlyArray<Step>
}

export interface Case<
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R = never,
> {
	/** Builds a fresh program for each run, so per-run resources such as Queues are not shared. */
	readonly program: Effect.Effect<Program<ModelSchema, MessageSchema, R>, never, Trace | Scope.Scope>
	readonly expected: ReadonlyArray<Event>
	/** Removes order the contract does not promise before comparing. */
	readonly normalize?: (events: ReadonlyArray<Event>) => ReadonlyArray<Event>
}

/** Starts a program on one runtime for the enclosing Scope. */
export type Runtime = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	program: Program<ModelSchema, MessageSchema, R>
) => Effect.Effect<Driver["Service"], never, Trace | Scope.Scope>

const traced = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	record: (event: Event) => void,
	program: Program<ModelSchema, MessageSchema, R>
) =>
	function (
		model: ModelSchema["Type"],
		message: MessageSchema["Type"]
	): Update.Return<ModelSchema["Type"], MessageSchema["Type"], R> {
		const next = program.update(model, message)
		record(Event.cases.Updated.make({ observed: program.observe(message, next.model) }))
		return next
	}

export const storeRuntime: Runtime = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	program: Program<ModelSchema, MessageSchema, R>
) =>
	Effect.gen(function* () {
		const { record } = yield* Trace
		const store = yield* Store.make<ModelSchema["Type"], MessageSchema["Type"], R>(
			{
				update: traced(record, program),
				...(program.subscriptions === undefined ? {} : { subscriptions: program.subscriptions }),
				onCrash: (_cause, message) => record(Event.cases.Crashed.make({ message })),
				resources: program.resources,
				managedResources: program.managedResources,
			},
			program.init()
		)
		const decode = Schema.decodeUnknownEffect(Schema.toType(program.Message))
		return {
			send: (message) => decode(message).pipe(Effect.map(store.dispatch), Effect.orDie),
		}
	})

export const foldkitRuntime: Runtime = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	program: Program<ModelSchema, MessageSchema, R>
) =>
	Effect.gen(function* () {
		const { record } = yield* Trace

		const ports = { inbound: { input: Port.inbound(program.Message) } }
		const container = yield* Effect.acquireRelease(
			Effect.sync(() =>
				document.body.appendChild(Object.assign(document.createElement("div"), { id: "conformance" }))
			),
			(element) => Effect.sync(() => element.remove())
		)
		const handle = yield* Effect.acquireRelease(
			Effect.sync(() =>
				embed(
					makeElement<ModelSchema["Type"], MessageSchema["Type"], R, never, typeof ports>({
						Model: program.Model,
						init: program.init,
						update: traced(record, program),
						view: (_model, h) => h.div([], []),
						subscriptions: {
							...program.subscriptions,
							...Subscription.make<ModelSchema["Type"], MessageSchema["Type"], R>()(() => ({
								input: Port.subscriptionEntry(ports.inbound.input, Function.identity),
							})),
						},
						crash: { report: ({ message }) => record(Event.cases.Crashed.make({ message })) },
						resources: program.resources,
						managedResources: program.managedResources,
						ports,
						container,
					})
				)
			),
			(embedded) => Effect.sync(embedded.dispose)
		)
		const encode = Schema.encodeUnknownEffect(program.Message)
		return {
			send: (message) =>
				encode(message).pipe(
					Effect.flatMap((encoded) => handle.ports.input.send(encoded)),
					Effect.orDie
				),
		}
	})

/** Runs a case's program on one runtime and returns its trace before teardown. */
export const run = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	runtime: Runtime,
	{ program }: Case<ModelSchema, MessageSchema, R>
): Effect.Effect<ReadonlyArray<Event>, Unsettled> =>
	Effect.gen(function* () {
		const trace = yield* Trace
		const built = yield* program
		const driver = yield* runtime(built)
		yield* trace.settle(built.initialized)
		yield* Effect.forEach(
			built.steps,
			(step) => step.act.pipe(Effect.provideService(Driver, driver), Effect.andThen(trace.settle(step.until))),
			{ discard: true }
		)
		return yield* trace.events
	}).pipe(Effect.scoped, Effect.provide(Trace.layer))

const count = (tag: Event["_tag"]) => (events: ReadonlyArray<Event>) =>
	Array.filter(events, (event) => event._tag === tag).length

/** Step predicates over the trace so far. */
export const until = {
	initialized: () => true,
	updated: (times: number) => (events: ReadonlyArray<Event>) => count("Updated")(events) >= times,
	started: (key: string) => (events: ReadonlyArray<Event>) =>
		Array.some(events, (event) => event._tag === "Started" && event.key === key),
	stopped: (key: string) => (events: ReadonlyArray<Event>) =>
		Array.some(events, (event) => event._tag === "Stopped" && event.key === key),
	crashed: (events: ReadonlyArray<Event>) => count("Crashed")(events) >= 1,
}
