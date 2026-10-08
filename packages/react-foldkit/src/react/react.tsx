import { Array, Cause, Effect, Exit, Option, Result, Schema } from "effect"
import React from "react"
import * as CommitConnection from "../commitSource/connection"
import * as CommitSource from "../commitSource/public"
import type { ModelSource } from "../modelSource"
import * as Store from "../store/public"
import type { Lift, OptionalLift } from "../submodel/lift"
import { project, projectOptional } from "../submodel/lift"
import * as Update from "../update"
import * as ProviderSession from "./providerSession"
import * as ReactStore from "./reactStore"
import * as ModelSelectors from "./useModel"

export { CommitSourceError } from "../commitSource/public"
export type { CommitEntry, CommitSource } from "../commitSource/public"

type ModelCodec = Schema.Codec<unknown, unknown, unknown, unknown>

/**
 * The Model Schema and Program used to create a React application with `defineApplication`.
 * Define a pure update function here and return Commands for side effects. Provide services
 * needed by Commands or Subscriptions through `layer`.
 *
 * The Layer must require no additional services and have no typed failures. The Model Schema
 * supplies the TypeScript type. The Provider does not use it to validate Models at runtime.
 *
 * @category configuration
 * @since 0.1.0
 */
export type Config<ModelSchema extends ModelCodec, Message, R = never> = ReactStore.Config<
	Schema.Schema.Type<ModelSchema>,
	Message,
	R
> & {
	/**
	 * Supplies the Model type. The Provider does not decode or validate Models with this codec.
	 */
	readonly Model: ModelSchema
}

type Type<ModelSchema extends ModelCodec> = Schema.Schema.Type<ModelSchema>

/**
 * Options for displaying and reporting application failures.
 * Use `renderError` to show an error view and `onError` to report the Cause to a logging service.
 * Both options belong to the application Provider.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface ErrorOptions {
	/**
	 * Renders an error view in place of the Provider's children. Receives the full Cause.
	 * The default view shows an Error's message or a generic failure message.
	 */
	readonly renderError?: (cause: Cause.Cause<unknown>) => React.ReactNode
	/**
	 * Observes failures asynchronously. Observer failures are logged and do not replace the
	 * rendered Cause. Reports are interrupted on timeout or Provider shutdown.
	 */
	readonly onError?: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>
}

/**
 * Options for receiving Messages from external data, such as route loader results.
 * Pass a commit source directly or provide a factory that creates it during Provider initialization.
 *
 * Choose either `commitSource` or `createCommitSource`. The Provider keeps that source for its
 * mounted lifetime. Remount it to use another source. Factory failures use the Provider's
 * error view and reporting options.
 *
 * @category configuration
 * @since 0.1.0
 */
export type SourceOptions<Message, E = never, FactoryError = never> =
	| {
			/**
			 * Source captured during Provider initialization. Mutually exclusive with
			 * `createCommitSource`.
			 */
			readonly commitSource?: CommitSource.CommitSource<Message, E>
			readonly createCommitSource?: never
	  }
	| {
			readonly commitSource?: never
			/**
			 * Constructs a source during render, including SSR. React may repeat or abandon the call.
			 * Keep construction pure and acquire resources in `subscribe`.
			 */
			readonly createCommitSource: () => Result.Result<CommitSource.CommitSource<Message, E>, FactoryError>
	  }

/**
 * Props for the application Provider that supplies the Model and Message handlers to its views.
 * `init` supplies the initial Model and Commands. A commit source can supply additional Messages,
 * and the error options control how failures are shown and reported.
 *
 * The Provider captures `init` and its source on initialization. Changing those props later
 * does not replace them. Children and error callbacks follow subsequent renders.
 *
 * @category configuration
 * @since 0.1.0
 */
export type ProviderProps<Model, Message, R = never, E = never, FactoryError = never> = {
	/**
	 * Initial Model and Commands captured during initialization. Remount the Provider to replace
	 * them.
	 */
	readonly init: Update.Return<Model, Message, R>
	readonly children?: React.ReactNode
} & SourceOptions<Message, E, FactoryError> &
	ErrorOptions

/**
 * The hooks and child-source helper shared by applications and Submodels.
 * Use them inside the matching Provider to read its Model, send Messages, or give a child
 * Submodel access to part of that Model.
 *
 * @category models
 * @since 0.1.0
 */
