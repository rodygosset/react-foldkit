// @vitest-environment node

import { expect, expectTypeOf, it } from "vitest"
import { Effect, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Lift from "./lift"

const ChildMessage = defineMessageUnion({ Changed: { text: Schema.String }, Submitted: {} })
type ChildMessage = typeof ChildMessage.Type

const ChildOut = defineMessageUnion({ Saved: { text: Schema.String } })
type ChildOut = typeof ChildOut.Type

type Child = { readonly text: string }

const childUpdate = (model: Child, message: ChildMessage) =>
	ChildMessage.match<Update.Return<Child, ChildMessage>>(message, {
		Changed: ({ text }) => ({
			model: modifyFields(model, { text: () => text }),
			commands: [{ name: "Echo", effect: Effect.succeed(ChildMessage.Submitted()) }],
		}),
		Submitted: () => ({ model }),
	})

const childUpdateWithOut = (model: Child, message: ChildMessage) =>
	ChildMessage.match<Update.ReturnWithOutMessage<Child, ChildMessage, ChildOut>>(message, {
		Changed: ({ text }) => ({ model: modifyFields(model, { text: () => text }) }),
		Submitted: () => ({ model: { text: "" }, outMessage: ChildOut.Saved({ text: model.text }) }),
	})

const Message = defineMessageUnion({ GotChildMessage: { message: ChildMessage } })
type Message = typeof Message.Type

type Parent = { readonly child: Child; readonly saved: ReadonlyArray<string> }

const toParentMessage = (message: ChildMessage) => Message.GotChildMessage({ message })

it("reads, writes, and folds a child field with lifted Commands", function () {
	const child = Lift.field<Parent>()("child", { update: childUpdate, toParentMessage })
	const parent: Parent = { child: { text: "a" }, saved: [] }

	expect(child.key).toBe("child")
	expect(child.read(parent)).toBe(parent.child)
	expect(child.write(parent, parent.child)).toBe(parent)

	const result = child.fold(parent, ChildMessage.Changed({ text: "b" }))
	expect(result.model).toEqual({ child: { text: "b" }, saved: [] })
	expect(result.commands?.map((command) => command.name)).toEqual(["Echo"])
	expect(Effect.runSync(result.commands![0]!.effect)).toEqual(toParentMessage(ChildMessage.Submitted()))

	expectTypeOf(result).toExtend<Update.Return<Parent, Message>>()
})

it("folds child OutMessages into the parent", function () {
	const child = Lift.field<Parent>()("child", {
		update: childUpdateWithOut,
		toParentMessage,
		foldOutMessage: (out) => (model: Parent) => ({
			model: modifyFields(model, { saved: (saved) => [...saved, out.text] }),
		}),
	})
	const result = child.fold({ child: { text: "draft" }, saved: [] }, ChildMessage.Submitted())
	expect(result.model).toEqual({ child: { text: "" }, saved: ["draft"] })
})

it("rejects keys that are not parent fields", function () {
	// @ts-expect-error "missing" is not a field of Parent
	Lift.field<Parent>()("missing", { update: childUpdate, toParentMessage })
})
