import type { Application } from "../application/react"
import { bindSceneView as makeBoundSceneView } from "./sceneBinding"
import type { SceneView } from "./sceneView"

/**
 * Binds a React component that reads an Application's hooks to Foldkit's Scene view contract.
 *
 * **When to use**
 *
 * Export the result as the feature's `view`, then pass it to `scene` from `react-foldkit/scene`
 * with the feature's `update`. When the feature moves to a Foldkit view, export that view instead and
 * change the test import to `foldkit/scene`.
 *
 * **Details**
 *
 * Each `scene` call renders the component in a private React root. `useModel` reads the
 * Scene's current Model and `useSend` records Messages for Scene instead of dispatching them to a
 * Store. Synchronous React state updates and Effects finish before the next step. Effect Messages
 * pass through update, and Commands remain pending until the test resolves them. The root unmounts
 * when the scene finishes or a step throws.
 *
 * **Gotchas**
 *
 * - The component must render one host element at its root.
 * - React views produce no Foldkit Mounts or element hooks, so `Mount` steps and `toHaveHook` do not apply.
 * - Timers, promises, transitions, and suspended work need an asynchronous test outside Scene.
 * - Scene fails after 100 renders if Effect Messages do not settle.
 *
 * **Example** (Bind a feature view for Scene tests)
 *
 * ```tsx
 * import { bindSceneView } from "react-foldkit/scene/react"
 * import { App } from "./application"
 *
 * function Profile() {
 *   const model = App.useModel()
 *   const send = App.useSend()
 *   return <button onClick={() => send.ClickedLoad()}>{model.name}</button>
 * }
 *
 * export const view = bindSceneView(App, Profile)
 * ```
 *
 * @category testing
 * @since 0.2.0
 */
export const bindSceneView = <Model, Message, R, HasInit extends boolean>(
	application: Application<Model, Message, R, HasInit>,
	Component: React.ComponentType
): SceneView<Model, Message> => makeBoundSceneView(application, Component)
