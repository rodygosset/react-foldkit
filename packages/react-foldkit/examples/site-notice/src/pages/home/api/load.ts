import { Effect } from "effect"
import * as Notice from "@/entities/notice"

/** Thin page load: one Effect export. No Model, Message, or settlement. */
export const load = () =>
	Notice.loader.load(
		Effect.succeed(
			Notice.Notice.make({
				id: "launch",
				headline: "Launch week",
				body: "Static payload. No Query slot.",
			})
		)
	)
