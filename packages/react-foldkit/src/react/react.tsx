import { Cause, Effect, Equal, Exit, Option, Schema } from "effect"
import React from "react"
import { isDevelopment } from "../internal/deepFreeze"
import type { ModelSource } from "../modelSource"
import type { OptionalProjection, Projection } from "../submodel/lift"
import { project, projectOptional } from "../submodel/lift"
import type * as Update from "foldkit/update"
import * as ProviderSession from "./providerSession"
import * as ReactStore from "./reactStore"
import * as ModelSelectors from "./useModel"

export type { ReactivationContext } from "./reactStore"

type ModelCodec = Schema.Codec<unknown, unknown, unknown, unknown>

type Type<ModelSchema extends ModelCodec> = Schema.Schema.Type<ModelSchema>

/**
 * What the Provider knows about a failure it shows or reports.
 *
 * @see {@link CrashConfig} for the callbacks that receive it
 * @category models
 * @since 0.1.0
 */
export interface CrashContext<Model, Message> {
	/**
	 * The full failure, with its annotations preserved.
	 */
	readonly cause: Cause.Cause<unknown>
	/**
	 * The Model when the failure happened. `None` when the Provider failed before it had a Model,
	 * such as an initial Model that failed `validateInit`.
	 */
	readonly model: Option.Option<Model>
	/**
	 * The Message whose update or Command crashed the Store. `None` for other failures, such as
	 * Subscriptions, init Commands, or resource cleanup.
	 */
	readonly message: Option.Option<Message>
}

/**
 * How an application shows and reports failures. Mirrors Foldkit's crash configuration.
 * Set it on `defineApplication`, and override either callback on a Provider.
 *
 * @category configuration
 * @since 0.1.0
 */
export interface CrashConfig<Model, Message> {
	/**
	 * Renders in place of the Provider's children. Call `restart` to remount the Provider with
	 * a fresh Store from `init`. The default view shows a typed failure's message, or a generic
	 * message for defects.
	 */
	readonly view?: (context: CrashContext<Model, Message> & { readonly restart: () => void }) => React.ReactNode
	/**
	 * Observes client failures asynchronously, such as by sending them to a logging service.
	 * Report failures are logged and never replace the view. Reports are interrupted on
	 * timeout or Provider shutdown.
	 */
	readonly report?: (context: CrashContext<Model, Message>) => Effect.Effect<void, unknown>
}

/**
 * The Model Schema and Program used to create a React application with `defineApplication`.
 * Define a pure update function here and return Commands for side effects. Provide services
 * needed by Commands or Subscriptions through `resources`.
 *
 * The Layer must require no additional services and have no typed failures. The Model Schema
 * supplies the TypeScript type. Outside production builds, the Provider also checks its initial
 * Model against the Schema and freezes published Models.
 *
 * @category configuration
 * @since 0.1.0
 */
export type Config<ModelSchema extends ModelCodec, Message, R = never> = ReactStore.Config<
	Type<ModelSchema>,
	Message,
	R
> & {
	/**
	 * Supplies the Model type and checks the initial Model when `validateInit` is on.
	 */
	readonly Model: ModelSchema
	/**
	 * Default failure view and reporting for every Provider of this application.
	 */
	readonly crash?: CrashConfig<Type<ModelSchema>, Message>
	/**
	 * Checks the initial Model against `Model`. A mismatch fails the Provider with a
	 * `SchemaError`. Defaults to `true` outside production builds.
	 */
	readonly validateInit?: boolean
}

/**
 * Props for the application Provider that supplies the Model and Message handlers to its views.
 * `init` supplies the initial Model and Commands, and `crash` overrides how this Provider shows
 * and reports failures.
 *
 * The Provider captures `init` on initialization. Changing it later does not replace it.
 * Children and crash callbacks follow subsequent renders. Use `useInbound` to send later prop
 * changes to update.
 *
 * @category configuration
 * @since 0.1.0
 */
export type ProviderProps<Model, Message, R = never> = {
	/**
	 * Initial Model and Commands, or a function that creates them. The Provider calls a function
	 * once per initialization, including after a crash view's `restart`.
	 */
	readonly init: Update.Return<Model, Message, R> | (() => Update.Return<Model, Message, R>)
	readonly children?: React.ReactNode
	/**
	 * Overrides the application's crash view or report for this Provider.
	 */
	readonly crash?: CrashConfig<Model, Message>
}