export interface ModelHooks<Model, Message> {
	/**
	 * Subscribes the view to the Model or a selected value. Pass a selector to read only the
	 * value the view needs. Whole Models use `Object.is`; selections use `Equal.equals` unless
	 * you supply `isEqual`. Throws outside the matching Provider.
	 */
	readonly useModel: {
		(): Model
		<Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected
	}
	/**
	 * Returns a function that sends Messages to the owning application. It does not confirm
	 * delivery or wait for Commands. Throws outside the matching Provider.
	 */
	readonly useDispatch: () => (message: Message) => void
	/**
	 * Reads `Some(Model)` inside the matching Provider and `None` outside it.
	 */
	readonly useOptionalModel: () => Option.Option<Model>
	/**
	 * Returns `Some(dispatch)` inside the matching Provider and `None` outside it.
	 */
	readonly useOptionalDispatch: () => Option.Option<(message: Message) => void>
	/**
	 * Creates a source for a child Submodel from this Provider's Model. The lift reads the child
	 * Model and wraps its Messages for the parent. The child shares the parent Store and
	 * subscription. Throws outside the matching Provider.
	 */
	readonly useSubmodel: <ChildModel, ChildMessage>(
		projection: Lift<Model, Message, ChildModel, ChildMessage>
	) => ModelSource<ChildModel, ChildMessage>
	/**
	 * Returns `None` while the child Model is absent. A previously created source retains its
	 * last Model while absent and resumes when the child returns. Throws outside the matching
	 * parent Provider.
	 */
	readonly useOptionalSubmodel: <ChildModel, ChildMessage>(
		projection: OptionalLift<Model, Message, ChildModel, ChildMessage>
	) => Option.Option<ModelSource<ChildModel, ChildMessage>>
	/**
	 * Passes a child Model source to `render`, where you can supply it to a Submodel Provider.
	 * `lift` reads the child Model and wraps its Messages for the parent. The child shares the
	 * parent Store. Throws outside the matching Provider.
	 */
	readonly SubmodelProvider: <ChildModel, ChildMessage>(props: {
		readonly lift: Lift<Model, Message, ChildModel, ChildMessage>
		readonly render: (props: { readonly source: ModelSource<ChildModel, ChildMessage> }) => React.ReactNode
	}) => React.ReactNode
}

/**
 * The Provider and hooks returned by `defineApplication` for a Foldkit application.
 * Render its Provider above the views that use its hooks. Each mounted Provider owns an
 * independent Model and the Commands and Subscriptions that update it.
 *
 * @category models
 * @since 0.1.0
 */
export interface Application<Model, Message, R = never> extends ModelHooks<Model, Message> {
	/**
	 * Provides application state to its children and owns Commands and Subscriptions while active.
	 * Captures `init` and the commit source on initialization. Remount to replace either.
	 */
	readonly Provider: <E = never, FactoryError = never>(
		props: ProviderProps<Model, Message, R, E, FactoryError>
	) => React.ReactNode
	/**
	 * Returns a function that processes the queue through the submitted Message before returning.
	 * Use its Result to check delivery failures. It does not wait for Commands.
	 * Throws outside the matching Provider.
	 */
	readonly useCommit: () => (message: Message) => Result.Result<void, Store.CommitError>
	/**
	 * Returns `Some(commit)` inside the matching Provider and `None` outside it.
	 */
	readonly useOptionalCommit: () => Option.Option<(message: Message) => Result.Result<void, Store.CommitError>>
}

export function modelHooks<Model, Message>(
	useSource: () => ModelSource<Model, Message>,
	useOptionalSource: () => Option.Option<ModelSource<Model, Message>>
) {
	function useModel(): Model
	function useModel<Selected>(
		selector: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Selected
	function useModel<Selected>(
		selector?: (model: Model) => Selected,
		isEqual?: (a: Selected, b: Selected) => boolean
	): Model | Selected {
		return ModelSelectors.useModel(useSource(), selector, isEqual)
	}
	function useDispatch() {
		return useSource().dispatch
	}
	function useOptionalModel(): Option.Option<Model> {
		return ModelSelectors.useOptionalModel(useOptionalSource())
	}
	function useOptionalDispatch(): Option.Option<(message: Message) => void> {
		return Option.map(useOptionalSource(), (source) => source.dispatch)
	}
	return { useModel, useDispatch, useOptionalModel, useOptionalDispatch, ...projectionHooks(useSource) }
}

function projectionHooks<ParentModel, ParentMessage>(useSource: () => ModelSource<ParentModel, ParentMessage>) {
	function useSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: Lift<ParentModel, ParentMessage, Model, Message>): ModelSource<Model, Message> {
		const parent = useSource()
		return React.useMemo(() => project(parent, { read, toParentMessage }), [parent, read, toParentMessage])
	}
	function useOptionalSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: OptionalLift<ParentModel, ParentMessage, Model, Message>): Option.Option<ModelSource<Model, Message>> {
		const parent = useSource()
		const projected = React.useMemo(
			() => projectOptional(parent, { read, toParentMessage }),
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
		readonly lift: Lift<ParentModel, ParentMessage, Model, Message>
		readonly render: (props: { readonly source: ModelSource<Model, Message> }) => React.ReactNode
	}) {
		const source = useSubmodel(props.lift)
		return props.render({ source })
	}
	return { useSubmodel, useOptionalSubmodel, SubmodelProvider }
}

