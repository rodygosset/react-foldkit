import { type Cause, Context, Effect, Option, type PubSub, Record, Ref, type Scope } from "effect"
import type * as ManagedResource from "foldkit/managedResource"
import type { ProvidedServices } from "../internal/managedResource"
import { forkManagedResourceFibers } from "./vendor/runtime/managedResourceFibers.js"

export interface ManagedResourceRef<Model, Message> {
	readonly config: ManagedResource.ManagedResourceConfig<Model, Message>
	readonly ref: Ref.Ref<Option.Option<unknown>>
}

interface Host<Model, Message> {
	readonly initialModel: Model
	readonly modelPubSub: PubSub.PubSub<Model>
	readonly scope: Scope.Scope
	readonly deliver: (message: Message) => void
	readonly crash: (cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void
}

export const makeManagedResources = <Model, Message, Managed extends ManagedResource.ManagedResources<Model, Message>>(
	resources: Managed | undefined
) =>
	Effect.gen(function* () {
		const entries: ReadonlyArray<ManagedResource.ManagedResourceConfig<Model, Message>> =
			resources === undefined
				? []
				: Record.values<string, ManagedResource.ManagedResourceConfig<Model, Message>>(resources)
		const refs = yield* Effect.forEach(entries, (config) =>
			Ref.make<Option.Option<unknown>>(Option.none()).pipe(Effect.map((ref) => ({ config, ref })))
		)
		// The record's resource tags determine exactly which services these holders supply.
		const context = Context.makeUnsafe<ProvidedServices<Managed>>(
			new Map(refs.map(({ config, ref }) => [config.resource._tag.key, ref]))
		)
		return {
			context,
			start: (host: Host<Model, Message>): Effect.Effect<void> =>
				forkManagedResourceFibers({
					managedResourceRefs: refs,
					initModel: host.initialModel,
					modelPubSub: host.modelPubSub,
					runtimeScope: host.scope,
					enqueueMessageEffect: (message) => Effect.sync(() => host.deliver(message)),
					crashWith: (cause, message) => Effect.sync(() => host.crash(cause, message)),
				}),
		}
	})
