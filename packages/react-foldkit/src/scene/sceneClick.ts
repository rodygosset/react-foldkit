import { Array, Option } from "effect"
import { getSceneEventHandler, runSceneInteraction } from "./sceneBinding"
import { dispatchSceneEvent, hasSceneListener, hostFromElm } from "./sceneEvent"
import { assignChecked, type Checkable, type CheckedSnapshot, revertChecked, snapshotChecked } from "./sceneInput"
import type { HostElement } from "./sceneHost"
import { allSelector, ancestorsOf, type SceneNode } from "./vendor/query.js"

export type ClickListeners = { readonly _tag: "Found" } | { readonly _tag: "Missing" }

function stringAttribute(node: SceneNode, name: string): Option.Option<string> {
	const fromAttrs = node.data?.attrs?.[name]
	if (typeof fromAttrs === "string") return Option.some(fromAttrs)
	const fromProps = node.data?.props?.[name]
	if (typeof fromProps === "string") return Option.some(fromProps)
	return Option.none()
}

const childElements = (node: SceneNode): ReadonlyArray<SceneNode> =>
	Array.getSomes(
		Array.map(node.children ?? [], (child) => (typeof child === "string" ? Option.none() : Option.some(child)))
	)

function elementById(root: SceneNode, id: string): Option.Option<SceneNode> {
	if (Option.contains(stringAttribute(root, "id"), id)) return Option.some(root)
	for (const child of childElements(root)) {
		const match = elementById(child, id)
		if (Option.isSome(match)) return match
	}
	return Option.none()
}

const formOwnerOf = (root: SceneNode, node: SceneNode): Option.Option<SceneNode> =>
	Option.match(stringAttribute(node, "form"), {
		onSome: (formId) => Option.filter(elementById(root, formId), (element) => element.sel === "form"),
		onNone: () => Array.findLast(ancestorsOf(node)(root), (element) => element.sel === "form"),
	})

const sameForm = (left: Option.Option<SceneNode>, right: Option.Option<SceneNode>): boolean =>
	Option.match(left, {
		onNone: () => Option.isNone(right),
		onSome: (form) => Option.isSome(right) && form === right.value,
	})

function isSubmitButton(element: SceneNode): boolean {
	const controlType = Option.map(stringAttribute(element, "type"), (value) => value.toLowerCase())
	if (element.sel === "button") {
		return Option.match(controlType, {
			onNone: () => true,
			onSome: (value) => value !== "button" && value !== "reset",
		})
	}
	if (element.sel === "input") {
		return Option.match(controlType, {
			onNone: () => false,
			onSome: (value) => value === "submit" || value === "image",
		})
	}
	return false
}

function radioGroup(root: SceneNode, target: SceneNode): ReadonlyArray<HostElement> {
	const form = formOwnerOf(root, target)
	const radios = Option.match(stringAttribute(target, "name"), {
		onNone: () => [target],
		onSome: (name) =>
			name === ""
				? [target]
				: allSelector('input[type="radio"]')(root).filter(
						(radio) =>
							Option.contains(stringAttribute(radio, "name"), name) &&
							sameForm(formOwnerOf(root, radio), form)
					),
	})
	return Array.getSomes(Array.map(radios, (radio) => Option.fromNullishOr(hostFromElm(radio.elm))))
}

function checkableOf(root: SceneNode, element: SceneNode): Option.Option<Checkable> {
	if (element.sel !== "input") return Option.none()
	const target = hostFromElm(element.elm)
	if (target === undefined) return Option.none()
	const inputType = stringAttribute(element, "type")
	if (Option.contains(inputType, "checkbox")) return Option.some({ _tag: "Checkbox", target })
	if (Option.contains(inputType, "radio"))
		return Option.some({ _tag: "Radio", target, group: radioGroup(root, element) })
	return Option.none()
}

function checkedChanged(snapshot: CheckedSnapshot, checkable: Checkable): boolean {
	const next = snapshotChecked(checkable)
	return snapshot.some(function (entry, index) {
		const current = next[index]
		return current === undefined || entry[0] !== current[0] || entry[1] !== current[1]
	})
}

const ranSubmit = (root: SceneNode, propagationPath: ReadonlyArray<SceneNode>): boolean =>
	Option.match(Array.findFirst(propagationPath, isSubmitButton), {
		onNone: () => false,
		onSome: (submitter) =>
			Option.match(formOwnerOf(root, submitter), {
				onNone: () => false,
				onSome(form) {
					const handler = getSceneEventHandler(form, "submit")
					if (handler === undefined) return false
					handler({ preventDefault() {} })
					return true
				},
			}),
	})

/**
 * Activates a click on a bound React host.
 * The vendor click step still resolves the target, rejects disabled elements, and reports a missing handler.
 */
export function runClick(
	html: SceneNode,
	element: SceneNode,
	propagationPath: ReadonlyArray<SceneNode>
): ClickListeners {
	const host = hostFromElm(element.elm)
	if (host === undefined) return { _tag: "Missing" }
	const checkable = checkableOf(html, element)
	const snapshot = Option.match(checkable, {
		onNone: (): CheckedSnapshot => [],
		onSome: snapshotChecked,
	})
	Option.match(checkable, {
		onNone: () => undefined,
		onSome: assignChecked,
	})
	const clickListening = hasSceneListener(host, "click")
	const changeListening = Option.isSome(checkable) && hasSceneListener(host, "change")
	let submitRan = false
	runSceneInteraction(function () {
		const changed = Option.match(checkable, {
			onNone: () => false,
			onSome: (value) => checkedChanged(snapshot, value),
		})
		const defaultPrevented = dispatchSceneEvent(host, "click", {}, changed && changeListening ? ["change"] : [])
		if (defaultPrevented) revertChecked(snapshot)
		else submitRan = ranSubmit(html, propagationPath)
	})
	if (clickListening || changeListening || submitRan) return { _tag: "Found" }
	return { _tag: "Missing" }
}
