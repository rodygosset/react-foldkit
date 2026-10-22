import { Array, Option } from "effect"
import { getSceneEventHandler, runSceneInteraction } from "./sceneBinding"
import { hasSceneListener, hostFromElm, hostPath, invokeHandlers, makeHostEvent } from "./sceneEvent"
import { assignChecked, type Checkable, type CheckedSnapshot, revertChecked, snapshotChecked } from "./sceneInput"
import type { HostElement } from "./sceneHost"
import { allSelector, ancestorsOf } from "./vendor/query.js"

interface SceneNode {
	readonly sel?: string
	readonly data?: {
		readonly attrs?: Readonly<Record<string, unknown>>
		readonly props?: Readonly<Record<string, unknown>>
	}
	readonly children?: ReadonlyArray<SceneNode | string>
	readonly elm?: unknown
}

export type ClickListeners = { readonly _tag: "Found" } | { readonly _tag: "Missing" }

function stringAttribute(node: SceneNode, name: string): string | undefined {
	const fromAttrs = node.data?.attrs?.[name]
	if (typeof fromAttrs === "string") return fromAttrs
	const fromProps = node.data?.props?.[name]
	if (typeof fromProps === "string") return fromProps
	return undefined
}

function findElementById(root: SceneNode, id: string): Option.Option<SceneNode> {
	if (stringAttribute(root, "id") === id) return Option.some(root)
	for (const child of root.children ?? []) {
		if (typeof child === "string") continue
		const match = findElementById(child, id)
		if (Option.isSome(match)) return match
	}
	return Option.none()
}

function formOwnerOf(root: SceneNode, node: SceneNode): Option.Option<SceneNode> {
	const formId = stringAttribute(node, "form")
	if (formId !== undefined) {
		return Option.filter(findElementById(root, formId), (element) => element.sel === "form")
	}
	return Array.findLast(ancestorsOf(node)(root) as ReadonlyArray<SceneNode>, (element) => element.sel === "form")
}

function isSubmitButton(element: SceneNode): boolean {
	const rawType = stringAttribute(element, "type")
	const maybeType = Option.map(Option.fromNullishOr(rawType), (value) => value.toLowerCase())
	if (element.sel === "button") {
		return Option.match(maybeType, {
			onNone: () => true,
			onSome: (value) => value !== "button" && value !== "reset",
		})
	}
	if (element.sel === "input") {
		return Option.match(maybeType, {
			onNone: () => false,
			onSome: (value) => value === "submit" || value === "image",
		})
	}
	return false
}

function radioGroup(root: SceneNode, target: SceneNode): ReadonlyArray<HostElement> {
	const name = stringAttribute(target, "name")
	const form = Option.getOrUndefined(formOwnerOf(root, target))
	const nodes =
		name === undefined || name === ""
			? [target]
			: (allSelector('input[type="radio"]')(root) as ReadonlyArray<SceneNode>).filter(
					(radio) =>
						stringAttribute(radio, "name") === name &&
						Option.getOrUndefined(formOwnerOf(root, radio)) === form
				)
	const hosts: Array<HostElement> = []
	for (const node of nodes) {
		const host = hostFromElm(node.elm)
		if (host !== undefined) hosts.push(host)
	}
	return hosts
}

function checkableOf(root: SceneNode, element: SceneNode): Option.Option<Checkable> {
	if (element.sel !== "input") return Option.none()
	const target = hostFromElm(element.elm)
	if (target === undefined) return Option.none()
	const inputType = stringAttribute(element, "type")
	if (inputType === "checkbox") return Option.some({ _tag: "Checkbox", target })
	if (inputType === "radio") return Option.some({ _tag: "Radio", target, group: radioGroup(root, element) })
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
		const event = makeHostEvent(host, {})
		invokeHandlers(hostPath(host), "click", event)
		const changed = Option.match(checkable, {
			onNone: () => false,
			onSome: (value) => checkedChanged(snapshot, value),
		})
		if (changed && changeListening) invokeHandlers(hostPath(host), "change", event)
		if (event.defaultPrevented) revertChecked(snapshot)
		else submitRan = ranSubmit(html, propagationPath)
	})
	if (clickListening || changeListening || submitRan) return { _tag: "Found" }
	return { _tag: "Missing" }
}
