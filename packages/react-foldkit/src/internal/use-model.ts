import React from "react"
import { Equal, Option } from "effect"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector"
import { stabilize, type ModelReader } from "./model-source"

/** Share React's concurrent-safe selection implementation across root and child views. */
export function useModel<Model, Selected>(
	source: ModelReader<Model>,
	selector?: (model: Model) => Selected,
	isEqual?: (a: Selected, b: Selected) => boolean
): Model | Selected {
	const value = useSyncExternalStoreWithSelector(
		source.subscribe,
		source.getSnapshot,
		source.getServerSnapshot,
		(model) => ({
			model,
			selected: selector === undefined ? Option.none<Selected>() : Option.some(selector(model)),
		}),
		function (previous, next) {
			if (Option.isSome(previous.selected) && Option.isSome(next.selected)) {
				return (isEqual ?? Equal.equals)(previous.selected.value, next.selected.value)
			}
			return (
				Option.isNone(previous.selected) &&
				Option.isNone(next.selected) &&
				Object.is(previous.model, next.model)
			)
		}
	)
	return Option.isSome(value.selected) ? value.selected.value : value.model
}

const absent = Option.none<never>()
const subscribeAbsent = () => function () {}

/**
 * Reads a Model that may be absent. The absent case needs no parent subscription, and the
 * present case reuses one reader per source so snapshots stay referentially stable.
 */
export function useOptionalModel<Model>(source: Option.Option<ModelReader<Model>>): Option.Option<Model> {
	const reader = React.useMemo<ModelReader<Option.Option<Model>>>(
		() =>
			Option.match(source, {
				onNone: () => ({
					subscribe: subscribeAbsent,
					getSnapshot: () => absent,
					getServerSnapshot: () => absent,
				}),
				onSome: (source) => ({
					subscribe: source.subscribe,
					getSnapshot: stabilize(Option.some, source.getSnapshot),
					getServerSnapshot: stabilize(Option.some, source.getServerSnapshot),
				}),
			}),
		[source]
	)
	return React.useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getServerSnapshot)
}