/**
 * The hooks shared by applications and Submodels.
 * Use them inside the matching Provider to read its Model, send Messages, or give a child
 * Submodel access to part of that Model.
 *
 * @category models
 * @since 0.1.0
 */
export interface ModelHooks<Model, Message> {
	/**
	 * Subscribes the view to the Model or a selected value. Pass a selector to read only the
	 * value the view needs. Whole Models use `Object.is`. Selections use `Equal.equals`, which
	 * compares plain objects and arrays structurally on every Model change; pass `isEqual` when
	 * a selection is large or already reference-stable. Throws outside the matching Provider.
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
	 * Sends a Message whenever an external value changes, such as a route parameter or prop.
	 * The first value is not sent; include it in `init`. Values are compared with `isEqual`,
	 * which defaults to `Equal.equals`. Throws outside the matching Provider.
	 */
	readonly useInbound: <A>(
		value: A,
		toMessage: (value: A) => Message,
		isEqual?: (previous: A, next: A) => boolean
	) => void
	/**
	 * Creates a source for a child Submodel from this Provider's Model. The lift reads the child
	 * Model and wraps its Messages for the parent. The child shares the parent Store and
	 * subscription. Declare the lift outside render, or memoize it: a new `read` or
	 * `toParentMessage` creates a new source. Throws outside the matching Provider.
	 */
	readonly useSubmodel: <ChildModel, ChildMessage>(
		projection: Projection<Model, Message, ChildModel, ChildMessage>
	) => ModelSource<ChildModel, ChildMessage>
	/**
	 * Returns `None` while the child Model is absent. A previously created source retains its
	 * last Model while absent and resumes when the child returns. Throws outside the matching
	 * parent Provider.
	 */
	readonly useOptionalSubmodel: <ChildModel, ChildMessage>(
		projection: OptionalProjection<Model, Message, ChildModel, ChildMessage>
	) => Option.Option<ModelSource<ChildModel, ChildMessage>>
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
	 * Captures `init` on initialization. Remount to replace it.
	 */
	readonly Provider: (props: ProviderProps<Model, Message, R>) => React.ReactNode
}

/** The React context that application and Submodel Providers use to pass their source down. */
export type SourceContext<Model, Message> = React.Context<Option.Option<ModelSource<Model, Message>>>

export const makeSourceContext = <Model, Message>(): SourceContext<Model, Message> =>
	React.createContext<Option.Option<ModelSource<Model, Message>>>(Option.none())

