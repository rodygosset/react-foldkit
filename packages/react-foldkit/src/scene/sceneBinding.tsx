import { Option } from "effect"
import React from "react"
import Reconciler from "react-reconciler"
import type ReactReconciler from "react-reconciler"
import { DiscreteEventPriority, NoEventPriority } from "react-reconciler/constants.js"
import type { Scene as SceneNamespace } from "foldkit/test"
import { all as sceneLocators } from "foldkit/scene"
import { sceneSourceContext } from "../application/react"
import type { ModelSource } from "../modelSource"
import type { SceneView } from "./sceneView"
import { FileHandlerSymbol, serializedStylePropertyName } from "./vendor/sceneCompat"

type VNode = SceneNamespace.SceneSimulation<unknown, unknown>["html"]

interface ReactBinding {
	readonly application: object
	readonly Component: React.ComponentType
}

const boundViews = new WeakMap<Function, ReactBinding>()

export function bindSceneView<Model, Message>(
	application: object,
	Component: React.ComponentType
): SceneView<Model, Message> {
	const sceneView: SceneView<Model, Message> = () => null
	boundViews.set(sceneView, { application, Component })
	return sceneView
}

interface HostProps extends Record<string, unknown> {
	readonly children?: React.ReactNode
}

interface HostText {
	text: string
}

interface HostElement {
	tag: string
	readonly type: string
	readonly name: string
	readonly id: string
	readonly dataset: Readonly<Record<string, string>>
	props: HostProps
	attributes: Record<string, string>
	children: Array<HostElement | HostText>
	parent?: HostElement
	readonly tagName: string
	value?: unknown
	checked?: boolean
	selected?: boolean
	selectedValues?: ReadonlyArray<string>
	textContent?: string
	focus: () => void
	blur: () => void
	getAttribute: (name: string) => string | null
	setAttribute: (name: string, value: string) => void
	removeAttribute: (name: string) => void
	closest: (selector: string) => HostElement | null
	contains: (node: unknown) => boolean
}

interface HostContainer {
	children: Array<HostElement | HostText>
}

const propertyNames = new Set([
	"value",
	"defaultValue",
	"checked",
	"defaultChecked",
	"selected",
	"disabled",
	"multiple",
	"readOnly",
	"required",
	"type",
	"name",
	"placeholder",
	"min",
	"max",
	"step",
	"rows",
	"cols",
	"tabIndex",
	"contentEditable",
	"role",
	"title",
	"alt",
	"href",
	"src",
	"action",
	"method",
	"form",
	"htmlFor",
	"hidden",
])

// React DOM appends "px" to numeric style values except for these unitless properties.
const unitlessStyles = new Set([
	"animationIterationCount",
	"aspectRatio",
	"columnCount",
	"flex",
	"flexGrow",
	"flexShrink",
	"fontWeight",
	"gridColumn",
	"gridRow",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"scale",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
])

const eventProps: Readonly<Record<string, string>> = {
	onClick: "click",
	onDoubleClick: "dblclick",
	onContextMenu: "contextmenu",
	onSubmit: "submit",
	onInput: "input",
	onChange: "change",
	onBeforeInput: "beforeinput",
	onFocus: "focus",
	onBlur: "blur",
	onMouseEnter: "mouseenter",
	onMouseOver: "mouseover",
	onKeyDown: "keydown",
	onPointerDown: "pointerdown",
	onPointerUp: "pointerup",
	onMouseDown: "mousedown",
	onMouseUp: "mouseup",
	onMouseMove: "mousemove",
	onMouseLeave: "mouseleave",
	onMouseOut: "mouseout",
	onReset: "reset",
	onWheel: "wheel",
	onCopy: "copy",
	onCut: "cut",
	onPaste: "paste",
	onDragStart: "dragstart",
	onDrag: "drag",
	onDragEnd: "dragend",
	onTouchStart: "touchstart",
	onTouchEnd: "touchend",
	onTouchMove: "touchmove",
	onTouchCancel: "touchcancel",
	onAnimationStart: "animationstart",
	onAnimationEnd: "animationend",
	onAnimationIteration: "animationiteration",
	onTransitionEnd: "transitionend",
	onLoad: "load",
	onError: "error",
	onPlay: "play",
	onPause: "pause",
	onEnded: "ended",
	onTimeUpdate: "timeupdate",
	onVolumeChange: "volumechange",
	onSelect: "select",
	onDrop: "drop",
	onDragOver: "dragover",
	onKeyUp: "keyup",
}

