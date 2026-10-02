import { Array, Effect, Option, Result, Schema } from "effect"
import React from "react"
import * as CommitSource from "./internal/commit-source"
import * as ModelSource from "./internal/model-source"
import * as ReactStore from "./internal/react-store"
import * as ModelHooks from "./internal/use-model"
import * as Store from "./store"
import * as Update from "./update"

export { defineSubmodelProjection } from "./internal/model-source"
export type { ModelReader, ModelSource, OptionalSubmodelProjection, SubmodelProjection } from "./internal/model-source"

export { CommitSourceError } from "./commitSource"
export type { CommitEntry, CommitSource, CommitSourceOptions } from "./commitSource"

type SchemaServices<S extends Schema.Constraint> = S["DecodingServices"] | S["EncodingServices"]

type ModelCodec = Schema.Codec<unknown, unknown, unknown, unknown>

export type Config<ModelSchema extends ModelCodec, Message, R = never> = Store.Config<
	Schema.Schema.Type<ModelSchema>,
	Message,
	R | SchemaServices<ModelSchema>
> & {
	readonly Model: ModelSchema
}

type Type<ModelSchema extends ModelCodec> = Schema.Schema.Type<ModelSchema>

function useCommitConnection<Model, Message>(
	store: ReactStore.ReactStore<Model, Message>,
	connection: CommitSource.Connection<Message> | undefined
) {
	React.useEffect(
		function () {
			if (connection === undefined) return
			const disconnect = Effect.runSync(store.onActivate(connection.connect(store.commit)))
			return () => Effect.runSync(disconnect)
		},
		[store, connection]
	)
}

/** A submodel hook was called outside its matching view Provider. */
export class SubmodelProviderError extends Schema.Error<SubmodelProviderError>(
	"react-foldkit/React/SubmodelProviderError"
)({
	_tag: Schema.tag("SubmodelProviderError"),
}) {
	get message(): string {
		return "Submodel hooks must be used within their matching <Provider>"
	}
}

/** Defines a reusable child view over a projection of its parent's store. */
export function defineSubmodel<Model, Message>() {
	const Context = React.createContext<Option.Option<ModelSource.ModelSource<Model, Message>>>(Option.none())

	function Provider({
		source,
		children,
	}: {
		readonly source: ModelSource.ModelSource<Model, Message>
		readonly children?: React.ReactNode
	}) {
		const context = React.useMemo(
			() =>
				Option.some({
					getSnapshot: () => source.getSnapshot(),
					getServerSnapshot: () => source.getServerSnapshot(),
					subscribe: (notify: () => void) => source.subscribe(notify),
					dispatch: (message: Message) => source.dispatch(message),
				}),
			[source]
		)
		return <Context.Provider value={context}>{children}</Context.Provider>
	}

	function useSource(): ModelSource.ModelSource<Model, Message> {
		return Option.getOrThrowWith(React.useContext(Context), () => new SubmodelProviderError({}))
	}

	function useModel(): Model
	function useModel<Selected>(
		selector: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Selected
	function useModel<Selected>(
		selector?: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Model | Selected {
		return ModelHooks.useModel(useSource(), selector, isEqual)
	}
	const useDispatch = () => useSource().dispatch
	return { Provider, useModel, useDispatch, ...projectionHooks(useSource) }
}

/** Projection creation reads the store handle, never subscribes to the whole parent Model. */
function projectionHooks<ParentModel, ParentMessage>(
	useSource: () => ModelSource.ModelSource<ParentModel, ParentMessage>
) {
	function useSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: ModelSource.SubmodelProjection<ParentModel, ParentMessage, Model, Message>): ModelSource.ModelSource<
		Model,
		Message
	> {
		const parent = useSource()
		return React.useMemo(
			() => ModelSource.project(parent, { read, toParentMessage }),
			[parent, read, toParentMessage]
		)
	}
	function useOptionalSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: ModelSource.OptionalSubmodelProjection<ParentModel, ParentMessage, Model, Message>): Option.Option<
		ModelSource.ModelSource<Model, Message>
	> {
		const parent = useSource()
		const projected = React.useMemo(
			() => ModelSource.projectOptional(parent, { read, toParentMessage }),
			[parent, read, toParentMessage]
		)
		const present = React.useSyncExternalStore(
			projected.presence.subscribe,
			projected.presence.getSnapshot,
			projected.presence.getServerSnapshot
		)
		return present ? projected.source : Option.none()
	}
	function SubmodelProvider<Model, Message>(props: {
		readonly projection: ModelSource.SubmodelProjection<ParentModel, ParentMessage, Model, Message>
		readonly render: (props: { readonly source: ModelSource.ModelSource<Model, Message> }) => React.ReactNode
	}) {
		const source = useSubmodel(props.projection)
		return props.render({ source })
	}
	return { useSubmodel, useOptionalSubmodel, SubmodelProvider }
}

