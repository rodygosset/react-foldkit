import { Array, Option } from "effect"
import React from "react"
import Reconciler from "react-reconciler"
import type ReactReconciler from "react-reconciler"
import { DiscreteEventPriority, NoEventPriority } from "react-reconciler/constants.js"
import type { Scene as SceneNamespace } from "foldkit/test"
import { SceneSourceTypeId } from "../application/react"
import type { SourceContext } from "../application/react"
import { deepFreeze, isDevelopment } from "../internal/deepFreeze"
import type { ModelSource } from "../modelSource"
import { dispatchSceneEvent, hasSceneListener, hostFromElm, sceneListeners } from "./sceneEvent"
import { hostProp, hostString, styleDeclarations } from "./sceneHost"
import type { HostContainer, HostElement, HostProps, HostText } from "./sceneHost"
import { syncControlledFields } from "./sceneInput"
import { SceneRenderLimit } from "./sceneSettle"
import type { SceneView } from "./sceneView"
import { FileHandlerSymbol } from "./vendor/sceneCompat"
import { allSelector } from "./vendor/query.js"

type VNode = SceneNamespace.SceneSimulation<unknown, unknown>["html"]

export const BoundSceneViewTypeId: unique symbol = Symbol.for("react-foldkit/BoundSceneViewTypeId")

interface BoundSceneViewRecord {
	readonly application: { readonly [SceneSourceTypeId]: SourceContext<unknown, unknown> }
	readonly Component: React.ComponentType
}

export function bindSceneView<Model, Message>(
	application: { readonly [SceneSourceTypeId]: SourceContext<Model, Message> },
	Component: React.ComponentType
): SceneView<Model, Message> {
	function sceneView(): never {
		throw new TypeError("Scene renders this component. Pass the view to scene().")
	}
	const record: BoundSceneViewRecord = {
		application: application as BoundSceneViewRecord["application"],
		Component,
	}
	Object.defineProperty(sceneView, BoundSceneViewTypeId, { value: record })
	return sceneView as SceneView<Model, Message>
}

function boundSceneView(view: Function): BoundSceneViewRecord {
	const record = (view as { readonly [BoundSceneViewTypeId]?: BoundSceneViewRecord })[BoundSceneViewTypeId]
	if (record === undefined) throw new TypeError("The Scene view is not bound with bindSceneView")
	return record
}

let sceneCommitCount = 0
const hostErrors: Array<unknown> = []

function reportHostError(error: unknown): void {
	hostErrors.push(error)
}

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
	resetAfterCommit() {
		sceneCommitCount += 1
	},
	commitUpdate(instance: HostElement, _type: string, _oldProps: HostProps, newProps: HostProps) {
		instance.props = newProps
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
	const result = renderer.flushSyncFromReconciler(function () {
		interactionDepth++
		try {
			return callback()
		} finally {
			interactionDepth--
		}
	})
	const error = hostErrors[0]
	if (error !== undefined) {
		hostErrors.length = 0
		throw error
	}
	return result
}

function commitScene(update: () => void): void {
	sceneCommitCount = 0
	hostErrors.length = 0
	renderer.flushSyncFromReconciler(update)
	renderer.flushSyncWork()
	let settled = false
	for (let pass = 0; pass < SceneRenderLimit; pass++) {
		const before = sceneCommitCount
		renderer.flushPassiveEffects()
		renderer.flushSyncWork()
		if (sceneCommitCount === before) {
			settled = true
			break
		}
	}
	const error = hostErrors[0]
	if (error !== undefined) throw error
	if (!settled) {
		throw new Error("React Scene did not settle after 100 renders. A state update kept scheduling another render.")
	}
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

export const isBoundSceneView = (view: unknown): view is SceneView<unknown, unknown> =>
	typeof view === "function" && BoundSceneViewTypeId in view

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
		reportHostError,
		reportHostError,
		reportHostError,
		() => undefined,
		null
	)
	let currentModel: unknown = isDevelopment ? deepFreeze(model) : model
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
			if (isDevelopment) deepFreeze(nextModel)
			currentModel = nextModel
			for (const notify of Array.fromIterable(listeners)) notify()
		},
	}
}

export function renderBoundSceneView<Model, Message>(
	view: Function,
	model: Model,
	dispatch: (message: Message) => void,
	session: SceneRenderSession
): VNode | undefined {
	const binding = boundSceneView(view)
	const state = session.state ?? makeRenderState(model, dispatch)
	session.state = state
	const Context = binding.application[SceneSourceTypeId] as SourceContext<Model, Message>
	const element = (state.element ??= React.createElement(
		Context.Provider,
		{ value: Option.some(state.source as ModelSource<Model, Message>) },
		React.createElement(binding.Component)
	))
	commitScene(function () {
		state.setInput(model, dispatch as (message: unknown) => void)
		renderer.updateContainerSync(element, state.root, null, null)
	})
	syncControlledFields(state.container.children)
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
		commitScene(function () {
			renderer.updateContainerSync(null, state.root, null, null)
		})
	} finally {
		session.state = undefined
	}
}

type EventHandler = (event?: unknown) => void

function stampFileHandler(handler: EventHandler, target: HostElement, eventName: string): void {
	if (eventName === "change" && target.tag === "input" && target.props.type === "file") {
		Object.defineProperty(handler, FileHandlerSymbol, { value: "OnFileChange" })
	}
	if (eventName === "drop") Object.defineProperty(handler, FileHandlerSymbol, { value: "OnDropFiles" })
}

function toVNode(node: HostElement): VNode {
	const attrs: Record<string, unknown> = {}
	const props: Record<string, unknown> = {}
	const on = sceneListeners(node)
	const classes: Record<string, boolean> = {}
	let style: Record<string, string> = {}
	for (const [name, value] of Object.entries(node.props)) {
		const classified = hostProp(name, value)
		if (Option.isNone(classified)) continue
		switch (classified.value._tag) {
			case "ClassList":
				for (const className of hostString(classified.value.value).split(/\s+/)) {
					if (className !== "") classes[className] = true
				}
				break
			case "Style":
				style = { ...style, ...styleDeclarations(classified.value.value) }
				break
			case "Attribute":
				attrs[classified.value.name] = classified.value.value
				if (classified.value.reactName === "htmlFor") props.htmlFor = classified.value.value
				break
			default: {
				const unexpected: never = classified.value
				throw new Error(`Unexpected host prop ${String(unexpected)}`)
			}
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

/** Finds React handlers on the original target's path. The returned function runs one interaction. */
export function getSceneEventHandler(element: { readonly elm?: unknown }, eventName: string): EventHandler | undefined {
	const target = hostFromElm(element.elm)
	if (target === undefined || !hasSceneListener(target, eventName)) return undefined
	const handler: EventHandler = function (value) {
		const fields = value !== null && typeof value === "object" ? (value as Readonly<Record<string, unknown>>) : {}
		runSceneInteraction(function () {
			dispatchSceneEvent(target, eventName, fields)
		})
	}
	stampFileHandler(handler, target, eventName)
	return handler
}

function matchesSelector(node: HostElement, selector: string): boolean {
	let root = node
	while (root.parent !== undefined) root = root.parent
	const matches = allSelector(selector)(toVNode(root)) as ReadonlyArray<{ readonly elm?: unknown }>
	return matches.some((match) => match.elm === node)
}
