import { Equal, Option } from "effect"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector"
import type { ModelReader } from "./model-source"

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