/** Stringifies a primitive prop the way React DOM writes it; other values become empty. */
const hostString = (value: unknown): string =>
	typeof value === "string"
		? value
		: typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
			? `${value}`
			: ""

let updatePriority = NoEventPriority
const rootHostContext = Object.freeze({})

const append = function (parent: HostContainer | HostElement, child: HostElement | HostText): void {
	remove(parent, child)
	if ("tag" in parent && "tag" in child) child.parent = parent
	parent.children.push(child)
}

const remove = function (parent: HostContainer | HostElement, child: HostElement | HostText): void {
	const index = parent.children.indexOf(child)
	if (index !== -1) parent.children.splice(index, 1)
	if ("tag" in parent && "tag" in child) child.parent = undefined
}

const hostConfig = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: false,
	rendererVersion: "0.1.0",
	rendererPackageName: "react-foldkit",
	extraDevToolsConfig: null,
	bindToConsole: (methodName: string, args: unknown[]) =>
		function () {
			const method = console[methodName as keyof Console]
			if (typeof method === "function") (method as (...values: unknown[]) => void)(...args)
		},
	getInstanceFromNode: () => null,
	beforeActiveInstanceBlur: () => undefined,
	afterActiveInstanceBlur: () => undefined,
	prepareScopeUpdate: () => undefined,
	getInstanceFromScope: () => null,
	resetFormInstance: () => undefined,
	suspendOnActiveViewTransition: () => undefined,
	getRootHostContext: () => rootHostContext,
	getChildHostContext: (context: typeof rootHostContext) => context,
	getPublicInstance: (instance: HostElement | HostText) => instance,
	createInstance(type: string, props: HostProps): HostElement {
		const instance: HostElement = {
			tag: type,
			get type() {
				return hostString(this.props.type ?? (type === "input" ? "text" : type === "button" ? "submit" : ""))
			},
			get name() {
				return hostString(this.props.name)
			},
			get id() {
				return hostString(this.props.id)
			},
			get dataset() {
				return Object.fromEntries(
					Object.entries(this.props)
						.filter(([name]) => name.startsWith("data-"))
						.map(([name, value]) => [
							name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
							hostString(value),
						])
				)
			},
			props,
			attributes: {},
			children: [],
			tagName: type.toUpperCase(),
			value: props.value ?? props.defaultValue,
			checked: Boolean(props.checked ?? props.defaultChecked),
			selected: Boolean(props.selected),
			get textContent() {
				return this.children.map((child) => ("text" in child ? child.text : (child.textContent ?? ""))).join("")
			},
			focus: () => undefined,
			blur: () => undefined,
			getAttribute(name) {
				const key = name === "class" ? "className" : name === "for" ? "htmlFor" : name
				const value = instance.props[key] ?? instance.attributes[name]
				return value === undefined || value === null || typeof value === "function" ? null : hostString(value)
			},
			setAttribute(name, value) {
				instance.attributes[name] = value
			},
			removeAttribute(name) {
				delete instance.attributes[name]
			},
			closest(selector: string) {
				let current: HostElement | undefined = instance
				while (current !== undefined) {
					if (matchesSelector(current, selector)) return current
					current = current.parent
				}
				return null
			},
			contains(node) {
				let current = node
				while (current !== null && typeof current === "object" && "tag" in current) {
					if (current === instance) return true
					current = (current as HostElement).parent
				}
				return false
			},
		}
		return instance
	},
	createTextInstance: (text: string): HostText => ({ text }),
	appendInitialChild: append,
	appendChild: append,
	appendChildToContainer: append,
	insertBefore(parent: HostElement, child: HostElement | HostText, before: HostElement | HostText) {
		remove(parent, child)
		const index = parent.children.indexOf(before)
		parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
		if ("tag" in child) child.parent = parent
	},
	insertInContainerBefore(parent: HostContainer, child: HostElement | HostText, before: HostElement | HostText) {
		remove(parent, child)
		const index = parent.children.indexOf(before)
		parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
	},
	removeChild: remove,
	removeChildFromContainer: remove,
	finalizeInitialChildren: () => false,
	shouldSetTextContent: () => false,
	prepareForCommit: () => null,
	resetAfterCommit: () => undefined,
	commitUpdate(instance: HostElement, _type: string, _oldProps: HostProps, newProps: HostProps) {
		instance.props = newProps
		if (newProps.value !== undefined && newProps.value !== null) instance.value = newProps.value
		if (newProps.checked !== undefined && newProps.checked !== null) instance.checked = Boolean(newProps.checked)
	},
	commitTextUpdate(instance: HostText, _oldText: string, newText: string) {
		instance.text = newText
	},
	resetTextContent(instance: HostElement) {
		instance.children = []
	},
	clearContainer(container: HostContainer) {
		container.children = []
	},
	preparePortalMount: () => undefined,
	detachDeletedInstance: () => undefined,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	noTimeout: -1 as const,
	supportsMicrotasks: true,
	scheduleMicrotask: queueMicrotask,
	getCurrentUpdatePriority: () => updatePriority,
	setCurrentUpdatePriority(priority: number) {
		updatePriority = priority
	},
	// Scene is synchronous, including state updates scheduled by passive Effects.
	resolveUpdatePriority: () => DiscreteEventPriority,
	resolveEventType: () => null,
	resolveEventTimeStamp: () => -1,
	shouldAttemptEagerTransition: () => false,
	trackSchedulerEvent: () => undefined,
	maySuspendCommit: () => false,
	maySuspendCommitOnUpdate: () => false,
	maySuspendCommitInSyncRender: () => false,
	preloadInstance: () => true,
	startSuspendingCommit: () => undefined,
	suspendInstance: () => undefined,
	waitForCommitToBeReady: () => null,
	getSuspendedCommitReason: () => null,
	NotPendingTransition: null,
	HostTransitionContext: React.createContext(null) as unknown as ReactReconciler.ReactContext<null>,
	requestPostPaintCallback: (callback: (time: number) => void) => queueMicrotask(() => callback(performance.now())),
	hideInstance(instance: HostElement) {
		instance.props = { ...instance.props, hidden: true }
	},
	unhideInstance(instance: HostElement, props: HostProps) {
		instance.props = props
	},
	hideTextInstance: () => undefined,
	unhideTextInstance: () => undefined,
}

