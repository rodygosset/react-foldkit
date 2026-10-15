import { type Cause, Effect } from "effect"
import { CommitSourceError, DuplicateKey } from "react-foldkit/commitSource"
import { CommitError, Crashed, type Inactive } from "react-foldkit/store"
import { expectTypeOf } from "vitest"

expectTypeOf<Extract<CommitError["reason"], { _tag: "Crashed" }>["cause"]>().toEqualTypeOf<Cause.Cause<unknown>>()
expectTypeOf<Extract<CommitSourceError["reason"], { _tag: "DuplicateKey" }>["key"]>().toEqualTypeOf<string>()

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
	// @ts-expect-error Duplicate keys must identify the key.
	new CommitSourceError({ reason: new DuplicateKey() })
	// @ts-expect-error Source violations do not accept Store reasons.
	new CommitSourceError({ reason: { _tag: "Disposed" } })
}
