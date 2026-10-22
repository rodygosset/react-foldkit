import * as FoldkitScene from "foldkit/scene"
import { isBoundSceneSimulation, isBoundSceneView } from "./sceneBinding"
import { inside as insideBoundReactScene, scene as runBoundReactScene } from "./vendor/scene.js"

// Runners and interactions dispatch on the view. Other names remain Foldkit's own API.
export * from "foldkit/scene"

type UntypedScene = (config: Readonly<{ view: Function }>, ...steps: ReadonlyArray<unknown>) => void
type UntypedInside = (parent: unknown, ...steps: ReadonlyArray<unknown>) => (simulation: unknown) => unknown

const sceneFoldkit = FoldkitScene.scene as unknown as UntypedScene
const insideFoldkit = FoldkitScene.inside as unknown as UntypedInside

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
export const scene: typeof FoldkitScene.scene = ((
	config: Readonly<{ view: Function }>,
	...steps: ReadonlyArray<unknown>
) =>
	(isBoundSceneView(config.view) ? runBoundReactScene : sceneFoldkit)(
		config,
		...steps
	)) as unknown as typeof FoldkitScene.scene

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
export const inside: typeof FoldkitScene.inside = ((parent: unknown, ...steps: ReadonlyArray<unknown>) =>
	(simulation: unknown) =>
		(isBoundSceneSimulation(simulation) ? insideBoundReactScene : insideFoldkit)(
			parent,
			...steps
		)(simulation)) as unknown as typeof FoldkitScene.inside

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
