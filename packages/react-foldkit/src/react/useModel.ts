import { Equal, Option } from "effect"
import { identity } from "effect/Function"
import React from "react"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/with-selector"
import { stabilize, type ModelReader } from "../modelSource/modelSource"

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
		selector === undefined ? Object.is : (isEqual ?? Equal.equals)
	)
}

const absent = Option.none<never>()
const subscribeAbsent = () => function () {}

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
