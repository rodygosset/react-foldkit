import { Cause, Context, Effect, Option, PubSub, Record, Ref, Schema, Scope, Stream } from "effect"
import type * as Subscription from "../subscription"

type SubscriptionRuntime<Model, Message, R> = {
	readonly bootModel: Model
	readonly modelPubSub: PubSub.PubSub<Model>
	readonly fiberScope: Scope.Scope
	readonly runtimeContext: Context.Context<never>
	readonly provideAllResources: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>
	readonly enqueueMessage: (message: Message) => void
	readonly crashWith: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void
}

export function forkSubscriptionFibers<Model, Message, R>(
	subscriptions: Subscription.Subscriptions<Model, Message, R> | undefined,
	runtime: SubscriptionRuntime<Model, Message, R>
): void {
	if (subscriptions === undefined) return

	const { bootModel, modelPubSub, fiberScope, runtimeContext, provideAllResources, enqueueMessage, crashWith } =
		runtime

	for (const [, entry] of Record.toEntries(subscriptions)) {
		const { dependenciesSchema, modelToDependencies, keepAliveEquivalence, dependenciesToStream } = entry

		const modelSubscription = Effect.runSyncWith(runtimeContext)(
			PubSub.subscribe(modelPubSub).pipe(Effect.provideService(Scope.Scope, fiberScope))
		)
		const fiber = Effect.gen(function* () {
			const equivalence = keepAliveEquivalence ?? Schema.toEquivalence(dependenciesSchema)
			const initDependencies = modelToDependencies(bootModel)
			const latestDependenciesRef = yield* Ref.make(initDependencies)

			const modelChangesStream = Stream.fromSubscription(modelSubscription).pipe(
				Stream.mapEffect((nextModel) =>
					Effect.gen(function* () {
						const dependencies = modelToDependencies(nextModel)
						yield* Ref.set(latestDependenciesRef, dependencies)
						return dependencies
					})
				)
			)

			yield* Stream.concat(Stream.make(initDependencies), modelChangesStream).pipe(
				Stream.changesWith(equivalence),
				Stream.switchMap((dependencies) =>
					dependenciesToStream(dependencies, () => Ref.getUnsafe(latestDependenciesRef))
				),
				Stream.runForEach((message) =>
					Effect.sync(function () {
						enqueueMessage(message)
					})
				),
				provideAllResources
			)
		}).pipe(
			Effect.catchCause((cause) =>
				Effect.sync(function () {
					crashWith(cause, Option.none())
				})
			)
		)

		Effect.runForkWith(runtimeContext)(Effect.forkIn(fiber, fiberScope))
	}
}