type HostConfig = ReactReconciler.HostConfig<
	string,
	HostProps,
	HostContainer,
	HostElement,
	HostText,
	never,
	never,
	never,
	never,
	HostElement | HostText,
	typeof rootHostContext,
	never,
	ReturnType<typeof setTimeout>,
	-1,
	null,
	void,
	never,
	never,
	never,
	never
>
const renderer = Reconciler(hostConfig satisfies HostConfig)
type Renderer = typeof renderer

let interactionDepth = 0

/** Flushes React work after all handlers of one interaction have read the activated element. */
export function runSceneInteraction<A>(callback: () => A): A {
	if (interactionDepth > 0) return callback()
	return renderer.flushSyncFromReconciler(function () {
		interactionDepth++
		try {
			return callback()
		} finally {
			interactionDepth--
		}
	})
}

interface RenderState {
	readonly container: HostContainer
	readonly root: ReturnType<Renderer["createContainer"]>
	readonly source: ModelSource<unknown, unknown>
	element?: React.ReactElement
	setInput: (model: unknown, dispatch: (message: unknown) => void) => void
}

export interface SceneRenderSession {
	state?: RenderState
}

export const createSceneRenderSession = (): SceneRenderSession => ({})

export const isBoundSceneView = (view: Function): boolean => boundViews.has(view)

/** Whether a simulation came from the copied Scene runner, which records its React render session. */
export const isBoundSceneSimulation = (simulation: unknown): boolean =>
	typeof simulation === "object" && simulation !== null && "sceneRenderSession" in simulation

