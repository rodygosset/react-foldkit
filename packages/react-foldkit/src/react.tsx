import { Array, Cause, Effect, Exit, Option, Result, Schema } from "effect"
import React from "react"
import * as CommitSource from "./commitSource"
import * as CommitConnection from "./internal/commit-source"
import * as ModelSource from "./internal/model-source"
import * as ReactStore from "./internal/react-store"
import * as ProviderSession from "./internal/provider-session"
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

export interface ErrorOptions {
	readonly renderError?: (cause: Cause.Cause<unknown>) => React.ReactNode
	/** Observes a failure asynchronously. Observer failures join the Cause passed to `renderError`. */
	readonly onError?: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>
}

export type SourceOptions<Message, E = never, FactoryError = never> =
	| { readonly commitSource?: CommitSource.CommitSource<Message, E>; readonly createCommitSource?: never }
	| {
			readonly commitSource?: never
			readonly createCommitSource: () => Result.Result<CommitSource.CommitSource<Message, E>, FactoryError>
	  }

/**
 * A user-facing line for one Cause. Typed failures render their message; defects stay generic so
 * a stack trace never reaches the DOM. `onError` receives the full Cause for logging.
 */
const renderFailure = (cause: Cause.Cause<unknown>) => (
	<pre role="alert">
		{Option.match(Cause.findErrorOption(cause), {
			onNone: () => "The application could not start.",
			onSome: (error) => (error instanceof Error ? error.message : String(error)),
		})}
	</pre>
)

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
	function useDispatch() {
		return useSource().dispatch
	}
	function useOptionalModel(): Option.Option<Model> {
		return ModelHooks.useOptionalModel(React.useContext(Context))
	}
	function useOptionalDispatch(): Option.Option<(message: Message) => void> {
		return Option.map(React.useContext(Context), (source) => source.dispatch)
	}
	return { Provider, useModel, useDispatch, useOptionalModel, useOptionalDispatch, ...projectionHooks(useSource) }
}

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
		return present ? projected.source() : Option.none()
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

	function Provider<E = never, FactoryError = never>(
		props: {
			readonly init: Update.Return<Type<ModelSchema>, Message, R>
			readonly children: React.ReactNode
		} & SourceOptions<Message, E, FactoryError> &
			ErrorOptions
	) {
		const [bootstrap] = React.useState(() =>
			Effect.runSyncExit(
				Effect.gen(function* () {
					const source: CommitSource.CommitSource<Message, E> | undefined =
						props.createCommitSource === undefined
							? props.commitSource
							: yield* Effect.suspend(() => Effect.fromResult(props.createCommitSource()))
					if (source === undefined) {
						return { store: ReactStore.make(config, props.init), connection: undefined }
					}
					const snapshot = yield* Effect.fromResult(source.getSnapshot())
					const connection = yield* Effect.fromResult(
						CommitConnection.make({ source, initialSnapshot: snapshot })
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
			)
		)
		const observeFailure = React.useEffectEvent(
			(cause: Cause.Cause<unknown>) => props.onError?.(cause) ?? Effect.void
		)
		const [session] = React.useState(() => ProviderSession.make(bootstrap, observeFailure))
		const cause = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot)
		React.useEffect(
			function manageSession() {
				Effect.runFork(session.start)
				return function () {
					Effect.runFork(session.stop)
				}
			},
			[session]
		)

		if (Option.isSome(cause)) return (props.renderError ?? renderFailure)(cause.value)
		if (Exit.isFailure(bootstrap)) return null
		return <StoreContext.Provider value={bootstrap.value.store}>{props.children}</StoreContext.Provider>
	}

	function useDispatch() {
		return useStore().dispatch
	}

	/** Completes a Message's Model transition synchronously; Commands remain asynchronous. */
	function useCommit() {
		return useStore().commit
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

	function useOptionalModel(): Option.Option<Type<ModelSchema>> {
		const store = React.useContext(StoreContext)
		const source = React.useMemo(
			() =>
				store === null
					? Option.none()
					: Option.some({
							getSnapshot: store.getModel,
							getServerSnapshot: store.getServerModel,
							subscribe: store.subscribe,
						}),
			[store]
		)
		return ModelHooks.useOptionalModel(source)
	}
	function useOptionalDispatch(): Option.Option<(message: Message) => void> {
		const store = React.useContext(StoreContext)
		return store === null ? Option.none() : Option.some(store.dispatch)
	}
	function useOptionalCommit(): Option.Option<(message: Message) => Result.Result<void, Store.CommitError>> {
		const store = React.useContext(StoreContext)
		return store === null ? Option.none() : Option.some(store.commit)
	}
	return {
		Provider,
		useModel,
		useDispatch,
		useCommit,
		useOptionalModel,
		useOptionalDispatch,
		useOptionalCommit,
		...projectionHooks(useSource),
	}
}
