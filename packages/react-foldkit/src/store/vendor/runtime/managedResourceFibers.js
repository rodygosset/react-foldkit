import { Effect, Option, PubSub, Ref, Schema, Scope, Stream, pipe, } from 'effect';
/**
 * Forks one fiber per Managed Resource into the runtime scope. Each fiber
 * derives the resource's requirements from every Model, acquires the
 * resource when they appear or change and releases it when they change
 * again or go away, keeps the shared Ref pointing at the live value, and
 * feeds the acquired, released, and error Messages into the queue.
 */
export const forkManagedResourceFibers = ({ managedResourceRefs, initModel, modelPubSub, runtimeScope, enqueueMessageEffect, crashWith, }) => {
    const maybeRequirementsToLifecycle = (config, resourceRef) => (maybeRequirements) => {
        if (Option.isOption(maybeRequirements) &&
            Option.isNone(maybeRequirements)) {
            return Stream.empty;
        }
        const requirements = Option.isOption(maybeRequirements)
            ? Option.getOrThrow(maybeRequirements)
            : maybeRequirements;
        const acquire = Effect.gen(function* () {
            const value = yield* config.acquire(requirements);
            yield* Ref.set(resourceRef, Option.some(value));
            return value;
        });
        const release = (value) => Effect.gen(function* () {
            yield* config
                .release(value)
                .pipe(Effect.catchCause(() => Effect.void));
            yield* Ref.set(resourceRef, Option.none());
            yield* enqueueMessageEffect(config.onReleased());
        });
        return pipe(Stream.scoped(Stream.fromEffect(Effect.acquireRelease(acquire, release))), Stream.flatMap(value => Stream.concat(Stream.make(config.onAcquired(value)), Stream.never)), Stream.map(Effect.succeed), Stream.catch(error => Stream.make(Effect.succeed(config.onAcquireError(error)))));
    };
    const forkManagedResourceLifecycle = ({ config, ref: resourceRef, }) => Effect.gen(function* () {
        const modelSubscription = yield* PubSub.subscribe(modelPubSub).pipe(Effect.provideService(Scope.Scope, runtimeScope));
        const modelStream = Stream.concat(Stream.make(initModel), Stream.fromSubscription(modelSubscription));
        const equivalence = Schema.toEquivalence(config.schema);
        yield* Effect.forkIn(runtimeScope)(modelStream.pipe(Stream.map(config.modelToMaybeRequirements), Stream.changesWith(equivalence), Stream.switchMap(maybeRequirementsToLifecycle(config, resourceRef)), Stream.runForEach(Effect.flatMap(enqueueMessageEffect)), 
        // NOTE: a defect in `modelToMaybeRequirements` or the equivalence
        // surfaces as the crash view instead of dying silently in this
        // fiber. `provideAllResources` is not needed: `acquire` only
        // requires `Scope`, which `Stream.scoped` supplies, and `release`
        // requires nothing.
        Effect.catchCause(cause => crashWith(cause, Option.none()))));
    });
    return Effect.forEach(managedResourceRefs, forkManagedResourceLifecycle, {
        concurrency: 'unbounded',
        discard: true,
    });
};
