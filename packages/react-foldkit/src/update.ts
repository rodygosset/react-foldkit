import { Command } from "."

export type * from "foldkit/update"
export { combine, refresh } from "foldkit/update"

export const identity =
	<Model>(model: Model) =>
	() =>
		[model, Command.none] as const
