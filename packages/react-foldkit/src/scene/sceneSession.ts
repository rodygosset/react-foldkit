import { Cause, Effect, Exit } from "effect"
import { disposeSceneRenderSession } from "./sceneBinding"
import type { SceneRenderSession } from "./sceneBinding"

export function runSceneSession(session: SceneRenderSession, use: () => void): void {
	const exit = Effect.runSyncExit(
		Effect.acquireUseRelease(
			Effect.succeed(session),
			() => Effect.sync(use),
			(current) => Effect.sync(() => disposeSceneRenderSession(current))
		)
	)
	if (Exit.isFailure(exit)) {
		const errors = exit.cause.reasons.map((reason) => Cause.squash(Cause.fromReasons([reason])))
		if (errors.length > 1) throw new AggregateError(errors, "Scene execution and cleanup failed")
		throw Cause.squash(exit.cause)
	}
}