export function modelHooks<Model, Message>(Context: SourceContext<Model, Message>, missingProvider: () => Error) {
	function useOptionalSource(): Option.Option<ModelSource<Model, Message>> {
		return React.useContext(Context)
	}
	function useSource(): ModelSource<Model, Message> {
		return Option.getOrThrowWith(useOptionalSource(), missingProvider)
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
	function useInbound<A>(
		value: A,
		toMessage: (value: A) => Message,
		isEqual: (previous: A, next: A) => boolean = Equal.equals
	): void {
		const { dispatch } = useSource()
		const previous = React.useRef(value)
		const send = React.useEffectEvent(function (next: A) {
			if (isEqual(previous.current, next)) return
			previous.current = next
			dispatch(toMessage(next))
		})
		React.useLayoutEffect(
			function sendChangedValue() {
				send(value)
			},
			[value]
		)
	}
	return {
		useModel,
		useDispatch,
		useOptionalModel,
		useOptionalDispatch,
		useInbound,
		...projectionHooks(useSource),
	}
}

function projectionHooks<ParentModel, ParentMessage>(useSource: () => ModelSource<ParentModel, ParentMessage>) {
	function useSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: Projection<ParentModel, ParentMessage, Model, Message>): ModelSource<Model, Message> {
		const parent = useSource()
		return React.useMemo(() => project(parent, { read, toParentMessage }), [parent, read, toParentMessage])
	}
	function useOptionalSubmodel<Model, Message>({
		read,
		toParentMessage,
	}: OptionalProjection<ParentModel, ParentMessage, Model, Message>): Option.Option<ModelSource<Model, Message>> {
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
	return { useSubmodel, useOptionalSubmodel }
}

function DefaultCrashView({ cause }: { readonly cause: Cause.Cause<unknown> }) {
	return (
		<pre role="alert">
			{Option.match(Cause.findErrorOption(cause), {
				onNone: () => "The application could not start.",
				onSome: (error) => (error instanceof Error ? error.message : String(error)),
			})}
		</pre>
	)
}

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
 * The Provider renders the initial Model during render, including SSR. Commands and
 * Subscriptions start when React activates the Provider. Deactivation stops them and retains the Model for reactivation, unless `retainInactive`
 * keeps the Store running for a while.
 *
 * Completed init Commands do not run again after reactivation. Interrupted init Commands
 * restart. Interrupted update Commands restart when `restartInterrupted` selects them, and the
 * rest reach `onReactivate`.
 *
 * **Gotchas**
 *
 * React may repeat or abandon initialization. Keep update and `init` functions pure.
 * Remount the Provider to replace `init`, or use `useInbound` to send changing values to update.
 *
 * **Example** (Connecting a counter to React)
 *
 * ```tsx
 * import { Schema } from "effect"
 * import { defineMessageUnion } from "foldkit/message"
 * import { defineApplication } from "react-foldkit/react"
 * import { modifyFields } from "foldkit/struct"
 * import type * as Update from "foldkit/update"
 *
 * const Model = Schema.Struct({ count: Schema.Finite })
 * type Model = typeof Model.Type
 *
 * const Message = defineMessageUnion({ ClickedIncrement: {} })
 * type Message = typeof Message.Type
 *
 * const update = (model: Model, message: Message) =>
 * 	Message.match<Update.Return<Model, Message>>(message, {
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
	type Model = Type<ModelSchema>
	const Context = makeSourceContext<Model, Message>()
	const validateInit = config.validateInit ?? isDevelopment
	const checkModel = Schema.decodeUnknownExit(Schema.toType(config.Model))

	function ProviderInstance({
		restart,
		...props
	}: ProviderProps<Model, Message, R> & { readonly restart: () => void }) {
		const [bootstrap] = React.useState(() =>
			Effect.runSyncExit(
				Effect.gen(function* () {
					const init = typeof props.init === "function" ? props.init() : props.init
					if (validateInit) yield* checkModel(init.model)
					return { store: ReactStore.make(config, init) }
				})
			)
		)
		const store = Option.map(Exit.getSuccess(bootstrap), (bootstrapped) => bootstrapped.store)
		const crashContext = (cause: Cause.Cause<unknown>): CrashContext<Model, Message> => ({
			cause,
			model: Option.map(store, (store) => store.getModel()),
			message: Option.flatMap(store, (store) => store.getCrashMessage()),
		})
		const observeFailure = React.useEffectEvent(function (cause: Cause.Cause<unknown>) {
			const report = props.crash?.report ?? config.crash?.report
			return report === undefined ? Effect.void : Effect.suspend(() => report(crashContext(cause)))
		})
		const [session] = React.useState(() => ProviderSession.make(bootstrap, observeFailure))
		const [source] = React.useState(() =>
			Option.map(store, (store): ModelSource<Model, Message> => ({
				getSnapshot: store.getModel,
				getServerSnapshot: store.getServerModel,
				subscribe: store.subscribe,
				dispatch: store.dispatch,
			}))
		)
		const { cause } = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot)
		const view = props.crash?.view ?? config.crash?.view
		const content = Option.isSome(cause) ? (
			view === undefined ? (
				<DefaultCrashView cause={cause.value} />
			) : (
				view({ ...crashContext(cause.value), restart })
			)
		) : Option.isNone(source) ? null : (
			<Context.Provider value={source}>{props.children}</Context.Provider>
		)
		return (
			<>
				<SessionLifecycle session={session} />
				{content}
			</>
		)
	}

	function Provider(props: ProviderProps<Model, Message, R>) {
		const [generation, setGeneration] = React.useState(0)
		const restart = React.useCallback(function () {
			setGeneration((current) => current + 1)
		}, [])
		return (
			<ProviderInstance
				key={generation}
				{...props}
				restart={restart}
			/>
		)
	}

	return {
		Provider,
		...modelHooks(Context, () => new Error("react-foldkit hooks must be used within a <Provider>")),
	}
}
