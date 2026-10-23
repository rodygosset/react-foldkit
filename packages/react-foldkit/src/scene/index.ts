import type { Document, Html, HtmlBuilder } from "foldkit/html"
import type { AnyCommand } from "foldkit/scene"
import * as FoldkitScene from "foldkit/scene"
import { isBoundSceneSimulation, isBoundSceneView } from "./sceneBinding"
import { inside as insideBoundReactScene, scene as runBoundReactScene } from "./vendor/scene.js"

// Runners, interactions, and role queries adapt bound React views. Other names remain Foldkit's own API.
export * from "foldkit/scene"
export { getByRole, getAllByRole, role, all } from "./sceneQueries"

/**
 * Runs Foldkit Scene steps against a Foldkit view or a React view bound with `bindSceneView`.
 *
 * **Details**
 *
 * The signature and steps are Foldkit's `scene` from `foldkit/scene`. A Foldkit view runs on Foldkit's
 * runner. A bound React view runs on a copy of that runner, pinned to the tested Foldkit release, that
 * renders the component in a private React root and unmounts it when the scene ends or a step throws.
 *
 * **Gotchas**
 *
 * - React views produce no Foldkit Mounts or element hooks, so `Mount` steps and `toHaveHook` do not apply.
 *
 * @category testing
 * @since 0.2.0
 */
export const scene: typeof FoldkitScene.scene = function <Model, Message, OutMessage = never>(
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
	...steps: ReadonlyArray<FoldkitScene.SceneStep<Model, Message, OutMessage>>
): void {
	if (isBoundSceneView(config.view)) {
		runBoundReactScene(config, ...steps)
		return
	}
	FoldkitScene.scene(config, ...steps)
} as unknown as typeof FoldkitScene.scene

/**
 * Runs steps with locators scoped to a parent element, as Foldkit's `inside` does.
 *
 * **Details**
 *
 * Scenes of bound React views re-enter the copied runner, so scoped steps render the React view.
 *
 * @category testing
 * @since 0.2.0
 */
export const inside: typeof FoldkitScene.inside = <Model, Message, OutMessage = undefined>(
	parent: FoldkitScene.Locator,
	...steps: ReadonlyArray<FoldkitScene.SceneStep<Model, Message, OutMessage>>
) =>
	function (simulation: FoldkitScene.SceneSimulation<Model, Message, OutMessage>) {
		if (isBoundSceneSimulation(simulation)) {
			return insideBoundReactScene(parent, ...steps)(simulation)
		}
		return FoldkitScene.inside<Model, Message, OutMessage>(parent, ...steps)(simulation)
	}

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
} from "./sceneInteractions"
