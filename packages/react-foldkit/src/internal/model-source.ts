import { Option } from "effect"

/** A read-only view of an existing Model store, including its hydration snapshot. */
export interface ModelReader<Model> {
	readonly getSnapshot: () => Model
	readonly getServerSnapshot: () => Model
	readonly subscribe: (notify: () => void) => () => void
}

/** A Model reader with a dispatcher into its owning parent update. */
export interface ModelSource<Model, Message> extends ModelReader<Model> {
	readonly dispatch: (message: Message) => void
}

/** The same Model read and Message lift used for ordinary child composition. */
export interface SubmodelProjection<ParentModel, ParentMessage, Model, Message> {
	readonly read: (model: ParentModel) => Model
	readonly toParentMessage: (message: Message) => ParentMessage
}

export const defineSubmodelProjection = <ParentModel, ParentMessage, Model, Message>(
	input: SubmodelProjection<ParentModel, ParentMessage, Model, Message>
): SubmodelProjection<ParentModel, ParentMessage, Model, Message> => input

/** Presence and instance identity remain explicit in the parent's read function. */
export interface OptionalSubmodelProjection<ParentModel, ParentMessage, Model, Message> {
	readonly read: (model: ParentModel) => Option.Option<Model>
	readonly toParentMessage: (message: Message) => ParentMessage
}

// React requires referentially stable snapshots, including when read allocates.
function snapshot<Parent, Model>(getParent: () => Parent, read: (parent: Parent) => Model): () => Model {
	let cached: Option.Option<{ readonly parent: Parent; readonly model: Model }> = Option.none()
	return function () {
		const parent = getParent()
		if (Option.isSome(cached) && Object.is(cached.value.parent, parent)) return cached.value.model
		const model = read(parent)
		cached = Option.some({ parent, model })
		return model
	}
}

export const project = <ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: SubmodelProjection<ParentModel, ParentMessage, Model, Message>
): ModelSource<Model, Message> => ({
	getSnapshot: snapshot(() => parent.getSnapshot(), read),
	getServerSnapshot: snapshot(() => parent.getServerSnapshot(), read),
	subscribe: (notify) => parent.subscribe(notify),
	dispatch: (message) => parent.dispatch(toParentMessage(message)),
})

export function projectOptional<ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: OptionalSubmodelProjection<ParentModel, ParentMessage, Model, Message>
) {
	const current = snapshot(() => parent.getSnapshot(), read)
	const server = snapshot(() => parent.getServerSnapshot(), read)
	function retain(getModel: () => Option.Option<Model>, initial: Option.Option<Model>) {
		let last = initial
		function read() {
			const model = getModel()
			if (Option.isSome(model)) last = model
			return model
		}
		return {
			getSnapshot() {
				read()
				// An exposed source was present. Preserve its last valid Model
				// while an already subscribed child waits for React to unmount it.
				return Option.getOrThrow(last)
			},
			isPresent: () => Option.isSome(read()),
		}
	}
	const initial = current()
	const bootstrap = server()
	// Server reads must never overwrite the last live Model (or vice versa).
	const live = retain(
		current,
		Option.orElse(initial, () => bootstrap)
	)
	const hydration = retain(
		server,
		Option.orElse(bootstrap, () => initial)
	)
	const source: ModelSource<Model, Message> = {
		getSnapshot: live.getSnapshot,
		getServerSnapshot: hydration.getSnapshot,
		subscribe: (notify) => parent.subscribe(notify),
		dispatch: (message) => parent.dispatch(toParentMessage(message)),
	}
	const presence: ModelReader<boolean> = {
		getSnapshot: live.isPresent,
		getServerSnapshot: hydration.isPresent,
		subscribe: source.subscribe,
	}
	return { source: Option.some(source), presence }
}
