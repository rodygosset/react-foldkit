import { Option } from "effect"
import { constVoid, identity } from "effect/Function"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector"
import type { ModelReader } from "../modelSource/modelSource"
import { structuralEquivalence } from "./structuralEquivalence"

export function useModel<Model>(source: ModelReader<Model>): Model
export function useModel<Model, Selected>(
	source: ModelReader<Model>,
	selector: (model: Model) => Selected,
	isEqual?: (a: Selected, b: Selected) => boolean
): Selected
export function useModel<Model, Selected>(
	source: ModelReader<Model>,
	selector?: (model: Model) => Selected,
	isEqual?: (a: Selected, b: Selected) => boolean
): Model | Selected
export function useModel<Model, Selected>(
	source: ModelReader<Model>,
	selector?: (model: Model) => Selected,
	isEqual?: (a: Selected, b: Selected) => boolean
): Model | Selected {
	const select = (selector ?? identity) as (model: Model) => Selected
	return useSyncExternalStoreWithSelector(
		source.subscribe,
		source.getSnapshot,
		source.getServerSnapshot,
		select,
		selector === undefined ? Object.is : (isEqual ?? structuralEquivalence)
	)
}

// Stands in for the Model outside a Provider. As its own snapshot, it never changes.
const absent: unique symbol = Symbol.for("react-foldkit/AbsentModel")
const absentReader: ModelReader<typeof absent> = {
	subscribe: () => constVoid,
	getSnapshot: () => absent,
	getServerSnapshot: () => absent,
}
const toOption = <Model>(snapshot: Model | typeof absent): Option.Option<Model> =>
	snapshot === absent ? Option.none() : Option.some(snapshot)

export function useOptionalModel<Model>(source: Option.Option<ModelReader<Model>>): Option.Option<Model> {
	const reader: ModelReader<Model | typeof absent> = Option.getOrElse(source, () => absentReader)
	// The selector store caches each selection by snapshot, so a Model keeps one Some wrapper.
	return useModel(reader, toOption<Model>, Object.is)
}
