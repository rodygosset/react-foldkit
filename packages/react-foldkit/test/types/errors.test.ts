import type { Cause } from "effect"
import { CommitSourceError } from "react-foldkit/commitSource"
import { CommitError } from "react-foldkit/store"
import { expectTypeOf } from "vitest"

expectTypeOf<Extract<CommitError["details"], { reason: "Crashed" }>["cause"]>().toEqualTypeOf<Cause.Cause<unknown>>()
expectTypeOf<Extract<CommitSourceError["details"], { reason: "DuplicateKey" }>["key"]>().toEqualTypeOf<string>()
if (false) {
	// @ts-expect-error A crashed commit requires its Cause.
	new CommitError({ details: { reason: "Crashed" } })
	// @ts-expect-error Duplicate keys must identify the key.
	new CommitSourceError({ details: { reason: "DuplicateKey" } })
	// @ts-expect-error Source violations do not accept Store reasons.
	new CommitSourceError({ details: { reason: "Disposed" } })
}
