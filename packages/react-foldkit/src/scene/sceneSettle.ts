import { Array } from "effect"

export const SceneRenderLimit = 100

/**
 * Renders until a pass produces no effect messages.
 * `applyEffectMessage` is the runner's update without the Command boundary check.
 */
export function settleSimulation<Simulation>(
	simulation: Simulation,
	render: (simulation: Simulation) => readonly [Simulation, ReadonlyArray<unknown>],
	applyEffectMessage: (simulation: Simulation, message: unknown) => Simulation
): Simulation {
	let current = simulation
	for (let pass = 0; pass < SceneRenderLimit; pass++) {
		const [rendered, messages] = render(current)
		if (messages.length === 0) return rendered
		current = Array.reduce(messages, rendered, applyEffectMessage)
	}
	throw new Error("React Scene did not settle after 100 renders. Check Effects that dispatch on every render.")
}
