import { type Cause, Effect } from "effect"
import { CommitError, Crashed, type Inactive } from "react-foldkit/store"
import { expectTypeOf } from "vitest"

expectTypeOf<Extract<CommitError["reason"], { _tag: "Crashed" }>["cause"]>().toEqualTypeOf<Cause.Cause<unknown>>()

declare const committing: Effect.Effect<void, CommitError>
// Effect 4 reason handling narrows to the named reason and leaves the rest typed.
const recovered = committing.pipe(
	Effect.catchReason("CommitError", "Inactive", function (reason) {
		expectTypeOf(reason).toEqualTypeOf<Inactive>()
		return Effect.void
	})
)
expectTypeOf(recovered).toEqualTypeOf<Effect.Effect<void, CommitError>>()

if (false) {
	// @ts-expect-error A crashed commit requires its Cause.
	new CommitError({ reason: new Crashed() })
}
