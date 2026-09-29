import { type Cause, Effect, Option, PubSub, Record, Schema, Scope, Stream } from "effect"
import type * as Subscription from "foldkit/subscription"

/** What one activation gives its Subscription fibers. */
interface SubscriptionHost<Model, Message, R> {
	/** The Model when the activation starts. Each Subscription derives its first dependencies from it. */
	readonly initialModel: Model
	readonly modelPubSub: PubSub.PubSub<Model>
	readonly fiberScope: Scope.Scope
	readonly provideServices: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
	readonly deliver: (message: Message) => void
	readonly crash: (cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void
}

/**
 * Forks one fiber per Subscription into the host's fiber Scope. The fibers inherit the calling
 * fiber's Context, so run this with the activation's Context.
 */
export const forkSubscriptionFibers = <Model, Message, R>(
	subscriptions: Subscription.Subscriptions<Model, Message, R> | undefined,
	host: SubscriptionHost<Model, Message, R>
): Effect.Effect<void> =>
	Effect.forEach(
		subscriptions === undefined ? [] : Record.values(subscriptions),
		({ dependenciesSchema, modelToDependencies, keepAliveEquivalence, dependenciesToStream }) =>
			Effect.gen(function* () {
				// Subscribe now, so the fiber sees every Model published after this activation starts.
				const modelChanges = yield* PubSub.subscribe(host.modelPubSub).pipe(Scope.provide(host.fiberScope))
				const fiber = Effect.suspend(function () {
					let latestDependencies = modelToDependencies(host.initialModel)
					// Record dependencies before changesWith, so readDependencies sees every Model.
					return Stream.fromSubscription(modelChanges).pipe(
						Stream.map((model) => (latestDependencies = modelToDependencies(model))),
						Stream.prepend([latestDependencies]),
						Stream.changesWith(keepAliveEquivalence ?? Schema.toEquivalence(dependenciesSchema)),
						Stream.switchMap((dependencies) =>
							dependenciesToStream(dependencies, () => latestDependencies)
						),
						Stream.runForEach((message) => Effect.sync(() => host.deliver(message))),
						host.provideServices
					)
				}).pipe(Effect.catchCause((cause) => Effect.sync(() => host.crash(cause, Option.none()))))
				yield* Effect.forkIn(fiber, host.fiberScope)
			}),
		{ discard: true }
	)