const renderFailure = (cause: Cause.Cause<unknown>) => (
	<pre role="alert">
		{Option.match(Cause.findErrorOption(cause), {
			onNone: () => "The application could not start.",
			onSome: (error) => (error instanceof Error ? error.message : String(error)),
		})}
	</pre>
)

function SessionLifecycle({ session }: { readonly session: ProviderSession.ProviderSession }) {
	React.useLayoutEffect(
		function manageSession() {
			Effect.runFork(session.start)
			return function () {
				Effect.runFork(session.stop)
			}
		},
		[session]
	)
	return null
}

/**
 * Creates a React Provider and hooks for a Foldkit application.
 * Define the application once, then render its Provider with an initial Model. Views read
 * state with `useModel` and send Messages with `useDispatch`.
 *
 * **Details**
 *
 * The Provider renders the initial Model and applies the initial commit-source snapshot during
 * render, including SSR. Commands and Subscriptions start when React activates the Provider.
 * Deactivation stops them and retains the Model for reactivation.
 *
 * Completed init Commands do not run again after reactivation. Interrupted init Commands can
 * restart. Commands returned by update do not restart automatically. Use `onReactivate` to
 * send a Message that reconciles pending state or restarts work.
 *
 * **Gotchas**
 *
 * React may repeat or abandon initialization. Keep update and source construction pure.
 * The Model Schema supplies types but does not validate runtime Models. Remount the Provider
 * to replace `init` or its commit source.
 *
 * **Example** (Connecting a counter to React)
 *
 * ```tsx
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "react-foldkit/message"
 * import { defineApplication } from "react-foldkit/react"
 * import { modifyFields } from "react-foldkit/struct"
 *
 * const Model = Schema.Struct({ count: Schema.Finite })
 * type Model = typeof Model.Type
 *
 * const Message = defineMessageUnion({ ClickedIncrement: {} })
 * type Message = typeof Message.Type
 *
 * const update = (model: Model, message: Message) =>
 * 	Message.match(message, {
 * 		ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
 * 	})
 *
 * const Application = defineApplication({ Model, update })
 *
 * function View() {
 * 	const count = Application.useModel((model) => model.count)
 * 	const dispatch = Application.useDispatch()
 *
 * 	return <button onClick={() => dispatch(Message.ClickedIncrement())}>{count}</button>
 * }
 *
 * export function App() {
 * 	return (
 * 		<Application.Provider init={{ model: { count: 0 } }}>
 * 			<View />
 * 		</Application.Provider>
 * 	)
 * }
 * ```
 *
 * The button starts at `0`. Each click sends `ClickedIncrement` and updates the displayed count.
 *
 * @category constructors
 * @since 0.1.0
 */
export function defineApplication<ModelSchema extends ModelCodec, Message, R = never>(
	config: Config<ModelSchema, Message, R>
): Application<Type<ModelSchema>, Message, R> {
	const StoreContext = React.createContext<ReactStore.ReactStore<Type<ModelSchema>, Message> | null>(null)

	function useStore() {
		const value = React.useContext(StoreContext)
		if (value === null) throw new Error("react-foldkit hooks must be used within a <Provider>")

		return value
	}

	function Provider<E = never, FactoryError = never>(
		props: ProviderProps<Type<ModelSchema>, Message, R, E, FactoryError>
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
		const { cause } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot)
		const content = Option.isSome(cause) ? (
			(props.renderError ?? renderFailure)(cause.value)
		) : Exit.isFailure(bootstrap) ? null : (
			<StoreContext.Provider value={bootstrap.value.store}>{props.children}</StoreContext.Provider>
		)
		return (
			<>
				<SessionLifecycle session={session} />
				{content}
			</>
		)
	}

	function useCommit() {
		return useStore().commit
	}

	function useOptionalSource(): Option.Option<ModelSource<Type<ModelSchema>, Message>> {
		const store = React.useContext(StoreContext)
		return React.useMemo(
			() =>
				store === null
					? Option.none()
					: Option.some({
							getSnapshot: store.getModel,
							getServerSnapshot: store.getServerModel,
							subscribe: store.subscribe,
							dispatch: store.dispatch,
						}),
			[store]
		)
	}
	function useSource() {
		return Option.getOrThrowWith(
			useOptionalSource(),
			() => new Error("react-foldkit hooks must be used within a <Provider>")
		)
	}
	function useOptionalCommit(): Option.Option<(message: Message) => Result.Result<void, Store.CommitError>> {
		const store = React.useContext(StoreContext)
		return store === null ? Option.none() : Option.some(store.commit)
	}
	return { Provider, useCommit, useOptionalCommit, ...modelHooks(useSource, useOptionalSource) }
}
