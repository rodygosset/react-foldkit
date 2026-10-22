import type { AnyCommand, Locator, SceneSimulation, SceneStep } from "foldkit/scene"
import type { Document, Html, HtmlBuilder } from "foldkit/html"

export declare function scene<Model, Message, OutMessage = never>(
	config: Readonly<{
		update: (
			model: Model,
			message: Message
		) => Readonly<{
			model: Model
			commands?: ReadonlyArray<AnyCommand>
			outMessage?: OutMessage
		}>
		view: (model: Model, html: HtmlBuilder<Message>) => Html | Document
	}>,
	...steps: ReadonlyArray<SceneStep<Model, Message, OutMessage>>
): void

export declare function inside<Model, Message, OutMessage = undefined>(
	parent: Locator,
	...steps: ReadonlyArray<SceneStep<Model, Message, OutMessage>>
): (
	simulation: SceneSimulation<Model, Message, OutMessage>
) => SceneSimulation<Model, Message, OutMessage>

export {
	click,
	doubleClick,
	contextMenu,
	pointerDown,
	pointerUp,
	hover,
	focus,
	blur,
	focusEnter,
	focusLeave,
	submit,
	change,
	changeFiles,
	dropFiles,
	type,
	typeContentEditable,
	beforeInput,
	keydown,
} from "foldkit/scene"
