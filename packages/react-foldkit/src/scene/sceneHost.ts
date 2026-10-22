import { Option } from "effect"
import type React from "react"
import { serializedStylePropertyName } from "./vendor/sceneCompat"

export interface HostProps extends Record<string, unknown> {
	readonly children?: React.ReactNode
}

export interface HostText {
	text: string
}

export interface HostElement {
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

export interface HostContainer {
	children: Array<HostElement | HostText>
}

/** Stringifies a primitive prop the way React DOM writes it. Other values become empty. */
export function hostString(value: unknown): string {
	if (typeof value === "string") return value
	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return `${value}`
	return ""
}

export const eventProps: Readonly<Record<string, string>> = {
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

/**
 * React DOM leaves these numeric style values unitless.
 * The set matches React 19.2, including SVG lengths such as `strokeWidth`.
 */
const unitlessStyles = new Set([
	"animationIterationCount",
	"aspectRatio",
	"borderImageOutset",
	"borderImageSlice",
	"borderImageWidth",
	"boxFlex",
	"boxFlexGroup",
	"boxOrdinalGroup",
	"columnCount",
	"columns",
	"flex",
	"flexGrow",
	"flexPositive",
	"flexShrink",
	"flexNegative",
	"flexOrder",
	"gridArea",
	"gridRow",
	"gridRowEnd",
	"gridRowSpan",
	"gridRowStart",
	"gridColumn",
	"gridColumnEnd",
	"gridColumnSpan",
	"gridColumnStart",
	"fontWeight",
	"lineClamp",
	"lineHeight",
	"opacity",
	"order",
	"orphans",
	"scale",
	"tabSize",
	"widows",
	"zIndex",
	"zoom",
	"fillOpacity",
	"floodOpacity",
	"stopOpacity",
	"strokeDasharray",
	"strokeDashoffset",
	"strokeMiterlimit",
	"strokeOpacity",
	"strokeWidth",
])

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

export const isTextInput = (node: HostElement): boolean =>
	node.tag === "textarea" || (node.tag === "input" && textInputTypes.has(hostString(node.props.type ?? "text")))

const attributeNames: Readonly<Record<string, string>> = {
	acceptCharset: "accept-charset",
	allowFullScreen: "allowfullscreen",
	autoComplete: "autocomplete",
	autoFocus: "autofocus",
	autoPlay: "autoplay",
	cellPadding: "cellpadding",
	cellSpacing: "cellspacing",
	charSet: "charset",
	colSpan: "colspan",
	contentEditable: "contenteditable",
	crossOrigin: "crossorigin",
	dateTime: "datetime",
	encType: "enctype",
	formAction: "formaction",
	formEncType: "formenctype",
	formMethod: "formmethod",
	formNoValidate: "formnovalidate",
	formTarget: "formtarget",
	frameBorder: "frameborder",
	htmlFor: "for",
	httpEquiv: "http-equiv",
	inputMode: "inputmode",
	itemID: "itemid",
	itemProp: "itemprop",
	itemRef: "itemref",
	itemScope: "itemscope",
	itemType: "itemtype",
	maxLength: "maxlength",
	minLength: "minlength",
	noValidate: "novalidate",
	readOnly: "readonly",
	rowSpan: "rowspan",
	srcSet: "srcset",
	tabIndex: "tabindex",
	useMap: "usemap",
}

/** React prop name to the HTML attribute name Foldkit locators read. */
export function htmlAttributeName(name: string): string {
	const mapped = attributeNames[name]
	if (mapped !== undefined) return mapped
	return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

const skippedProps = new Set([
	"children",
	"key",
	"ref",
	"value",
	"checked",
	"selected",
	"defaultValue",
	"defaultChecked",
	"dangerouslySetInnerHTML",
	"suppressContentEditableWarning",
	"suppressHydrationWarning",
])

export type HostProp =
	| { readonly _tag: "ClassList"; readonly value: unknown }
	| { readonly _tag: "Style"; readonly value: { readonly [key: string]: unknown } }
	| { readonly _tag: "Attribute"; readonly reactName: string; readonly name: string; readonly value: unknown }

function isEventProp(name: string): boolean {
	if (eventProps[name] !== undefined) return true
	return name.endsWith("Capture") && eventProps[name.slice(0, -7)] !== undefined
}

/** Classifies a React prop for the Foldkit vnode. Live value, checked, and selected stay off attributes. */
export function hostProp(name: string, value: unknown): Option.Option<HostProp> {
	if (
		skippedProps.has(name) ||
		isEventProp(name) ||
		value === undefined ||
		value === null ||
		typeof value === "function"
	) {
		return Option.none()
	}
	if (name === "className") return Option.some({ _tag: "ClassList", value })
	if (name === "style" && typeof value === "object") {
		return Option.some({ _tag: "Style", value: value as { readonly [key: string]: unknown } })
	}
	if (typeof value === "object") return Option.none()
	return Option.some({ _tag: "Attribute", reactName: name, name: htmlAttributeName(name), value })
}

export function styleDeclarations(value: { readonly [key: string]: unknown }): Record<string, string> {
	const style: Record<string, string> = {}
	for (const [property, styleValue] of Object.entries(value)) {
		if (styleValue === null || styleValue === undefined || styleValue === "") continue
		const unitless =
			typeof styleValue === "number" &&
			(styleValue === 0 || unitlessStyles.has(property) || property.startsWith("--"))
		style[serializedStylePropertyName(property)] =
			unitless || typeof styleValue !== "number" ? hostString(styleValue) : `${styleValue}px`
	}
	return style
}