function makeRenderState<Model, Message>(model: Model, dispatch: (message: Message) => void): RenderState {
	const container: HostContainer = { children: [] }
	const root = renderer.createContainer(
		container,
		1,
		null,
		false,
		null,
		"",
		function (error: unknown) {
			throw error
		},
		function (error: unknown) {
			throw error
		},
		function (error: unknown) {
			throw error
		},
		() => undefined,
		null
	)
	let currentModel: unknown = model
	let currentDispatch: (message: unknown) => void = (message) => dispatch(message as Message)
	const listeners = new Set<() => void>()
	const source: ModelSource<unknown, unknown> = {
		getSnapshot: () => currentModel,
		getServerSnapshot: () => currentModel,
		subscribe(notify) {
			listeners.add(notify)
			return function () {
				listeners.delete(notify)
			}
		},
		dispatch: (message) => currentDispatch(message),
	}
	return {
		container,
		root,
		source,
		setInput(nextModel, nextDispatch) {
			currentDispatch = nextDispatch
			if (Object.is(currentModel, nextModel)) return
			currentModel = nextModel
			for (const notify of listeners) notify()
		},
	}
}

export function renderBoundSceneView<Model, Message>(
	view: Function,
	model: Model,
	dispatch: (message: Message) => void,
	session: SceneRenderSession
): VNode | undefined {
	const binding = boundViews.get(view)
	if (binding === undefined) throw new TypeError("The Scene view is not bound with bindSceneView")
	const state = session.state ?? makeRenderState(model, dispatch)
	session.state = state
	const Context = sceneSourceContext<Model, Message>(binding.application)
	const element = (state.element ??= React.createElement(
		Context.Provider,
		{ value: Option.some(state.source as ModelSource<Model, Message>) },
		React.createElement(binding.Component)
	))
	renderer.flushSyncFromReconciler(function () {
		state.setInput(model, dispatch as (message: unknown) => void)
		renderer.updateContainerSync(element, state.root, null, null)
	})
	renderer.flushSyncWork()
	renderer.flushPassiveEffects()
	restoreControlledInputs(state.container.children)
	const root = state.container.children[0]
	if (state.container.children.length !== 1 || root === undefined || "text" in root) {
		throw new Error("A bound React Scene view must render one host element at its root")
	}
	return toVNode(root)
}

export function disposeSceneRenderSession(session: SceneRenderSession): void {
	const state = session.state
	if (state === undefined) return
	try {
		renderer.flushSyncFromReconciler(() => renderer.updateContainerSync(null, state.root, null, null))
		renderer.flushSyncWork()
		renderer.flushPassiveEffects()
	} finally {
		session.state = undefined
	}
}

type EventHandler = (event?: unknown) => void

function hostEventHandlers(node: HostElement): Record<string, EventHandler> {
	const on: Record<string, EventHandler> = {}
	for (const [name, value] of Object.entries(node.props)) {
		const capture = name.endsWith("Capture")
		const eventName = eventProps[capture ? name.slice(0, -7) : name]
		if (eventName !== undefined && typeof value === "function") {
			const handler = (event: unknown) =>
				runSceneInteraction(function () {
					;(value as (event: unknown) => void)(reactEvent(node, eventName, event))
				})
			if (name === "onChange" && node.tag === "input" && node.props.type === "file") {
				Object.defineProperty(handler, FileHandlerSymbol, { value: "OnFileChange" })
			}
			if (name === "onDrop") Object.defineProperty(handler, FileHandlerSymbol, { value: "OnDropFiles" })
			on[capture ? `${eventName}Capture` : eventName] = handler
		}
	}
	return on
}

