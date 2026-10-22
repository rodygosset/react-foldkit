import type { Option } from "effect"
import { dual } from "effect/Function"
import * as FoldkitScene from "foldkit/scene"
import { isBoundSceneSimulation } from "./sceneBinding"
import * as BoundScene from "./vendor/scene.js"

type Target = string | FoldkitScene.Locator
type Step = <Model, Message, OutMessage = undefined>(
	simulation: FoldkitScene.SceneSimulation<Model, Message, OutMessage>
) => FoldkitScene.SceneSimulation<Model, Message, OutMessage>

const adaptStep =
	(native: Step, bound: Step): Step =>
	(simulation) =>
		(isBoundSceneSimulation(simulation) ? bound : native)(simulation)

/**
 * Clicks an element with React event targets and checkbox activation in a bound React Scene.
 *
 * **Details**
 *
 * Foldkit views use Foldkit's click step. React views preserve the clicked element as `target`
 * while each handler receives its own element as `currentTarget`. Checkbox and radio change
 * handlers read the activated value. A canceled click restores the previous checked state.
 *
 * @category testing
 * @since 0.2.0
 */
export const click: typeof FoldkitScene.click = (target) =>
	adaptStep(FoldkitScene.click(target), BoundScene.click(target))

/**
 * Simulates a double-click with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const doubleClick: typeof FoldkitScene.doubleClick = (target) =>
	adaptStep(FoldkitScene.doubleClick(target), BoundScene.doubleClick(target))

/**
 * Simulates a context-menu event with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const contextMenu: typeof FoldkitScene.contextMenu = (target) =>
	adaptStep(FoldkitScene.contextMenu(target), BoundScene.contextMenu(target))

/**
 * Simulates a pointer press with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const pointerDown: typeof FoldkitScene.pointerDown = (target, options) =>
	adaptStep(FoldkitScene.pointerDown(target, options), BoundScene.pointerDown(target, options))

/**
 * Simulates a pointer release with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const pointerUp: typeof FoldkitScene.pointerUp = (target, options) =>
	adaptStep(FoldkitScene.pointerUp(target, options), BoundScene.pointerUp(target, options))

/**
 * Simulates mouseover followed by parent-first mouseenter handlers for a React view.
 * Foldkit views use Foldkit's hover step.
 *
 * @category testing
 * @since 0.2.0
 */
export const hover: typeof FoldkitScene.hover = (target) =>
	adaptStep(FoldkitScene.hover(target), BoundScene.hover(target))

/**
 * Simulates a focus event with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const focus: typeof FoldkitScene.focus = (target) =>
	adaptStep(FoldkitScene.focus(target), BoundScene.focus(target))

/**
 * Simulates a blur event with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const blur: typeof FoldkitScene.blur = (target) => adaptStep(FoldkitScene.blur(target), BoundScene.blur(target))

/**
 * Simulates focus entering a subtree with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const focusEnter: typeof FoldkitScene.focusEnter = (target) =>
	adaptStep(FoldkitScene.focusEnter(target), BoundScene.focusEnter(target))

/**
 * Simulates focus leaving a subtree with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const focusLeave: typeof FoldkitScene.focusLeave = (target) =>
	adaptStep(FoldkitScene.focusLeave(target), BoundScene.focusLeave(target))

/**
 * Simulates a form submission with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const submit: typeof FoldkitScene.submit = (target) =>
	adaptStep(FoldkitScene.submit(target), BoundScene.submit(target))

/**
 * Simulates a value change with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const change: typeof FoldkitScene.change = dual(2, (target: Target, value: string) =>
	adaptStep(FoldkitScene.change(target, value), BoundScene.change(target, value))
)

/**
 * Simulates a file selection with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const changeFiles: typeof FoldkitScene.changeFiles = dual(2, (target: Target, value: ReadonlyArray<File>) =>
	adaptStep(FoldkitScene.changeFiles(target, value), BoundScene.changeFiles(target, value))
)

/**
 * Simulates a file drop with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const dropFiles: typeof FoldkitScene.dropFiles = dual(2, (target: Target, value: ReadonlyArray<File>) =>
	adaptStep(FoldkitScene.dropFiles(target, value), BoundScene.dropFiles(target, value))
)

/**
 * Simulates a typed value with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const type: typeof FoldkitScene.type = dual(2, (target: Target, value: string) =>
	adaptStep(FoldkitScene.type(target, value), BoundScene.type(target, value))
)

/**
 * Simulates a contenteditable input with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const typeContentEditable: typeof FoldkitScene.typeContentEditable = dual(2, (target: Target, value: string) =>
	adaptStep(FoldkitScene.typeContentEditable(target, value), BoundScene.typeContentEditable(target, value))
)

/**
 * Simulates a before-input event with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const beforeInput: typeof FoldkitScene.beforeInput = dual(
	3,
	(target: Target, inputType: string, data: Option.Option<string>) =>
		adaptStep(FoldkitScene.beforeInput(target, inputType, data), BoundScene.beforeInput(target, inputType, data))
)

/**
 * Simulates a key press with React capture, bubbling, and the original host target.
 * Foldkit views use Foldkit's step. Any data-last form is preserved.
 *
 * @category testing
 * @since 0.2.0
 */
export const keydown: typeof FoldkitScene.keydown = dual(
	(args) => args.length >= 2 && typeof args[1] === "string",
	(target: Target, key: string, modifiers: Parameters<typeof FoldkitScene.keydown>[1] = {}) =>
		adaptStep(FoldkitScene.keydown(target, key, modifiers), BoundScene.keydown(target, key, modifiers))
)
