import type { SceneSimulation } from "foldkit/scene"

export type SceneNode = SceneSimulation<unknown, unknown>["html"]

export function ancestorsOf(target: SceneNode): (root: SceneNode) => ReadonlyArray<SceneNode>

export function allSelector(css: string): (root: SceneNode) => ReadonlyArray<SceneNode>