/**
 * Defines Provider and hooks around a Foldkit-shaped store.
 *
 * Provider cold-boots from `init` and disposes on unmount. Live updates go through dispatch or commit after activation.
 *
 * Model may require Schema decoding or encoding services. Those services join
 * update `R`, so `layer` is required when the codec is not `never`. Sync JSON
 * encode still needs `never` services at the call site that uses
 * `encodeUnknownSync`.
 */
export function defineApplication<ModelSchema extends ModelCodec, Message, R = never>(
	config: Config<ModelSchema, Message, R>
) {
	const StoreContext = React.createContext<ReactStore.ReactStore<Type<ModelSchema>, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("react-foldkit hooks must be used within a <Provider>")

		return value
	}

	function Provider(props: {
		readonly init: Update.Return<Type<ModelSchema>, Message, R>
		/** Folds the initial snapshot into init and connects subsequent Messages after activation. Keep its identity stable. */
		readonly commitSource?: CommitSource.CommitSource<Message>
		readonly children: React.ReactNode
	}) {
		const [{ store, connection }] = React.useState(function () {
			if (props.commitSource === undefined)
				return { store: ReactStore.make(config, props.init), connection: undefined }

			const snapshot = props.commitSource.getSnapshot()
			const connection = Result.getOrThrow(
				CommitSource.make({ source: props.commitSource, initialSnapshot: snapshot })
			)
			const init = Update.combine(props.init.model, [
				() => props.init,
				...Array.map(
					snapshot,
					({ message }) =>
						(model: Type<ModelSchema>) =>
							config.update(model, message)
				),
			])
			return { store: ReactStore.make(config, init), connection }
		})
		if (connection?.source !== props.commitSource)
			throw new CommitSource.CommitSourceError({ reason: "SourceChanged" })

		useCommitConnection(store, connection)

		React.useEffect(
			function manageStoreLifetime() {
				const deactivate = Effect.runSync(store.activate)
				return () => Effect.runSync(deactivate)
			},
			[store]
		)

		return <StoreContext.Provider value={store}>{props.children}</StoreContext.Provider>
	}

	const useDispatch = () => useStore().dispatch

	/** Completes a Message's Model transition synchronously; Commands remain asynchronous. */
	const useCommit = () => useStore().commit

	/** Reconciles active external values through the root store's synchronous commit. */
	function useCommitSource(options: CommitSource.CommitSourceOptions<Message>): void {
		const store = useStore()
		const [connection] = React.useState(() => Result.getOrThrow(CommitSource.make(options)))
		if (connection.source !== options.source) {
			throw new CommitSource.CommitSourceError({ reason: "SourceChanged" })
		}
		useCommitConnection(store, connection)
	}

	function useSource(): ModelSource.ModelSource<Type<ModelSchema>, Message> {
		const store = useStore()
		return React.useMemo(
			() => ({
				getSnapshot: store.getModel,
				getServerSnapshot: store.getServerModel,
				subscribe: store.subscribe,
				dispatch: store.dispatch,
			}),
			[store]
		)
	}

	function useModel(): Type<ModelSchema>
	function useModel<Selected>(
		selector: (model: Type<ModelSchema>) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Selected
	function useModel<Selected>(
		selector?: (model: Type<ModelSchema>) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Type<ModelSchema> | Selected {
		return ModelHooks.useModel(useSource(), selector, isEqual)
	}

	return { Provider, useModel, useDispatch, useCommit, useCommitSource, ...projectionHooks(useSource) }
}