function toVNode(node: HostElement): VNode {
	const attrs: Record<string, unknown> = {}
	const props: Record<string, unknown> = {}
	const on = hostEventHandlers(node)
	const classes: Record<string, boolean> = {}
	const style: Record<string, string> = {}
	for (const [name, value] of Object.entries(node.props)) {
		if (name === "children" || name === "key" || name === "ref") continue

		if (
			name.startsWith("aria-") ||
			name.startsWith("data-") ||
			name === "id" ||
			name === "title" ||
			name === "role" ||
			name === "type" ||
			name === "name" ||
			name === "placeholder" ||
			name === "alt" ||
			name === "href" ||
			name === "src" ||
			name === "form" ||
			name === "method"
		) {
			attrs[name] = value
		} else if (name === "className") {
			for (const className of hostString(value).split(/\s+/)) {
				if (className !== "") classes[className] = true
			}
		} else if (name === "style" && value !== null && typeof value === "object") {
			for (const [property, styleValue] of Object.entries(value as Record<string, unknown>)) {
				if (styleValue === null || styleValue === undefined || styleValue === "") continue
				style[serializedStylePropertyName(property)] =
					typeof styleValue === "number" &&
					styleValue !== 0 &&
					!unitlessStyles.has(property) &&
					!property.startsWith("--")
						? `${styleValue}px`
						: hostString(styleValue)
			}
		} else if (propertyNames.has(name)) {
			props[name] = value
			if (name === "htmlFor") attrs.for = value
		}
	}
	if (node.value !== undefined) props.value = node.value
	if (node.tag === "input" && (node.props.type === "checkbox" || node.props.type === "radio"))
		props.checked = node.checked
	if (node.tag === "option") props.selected = node.selected
	const data = {
		...(Object.keys(attrs).length > 0 ? { attrs } : {}),
		...(Object.keys(props).length > 0 ? { props } : {}),
		...(Object.keys(classes).length > 0 ? { class: classes } : {}),
		...(Object.keys(style).length > 0 ? { style } : {}),
		...(Object.keys(on).length > 0 ? { on } : {}),
	}
	const children = node.children.map((child) => ("text" in child ? child.text : toVNode(child)))
	return {
		sel: node.tag,
		data: data as unknown as VNode["data"],
		children,
		elm: node as unknown as Node,
		text: undefined,
		key: undefined,
	}
}

function restoreControlledInputs(children: ReadonlyArray<HostElement | HostText>): void {
	for (const node of children) {
		if (!("tag" in node)) continue
		if (node.props.value !== undefined && node.props.value !== null) node.value = node.props.value
		if (node.props.checked !== undefined && node.props.checked !== null) node.checked = Boolean(node.props.checked)
		restoreControlledInputs(node.children)
		if (node.tag === "select") {
			const selection = node.props.value ?? node.selectedValues ?? node.value
			syncSelect(node, selection, selection === undefined || node.props.value !== undefined)
		}
	}
}

const selectOptions = (
	children: ReadonlyArray<HostElement | HostText>,
	disabled = false
): Array<{ node: HostElement; disabled: boolean }> =>
	children.flatMap(function (node) {
		if (!("tag" in node)) return []
		const inactive = disabled || node.props.disabled === true
		if (node.tag === "option") return [{ node, disabled: inactive }]
		return selectOptions(node.children, inactive)
	})

function syncSelect(node: HostElement, selection: unknown, fallback: boolean): void {
	const options = selectOptions(node.children)
	const values =
		selection === undefined
			? options
					.filter(({ node }) => node.selected)
					.map(({ node }) => hostString(node.props.value ?? node.textContent))
			: (Array.isArray(selection) ? selection : [selection]).map(hostString)
	let selected = false
	for (const option of options) {
		option.node.value = hostString(option.node.props.value ?? option.node.textContent)
		option.node.selected =
			values.includes(option.node.value as string) && (!selected || Boolean(node.props.multiple))
		selected ||= option.node.selected
	}
	if (!selected && fallback && !node.props.multiple) {
		const first = options.find((option) => !option.disabled)
		if (first !== undefined) first.node.selected = true
	}
	node.selectedValues = options.filter(({ node }) => node.selected).map(({ node }) => hostString(node.value))
	node.value = node.selectedValues[0] ?? ""
}

