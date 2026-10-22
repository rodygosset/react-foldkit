import { Array } from "effect"
import type { HostElement } from "./sceneHost"
import { eventProps, isTextInput } from "./sceneHost"
import { syncSelect } from "./sceneInput"

export interface HostEvent {
	readonly target: HostElement
	currentTarget: HostElement
	readonly defaultPrevented: boolean
	preventDefault(): void
	stopPropagation(): void
	readonly propagationStopped: boolean
	resetPropagation(): void
}

const omittedFields = new Set([
	"target",
	"currentTarget",
	"preventDefault",
	"stopPropagation",
	"defaultPrevented",
	"isDefaultPrevented",
	"isPropagationStopped",
	"propagationStopped",
	"resetPropagation",
])

export function sceneListeners(node: HostElement): Record<string, (event: HostEvent) => void> {
	const on: Record<string, (event: HostEvent) => void> = {}
	for (const [name, value] of Object.entries(node.props)) {
		if (typeof value !== "function") continue
		const capture = name.endsWith("Capture")
		const reactName = capture ? name.slice(0, -7) : name
		const eventName = eventProps[reactName]
		if (eventName === undefined) continue
		on[capture ? `${eventName}Capture` : eventName] = value as (event: HostEvent) => void
	}
	return on
}

export function sceneEventNames(eventName: string, target: HostElement): ReadonlyArray<string> {
	const name = eventName === "focusin" ? "focus" : eventName === "focusout" ? "blur" : eventName
	if (name === "input" && isTextInput(target)) return ["input", "change"]
	if (name === "hover") return ["mouseover", "mouseenter"]
	return [name]
}

export function hostPath(target: HostElement): ReadonlyArray<HostElement> {
	const path: Array<HostElement> = []
	let current: HostElement | undefined = target
	while (current !== undefined) {
		path.push(current)
		current = current.parent
	}
	return path
}

export function hasSceneListener(target: HostElement, eventName: string): boolean {
	const names = sceneEventNames(eventName, target)
	return hostPath(target).some(function (node) {
		const listeners = sceneListeners(node)
		return names.some((name) => listeners[name] !== undefined || listeners[`${name}Capture`] !== undefined)
	})
}

function eventPayload(fields: Readonly<Record<string, unknown>>): Record<string, unknown> {
	const payload: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(fields)) {
		if (!omittedFields.has(key)) payload[key] = value
	}
	return payload
}

function proposeHostValue(target: HostElement, eventName: string, fields: Readonly<Record<string, unknown>>): void {
	const names = sceneEventNames(eventName, target)
	const proposesValue = names.includes("input") || names.includes("change")
	if (!proposesValue) return
	const proposed = fields.target
	if (proposed === null || typeof proposed !== "object" || "tagName" in proposed) return
	Object.assign(target, proposed)
	if (target.tag === "select") syncSelect(target, target.value, false)
}

export function makeHostEvent(target: HostElement, fields: Readonly<Record<string, unknown>>): HostEvent {
	let defaultPrevented = fields.defaultPrevented === true
	let propagationStopped = false
	const sourcePreventDefault = fields.preventDefault
	const sourceStopPropagation = fields.stopPropagation
	return {
		...eventPayload(fields),
		target,
		currentTarget: target,
		get defaultPrevented() {
			return defaultPrevented
		},
		preventDefault() {
			defaultPrevented = true
			if (typeof sourcePreventDefault === "function") sourcePreventDefault()
		},
		stopPropagation() {
			propagationStopped = true
			if (typeof sourceStopPropagation === "function") sourceStopPropagation()
		},
		get propagationStopped() {
			return propagationStopped
		},
		resetPropagation() {
			propagationStopped = false
		},
	}
}

function deliver(node: HostElement, name: string, event: HostEvent): void {
	event.currentTarget = node
	const listener = sceneListeners(node)[name]
	if (listener !== undefined) listener(event)
}

export function invokeHandlers(path: ReadonlyArray<HostElement>, eventName: string, event: HostEvent): void {
	const target = path[0]
	if (target === undefined) return
	for (const name of sceneEventNames(eventName, target)) {
		event.resetPropagation()
		const rootFirst = Array.reverse(path)
		for (const node of rootFirst) {
			deliver(node, `${name}Capture`, event)
			if (event.propagationStopped) break
		}
		if (event.propagationStopped) continue
		for (const node of name === "mouseenter" ? rootFirst : path) {
			deliver(node, name, event)
			if (event.propagationStopped) break
		}
	}
}

export function dispatchSceneEvent(
	target: HostElement,
	eventName: string,
	fields: Readonly<Record<string, unknown>>
): HostEvent {
	proposeHostValue(target, eventName, fields)
	const event = makeHostEvent(target, fields)
	invokeHandlers(hostPath(target), eventName, event)
	return event
}

export function hostFromElm(elm: unknown): HostElement | undefined {
	if (elm === null || typeof elm !== "object" || !("tag" in elm)) return undefined
	return elm as HostElement
}
