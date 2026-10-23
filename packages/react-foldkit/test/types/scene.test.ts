import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import * as FoldkitScene from "foldkit/scene"
import * as Application from "react-foldkit/application"
import * as Scene from "react-foldkit/scene"
import { bindSceneView } from "react-foldkit/scene/react"
import { expectTypeOf, it } from "vitest"

it("preserves Foldkit's generic Scene step signatures", function () {
	expectTypeOf<typeof Scene.scene>().toEqualTypeOf<typeof FoldkitScene.scene>()
	expectTypeOf<typeof Scene.inside>().toEqualTypeOf<typeof FoldkitScene.inside>()
	expectTypeOf<typeof Scene.getByRole>().toEqualTypeOf<typeof FoldkitScene.getByRole>()
	expectTypeOf<typeof Scene.getAllByRole>().toEqualTypeOf<typeof FoldkitScene.getAllByRole>()
	expectTypeOf<typeof Scene.role>().toEqualTypeOf<typeof FoldkitScene.role>()
	expectTypeOf<typeof Scene.all>().toEqualTypeOf<typeof FoldkitScene.all>()
	expectTypeOf<typeof Scene.click>().toEqualTypeOf<typeof FoldkitScene.click>()
	expectTypeOf<typeof Scene.doubleClick>().toEqualTypeOf<typeof FoldkitScene.doubleClick>()
	expectTypeOf<typeof Scene.contextMenu>().toEqualTypeOf<typeof FoldkitScene.contextMenu>()
	expectTypeOf<typeof Scene.pointerDown>().toEqualTypeOf<typeof FoldkitScene.pointerDown>()
	expectTypeOf<typeof Scene.pointerUp>().toEqualTypeOf<typeof FoldkitScene.pointerUp>()
	expectTypeOf<typeof Scene.hover>().toEqualTypeOf<typeof FoldkitScene.hover>()
	expectTypeOf<typeof Scene.focus>().toEqualTypeOf<typeof FoldkitScene.focus>()
	expectTypeOf<typeof Scene.blur>().toEqualTypeOf<typeof FoldkitScene.blur>()
	expectTypeOf<typeof Scene.focusEnter>().toEqualTypeOf<typeof FoldkitScene.focusEnter>()
	expectTypeOf<typeof Scene.focusLeave>().toEqualTypeOf<typeof FoldkitScene.focusLeave>()
	expectTypeOf<typeof Scene.submit>().toEqualTypeOf<typeof FoldkitScene.submit>()
	expectTypeOf<typeof Scene.change>().toEqualTypeOf<typeof FoldkitScene.change>()
	expectTypeOf<typeof Scene.changeFiles>().toEqualTypeOf<typeof FoldkitScene.changeFiles>()
	expectTypeOf<typeof Scene.dropFiles>().toEqualTypeOf<typeof FoldkitScene.dropFiles>()
	expectTypeOf<typeof Scene.type>().toEqualTypeOf<typeof FoldkitScene.type>()
	expectTypeOf<typeof Scene.typeContentEditable>().toEqualTypeOf<typeof FoldkitScene.typeContentEditable>()
	expectTypeOf<typeof Scene.beforeInput>().toEqualTypeOf<typeof FoldkitScene.beforeInput>()
	expectTypeOf<typeof Scene.keydown>().toEqualTypeOf<typeof FoldkitScene.keydown>()
})

if (false) {
	const Message = defineMessageUnion({ SetText: { text: Schema.String } })
	type Message = typeof Message.Type
	const update = (_model: string, message: Message) => ({ model: message.text })
	const App = Application.define({ Model: Schema.String, Message, update })
	const view = bindSceneView(App, () => null)
	Scene.scene({ update, view }, Scene.given("ready"), Scene.click(Scene.role("button")))
	// @ts-expect-error The bound view cannot read a numeric Model.
	Scene.scene({ update: (model: number, _message: Message) => ({ model }), view }, Scene.given(0))
	Scene.scene(
		{ update, view },
		Scene.given("ready"),
		// @ts-expect-error Subscription Messages must match the bound Application.
		Scene.Subscription.emit(0)
	)
}