/** Finds React handlers on the original target's path without starting an interaction. */
export function getSceneEventHandler(element: VNode, eventName: string): EventHandler | undefined {
	const target = element.elm as unknown as HostElement
	const path: Array<Record<string, EventHandler>> = []
	let current: HostElement | undefined = target
	while (current !== undefined) {
		path.push(hostEventHandlers(current))
		current = current.parent
	}
	const name = eventName === "focusin" ? "focus" : eventName === "focusout" ? "blur" : eventName
	const names =
		name === "input" && isTextInput(target)
			? ["input", "change"]
			: name === "hover"
				? ["mouseover", "mouseenter"]
				: [name]
	if (
		!path.some((handlers) =>
			names.some((name) => handlers[name] !== undefined || handlers[`${name}Capture`] !== undefined)
		)
	)
		return undefined
	const handler: EventHandler = (value) =>
		runSceneInteraction(function () {
			const source = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
			if (
				(name === "input" || name === "change") &&
				source.target !== null &&
				typeof source.target === "object" &&
				!("tagName" in source.target)
			) {
				Object.assign(target, source.target)
				if (target.tag === "select") syncSelect(target, target.value, false)
			}
			let defaultPrevented = source.defaultPrevented === true
			let stopped = false
			const event = {
				...source,
				target,
				relatedTarget: source.relatedTarget ?? null,
				get defaultPrevented() {
					return defaultPrevented
				},
				preventDefault() {
					defaultPrevented = true
					if (typeof source.preventDefault === "function") (source.preventDefault as () => void)()
				},
				stopPropagation() {
					stopped = true
					if (typeof source.stopPropagation === "function") (source.stopPropagation as () => void)()
				},
			}
			for (const name of names) {
				stopped = false
				for (const handlers of [...path].reverse()) {
					handlers[`${name}Capture`]?.(event)
					if (stopped) break
				}
				if (stopped) continue
				for (const handlers of name === "mouseenter" ? [...path].reverse() : path) {
					handlers[name]?.(event)
					if (stopped) break
				}
			}
		})
	if (name === "change" && target.tag === "input" && target.props.type === "file") {
		Object.defineProperty(handler, FileHandlerSymbol, { value: "OnFileChange" })
	}
	if (name === "drop") Object.defineProperty(handler, FileHandlerSymbol, { value: "OnDropFiles" })
	return handler
}

function reactEvent(node: HostElement, type: string, value: unknown): Record<string, unknown> {
	const source = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {}
	const isValueEvent = type === "change" || type === "input"
	const normalizedTarget =
		source.target !== undefined && source.target === source.currentTarget ? node : (source.target ?? node)
	const target =
		isValueEvent && source.target !== null && typeof source.target === "object" && !("tagName" in source.target)
			? Object.assign(node, source.target)
			: normalizedTarget
	const nativeEvent = { ...source, type, target, currentTarget: node }
	let defaultPrevented = source.defaultPrevented === true
	let propagationStopped = false
	return {
		...nativeEvent,
		currentTarget: node,
		target,
		nativeEvent,
		bubbles: true,
		cancelable: true,
		get defaultPrevented() {
			return defaultPrevented
		},
		preventDefault() {
			defaultPrevented = true
			if (typeof source.preventDefault === "function") (source.preventDefault as () => void)()
		},
		stopPropagation() {
			propagationStopped = true
			if (typeof source.stopPropagation === "function") (source.stopPropagation as () => void)()
		},
		isDefaultPrevented: () => defaultPrevented,
		isPropagationStopped: () => propagationStopped,
		persist: () => undefined,
	}
}

const textInputTypes = new Set([
	"text",
	"search",
	"email",
	"url",
	"tel",
	"password",
	"number",
	"date",
	"datetime-local",
	"month",
	"time",
	"week",
	"color",
	"range",
])

const isTextInput = (node: HostElement): boolean =>
	node.tag === "textarea" || (node.tag === "input" && textInputTypes.has(hostString(node.props.type ?? "text")))

function matchesSelector(node: HostElement, selector: string): boolean {
	let root = node
	while (root.parent !== undefined) root = root.parent
	return sceneLocators
		.selector(selector)(toVNode(root))
		.some((match) => match.elm === (node as unknown as Node))
}
