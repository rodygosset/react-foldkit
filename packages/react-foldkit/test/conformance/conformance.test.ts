import { describe, expect, it } from "@effect/vitest"
import { Effect, Function, Schema } from "effect"
import * as Cases from "./cases"
import { type Case, foldkitRuntime, run, storeRuntime, type Tagged } from "./harness"

// Runs one program on the React Foldkit Store and on Foldkit's own runtime. Both must produce the
// expected trace, so a Foldkit upgrade that changes one of these behaviors fails here first.
const conforms = <
	ModelSchema extends Schema.Codec<unknown, unknown>,
	MessageSchema extends Schema.Codec<Tagged, unknown>,
	R,
>(
	conformanceCase: Case<ModelSchema, MessageSchema, R>
) =>
	Effect.gen(function* () {
		const normalize = conformanceCase.normalize ?? Function.identity
		const store = normalize(yield* run(storeRuntime, conformanceCase))
		const foldkit = normalize(yield* run(foldkitRuntime, conformanceCase))
		expect(store).toEqual(conformanceCase.expected)
		expect(foldkit).toEqual(conformanceCase.expected)
		expect(store).toEqual(foldkit)
	})

describe("conformance with the Foldkit runtime", function () {
	it.live("delivers init Command Messages after the init Model", () => conforms(Cases.init))
	it.live("applies external Messages in the order they were sent", () => conforms(Cases.fifo))
	it.live("delivers a Command's Message after the Message that returned it", () => conforms(Cases.commandChain))
	it.live("delivers every Command in a batch", () => conforms(Cases.batch))
	it.live("starts, keeps, restarts, and stops Subscriptions from their dependencies", () =>
		conforms(Cases.subscriptionLifecycle)
	)
	it.live("delivers Subscription Messages in emission order", () => conforms(Cases.subscriptionMessages))
	it.live("interrupts running Commands and reports a missing one", () => conforms(Cases.interrupt))
	it.live("loads, replaces, and revalidates a Query", () => conforms(Cases.query))
	it.live("stops after a crash and reports its Message once", () => conforms(Cases.crash))
})
