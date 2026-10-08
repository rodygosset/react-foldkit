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

/**
 * Wraps an allocating read so an unchanged Model keeps the same wrapper reference. React
 * compares snapshots by identity, so a fresh wrapper per render would loop.
 */
export function stabilize<Model, Wrapped>(wrap: (model: Model) => Wrapped, read: () => Model): () => Wrapped {
	let previous: Option.Option<readonly [Model, Wrapped]> = Option.none()
	return function () {
		const model = read()
		if (Option.isSome(previous) && Object.is(previous.value[0], model)) return previous.value[1]
		const wrapped = wrap(model)
		previous = Option.some([model, wrapped] as const)
		return wrapped
	}
}

export const project = <ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: SubmodelProjection<ParentModel, ParentMessage, Model, Message>
): ModelSource<Model, Message> => ({
	getSnapshot: stabilize(read, () => parent.getSnapshot()),
	getServerSnapshot: stabilize(read, () => parent.getServerSnapshot()),
	subscribe: (notify) => parent.subscribe(notify),
	dispatch: (message) => parent.dispatch(toParentMessage(message)),
})

export interface OptionalProjection<Model, Message> {
	/**
	 * The projected source, present only once the parent has produced a Model. Memoized, so
	 * repeated calls return the same reference.
	 */
	readonly source: () => Option.Option<ModelSource<Model, Message>>
	readonly presence: ModelReader<boolean>
}

/**
 * A child whose Model may be absent. Live and hydration Models are retained separately, so a
 * server read never replaces the last live Model and an absent read never clears one.
 */
export function projectOptional<ParentModel, ParentMessage, Model, Message>(
	parent: ModelSource<ParentModel, ParentMessage>,
	{ read, toParentMessage }: OptionalSubmodelProjection<ParentModel, ParentMessage, Model, Message>
): OptionalProjection<Model, Message> {
	const current = stabilize(read, () => parent.getSnapshot())
	const server = stabilize(read, () => parent.getServerSnapshot())
	function retain(getModel: () => Option.Option<Model>, initial: Model) {
		let last = initial
		return function () {
			const model = getModel()
			if (Option.isSome(model)) last = model.value
			return last
		}
	}
	let source: Option.Option<ModelSource<Model, Message>> = Option.none()
	function getSource(): Option.Option<ModelSource<Model, Message>> {
		if (Option.isSome(source)) return source
		const live = current()
		const hydration = server()
		const initial = Option.orElse(live, () => hydration)
		if (Option.isNone(initial)) return source
		source = Option.some({
			getSnapshot: retain(
				current,
				Option.getOrElse(live, () => initial.value)
			),
			getServerSnapshot: retain(
				server,
				Option.getOrElse(hydration, () => initial.value)
			),
			subscribe: (notify) => parent.subscribe(notify),
			dispatch: (message) => parent.dispatch(toParentMessage(message)),
		})
		return source
	}
	const presence: ModelReader<boolean> = {
		getSnapshot: () => Option.isSome(current()),
		getServerSnapshot: () => Option.isSome(server()),
		subscribe: (notify) => parent.subscribe(notify),
	}
	return { source: getSource, presence }
}
