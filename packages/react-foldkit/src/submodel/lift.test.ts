// @vitest-environment node

import { expect, it } from "@effect/vitest"
import { Effect, Option, Result, Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { expectTypeOf } from "vitest"
import * as Lift from "./lift"
import * as ReactStore from "../react/reactStore"

it.effect("server reads cannot replace an optional source's last live snapshot", () =>
	Effect.gen(function* () {
		const store = ReactStore.make(
			{ update: (_model: Option.Option<number>, message: Option.Option<number>) => ({ model: message }) },
			{ model: Option.some(1) }
		)
		yield* store.activate
		const projected = Lift.projectOptional(
			{
				getSnapshot: store.getModel,
				getServerSnapshot: store.getServerModel,
				subscribe: store.subscribe,
				dispatch: store.dispatch,
			},
			{ read: (model) => model, toParentMessage: (message: Option.Option<number>) => message }
		)
		const source = Option.getOrThrow(projected.source())
		Result.getOrThrow(store.commit(Option.some(2)))
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
		Result.getOrThrow(store.commit(Option.none()))
		expect(projected.presence.getSnapshot()).toBe(false)
		expect(source.getSnapshot()).toBe(2)
		expect(source.getServerSnapshot()).toBe(1)
	})
)

it("constructs optional sources only after presence and retains live and server models separately", function () {
	let current = Option.none<number>()
	const projected = Lift.projectOptional(
		{
			getSnapshot: () => current,
			getServerSnapshot: () => Option.none<number>(),
			subscribe: () => function () {},
			dispatch() {},
		},
		{ read: (model) => model, toParentMessage: (message: number) => message }
	)
	expect(projected.source()).toEqual(Option.none())
	expect(projected.presence.getSnapshot()).toBe(false)
	current = Option.some(1)
	const source = Option.getOrThrow(projected.source())
	expect(projected.source()).toBe(projected.source())
	expect(source.getSnapshot()).toBe(1)
	expect(source.getServerSnapshot()).toBe(1)
	current = Option.some(2)
	expect(source.getSnapshot()).toBe(2)
	current = Option.none()
	expect(projected.presence.getSnapshot()).toBe(false)
	expect(source.getSnapshot()).toBe(2)
	expect(source.getServerSnapshot()).toBe(1)
})

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
	const child = Lift.lift<Parent>()("child", { update: childUpdate, toParentMessage })
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
	const child = Lift.lift<Parent>()("child", {
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
	Lift.lift<Parent>()("missing", { update: childUpdate, toParentMessage })
})
