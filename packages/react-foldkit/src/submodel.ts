import { Option } from "effect"
import * as Command from "./command"
import type * as Update from "./update"

export type DelegateConfig<ParentModel, ParentMessage, ChildModel, ChildMessage, OutMessage, R = never> = Readonly<{
	/** Read the child slice from the parent Model. */
	get: (parent: ParentModel) => ChildModel
	/** Write the next child slice back into the parent Model. */
	set: (parent: ParentModel, child: ChildModel) => ParentModel
	/** The child's update (returns Model, Commands, Option&lt;OutMessage&gt;). */
	update: (
		model: ChildModel,
		message: ChildMessage
	) => Update.ReturnWithOutMessage<ChildModel, ChildMessage, OutMessage, R>
	/** Lift a child Message into the parent's Message space (for Command remapping). */
	wrap: (message: ChildMessage) => ParentMessage
	/**
	 * Handle a surfaced OutMessage. `model` already has the child's next state
	 * applied; `commands` are the child's Commands remapped through {@link wrap}.
	 * Match on `out` and return the parent's full update result (usually keep
	 * `commands`, optionally append more).
	 */
	onOut: (
		out: OutMessage,
		model: ParentModel,
		commands: Update.Commands<ParentMessage, R>
	) => Update.Return<ParentModel, ParentMessage, R>
}>

/**
 * Parent update helper: run a child's update, embed the next child Model, remap
 * Commands through `wrap`, and either return as-is (`Option.none`) or hand an
 * OutMessage to `onOut` (`Option.some`).
 */
export function delegate<ParentModel, ParentMessage, ChildModel, ChildMessage, OutMessage, R = never>(
	config: DelegateConfig<ParentModel, ParentMessage, ChildModel, ChildMessage, OutMessage, R>
): (parent: ParentModel, message: ChildMessage) => Update.Return<ParentModel, ParentMessage, R> {
	return function run(parent: ParentModel, message: ChildMessage) {
		const [nextChild, childCommands, maybeOut] = config.update(config.get(parent), message)
		// Foldkit's Command type branches on Schema.Top; mapMessages uses a simpler
		// structural shape. Cast at this boundary so delegate stays typed for apps.
		const commands = Command.mapMessages(childCommands as never, config.wrap) as Update.Commands<
			ParentMessage,
			R
		>
		const model = config.set(parent, nextChild)

		return Option.match(maybeOut, {
			onNone: () => [model, commands] as Update.Return<ParentModel, ParentMessage, R>,
			onSome: (out: OutMessage) => config.onOut(out, model, commands),
		})
	}
}
