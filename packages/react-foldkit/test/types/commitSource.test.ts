import type { AnyRouter } from "@tanstack/react-router"
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { CommitSource as RootCommitSource } from "react-foldkit"
import * as CommitSource from "react-foldkit/commitSource"
import * as TanStackSource from "react-foldkit/tanstack"
import { describe, expectTypeOf, it } from "vitest"

const Data = Schema.Struct({ id: Schema.String, at: Schema.DateFromString })
type Data = typeof Data.Type
const Loader = CommitSource.define({ name: "Project", data: Data, key: data => data.id })
class Reader extends Context.Service<Reader, { readonly value: Data }>()("LoaderTypeTest/Reader") {}
declare const router: AnyRouter
declare const serviceful: Schema.Codec<Data, typeof Data.Encoded, Reader, Reader>
declare const input: Effect.Effect<Data, "unavailable", Reader>

describe("CommitSource public types", () => {
	it("exports the same declaration API from the root", () => {
		expectTypeOf(RootCommitSource.define).toEqualTypeOf<typeof CommitSource.define>()
		expectTypeOf(Loader).toEqualTypeOf<CommitSource.Loader<Data, typeof Data.Encoded>>()
	})

	if (false) {
		const program = input.pipe(Loader.load)
		expectTypeOf(program).toEqualTypeOf<Effect.Effect<
			CommitSource.Envelope<typeof Data.Encoded>, "unavailable" | Schema.SchemaError, Reader
		>>()
		// @ts-expect-error Required services are preserved until host provisioning.
		Effect.runPromise(program)
		const runtime = ManagedRuntime.make(Layer.succeed(Reader, { value: { id: "a", at: new Date() } }))
		runtime.runPromise(program)
		// @ts-expect-error load accepts no runtime or execution options.
		Loader.load(input, { runtime })
		// @ts-expect-error load accepts no Layer.
		Loader.load(input, Layer.empty)
		// @ts-expect-error The input must produce the declared decoded payload.
		Loader.load(Effect.succeed({ id: "a", at: "encoded" }))
		// @ts-expect-error The Codec must encode/decode without services.
		CommitSource.define({ name: "Serviceful", data: serviceful, key: data => data.id })
		// @ts-expect-error Resource keys are strings.
		CommitSource.define({ name: "Invalid", data: Data, key: () => 42 })

		const mapped = Loader.pipe(CommitSource.mapMessages((data, receipt) => ({
			_tag: "Project" as const, data, receipt,
		})))
		expectTypeOf(mapped).toEqualTypeOf<CommitSource.Loader<Data, typeof Data.Encoded, {
			_tag: "Project", data: Data, receipt: CommitSource.Receipt,
		}>>()
		const other = CommitSource.define({
			name: "Count", data: Schema.Number, key: () => "count",
			toMessage: (count, receipt) => ({ _tag: "Count" as const, count, receipt }),
		})
		const source = TanStackSource.make(router, [mapped, other])
		expectTypeOf(source).toEqualTypeOf<CommitSource.CommitSource<
			{ _tag: "Project", data: Data, receipt: CommitSource.Receipt } |
			{ _tag: "Count", count: number, receipt: CommitSource.Receipt }
		>>()
		// @ts-expect-error Message mapping receives the declaration's payload, not arbitrary values.
		CommitSource.mapMessages(Loader, (data: number) => data)
	}
})
