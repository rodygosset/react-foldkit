import { Cause, Effect, Option, PubSub, Scope } from 'effect';
import type { ManagedResourceRef } from '../../managedResources.js';
/**
 * Forks one fiber per Managed Resource into the runtime scope. Each fiber
 * derives the resource's requirements from every Model, acquires the
 * resource when they appear or change and releases it when they change
 * again or go away, keeps the shared Ref pointing at the live value, and
 * feeds the acquired, released, and error Messages into the queue.
 */
export declare const forkManagedResourceFibers: <Model, Message>({ managedResourceRefs, initModel, modelPubSub, runtimeScope, enqueueMessageEffect, crashWith, }: Readonly<{
    managedResourceRefs: ReadonlyArray<ManagedResourceRef<Model, Message>>;
    initModel: Model;
    modelPubSub: PubSub.PubSub<Model>;
    runtimeScope: Scope.Scope;
    enqueueMessageEffect: (message: Message) => Effect.Effect<void>;
    crashWith: (cause: Cause.Cause<never>, maybeMessage: Option.Option<Message>) => Effect.Effect<void>;
}>) => Effect.Effect<void>;
//# sourceMappingURL=managedResourceFibers.d.ts.map