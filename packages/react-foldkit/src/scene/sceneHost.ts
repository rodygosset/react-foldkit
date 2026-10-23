import { Option } from "effect"
import type React from "react"
import { serializedStylePropertyName } from "./vendor/sceneCompat"

export interface HostProps extends Record<string, unknown> {
	readonly children?: React.ReactNode
}

export interface HostText {
	text: string
}

export type HostNamespace = "html" | "svg"

export interface HostElement {
	readonly namespace: HostNamespace
	tag: string
	readonly type: string
	readonly name: string
	readonly id: string
	readonly dataset: Readonly<Record<string, string>>
	props: HostProps
	attributes: Record<string, string | null>
	children: Array<HostElement | HostText>
	parent?: HostElement
	readonly tagName: string
	value?: string
	files?: unknown
	checked?: boolean
	selected?: boolean
	selectedValues?: ReadonlyArray<string>
	textContent?: string
	innerText?: string
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
	className: "class",
	htmlFor: "for",
	crossOrigin: "crossorigin",
	tabIndex: "tabindex",
	httpEquiv: "http-equiv",
}

const svgAttributeNames: Readonly<Record<string, string>> = {
	accentHeight: "accent-height",
	alignmentBaseline: "alignment-baseline",
	arabicForm: "arabic-form",
	baselineShift: "baseline-shift",
	capHeight: "cap-height",
	clipPath: "clip-path",
	clipRule: "clip-rule",
	colorInterpolation: "color-interpolation",
	colorInterpolationFilters: "color-interpolation-filters",
	colorProfile: "color-profile",
	colorRendering: "color-rendering",
	dominantBaseline: "dominant-baseline",
	enableBackground: "enable-background",
	fillOpacity: "fill-opacity",
	fillRule: "fill-rule",
	floodColor: "flood-color",
	floodOpacity: "flood-opacity",
	fontFamily: "font-family",
	fontSize: "font-size",
	fontSizeAdjust: "font-size-adjust",
	fontStretch: "font-stretch",
	fontStyle: "font-style",
	fontVariant: "font-variant",
	fontWeight: "font-weight",
	glyphName: "glyph-name",
	glyphOrientationHorizontal: "glyph-orientation-horizontal",
	glyphOrientationVertical: "glyph-orientation-vertical",
	horizAdvX: "horiz-adv-x",
	horizOriginX: "horiz-origin-x",
	imageRendering: "image-rendering",
	letterSpacing: "letter-spacing",
	lightingColor: "lighting-color",
	markerEnd: "marker-end",
	markerMid: "marker-mid",
	markerStart: "marker-start",
	overlinePosition: "overline-position",
	overlineThickness: "overline-thickness",
	paintOrder: "paint-order",
	pointerEvents: "pointer-events",
	renderingIntent: "rendering-intent",
	shapeRendering: "shape-rendering",
	stopColor: "stop-color",
	stopOpacity: "stop-opacity",
	strikethroughPosition: "strikethrough-position",
	strikethroughThickness: "strikethrough-thickness",
	strokeDasharray: "stroke-dasharray",
	strokeDashoffset: "stroke-dashoffset",
	strokeLinecap: "stroke-linecap",
	strokeLinejoin: "stroke-linejoin",
	strokeMiterlimit: "stroke-miterlimit",
	strokeOpacity: "stroke-opacity",
	strokeWidth: "stroke-width",
	textAnchor: "text-anchor",
	textDecoration: "text-decoration",
	textRendering: "text-rendering",
	transformOrigin: "transform-origin",
	underlinePosition: "underline-position",
	underlineThickness: "underline-thickness",
	unicodeBidi: "unicode-bidi",
	unicodeRange: "unicode-range",
	unitsPerEm: "units-per-em",
	vAlphabetic: "v-alphabetic",
	vHanging: "v-hanging",
	vIdeographic: "v-ideographic",
	vMathematical: "v-mathematical",
	vectorEffect: "vector-effect",
	vertAdvY: "vert-adv-y",
	vertOriginX: "vert-origin-x",
	vertOriginY: "vert-origin-y",
	wordSpacing: "word-spacing",
	writingMode: "writing-mode",
	xmlnsXlink: "xmlns:xlink",
	xHeight: "x-height",
	xlinkActuate: "xlink:actuate",
	xlinkArcrole: "xlink:arcrole",
	xlinkHref: "xlink:href",
	xlinkRole: "xlink:role",
	xlinkShow: "xlink:show",
	xlinkTitle: "xlink:title",
	xlinkType: "xlink:type",
	xmlBase: "xml:base",
	xmlLang: "xml:lang",
	xmlSpace: "xml:space",
}

const booleanAttributes = new Set([
	"allowFullScreen",
	"async",
	"autoFocus",
	"autoPlay",
	"controls",
	"default",
	"defer",
	"disabled",
	"disablePictureInPicture",
	"disableRemotePlayback",
	"formNoValidate",
	"hidden",
	"inert",
	"itemScope",
	"loop",
	"multiple",
	"muted",
	"noModule",
	"noValidate",
	"open",
	"playsInline",
	"readOnly",
	"required",
	"reversed",
	"scoped",
	"seamless",
])

const booleanStringAttributes = new Set([
	"contentEditable",
	"draggable",
	"spellCheck",
	"value",
	"autoReverse",
	"externalResourcesRequired",
	"focusable",
	"preserveAlpha",
])

/** React uses lowercase HTML names and preserves SVG case unless the name has an explicit alias. */
export const htmlAttributeName = (name: string, namespace: HostNamespace = "html"): string =>
	attributeNames[name] ?? (namespace === "svg" ? (svgAttributeNames[name] ?? name) : name.toLowerCase())

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
	| { readonly _tag: "Attribute"; readonly reactName: string; readonly name: string; readonly value: string }

function isEventProp(name: string): boolean {
	if (eventProps[name] !== undefined) return true
	return name.endsWith("Capture") && eventProps[name.slice(0, -7)] !== undefined
}

/** Classifies a React prop for the Foldkit vnode. Live value, checked, and selected stay off attributes. */
export function hostProp(name: string, value: unknown, namespace: HostNamespace = "html"): Option.Option<HostProp> {
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
	if (typeof value === "object" || typeof value === "symbol") return Option.none()
	const attributeName = htmlAttributeName(name, namespace)
	if (booleanAttributes.has(name)) {
		return value
			? Option.some({ _tag: "Attribute", reactName: name, name: attributeName, value: "" })
			: Option.none()
	}
	if (name === "download" || name === "capture") {
		if (value === false) return Option.none()
		return Option.some({
			_tag: "Attribute",
			reactName: name,
			name: attributeName,
			value: value === true ? "" : hostString(value),
		})
	}
	if (
		typeof value === "boolean" &&
		!booleanStringAttributes.has(name) &&
		!name.startsWith("aria-") &&
		!name.startsWith("data-")
	)
		return Option.none()
	return Option.some({ _tag: "Attribute", reactName: name, name: attributeName, value: hostString(value) })
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

/** The attribute view shared by event targets and Foldkit snapshots, including imperative edits. */
export function hostAttributes(node: HostElement): Record<string, string> {
	const attributes: Record<string, string> = {}
	for (const [name, value] of Object.entries(node.props)) {
		const prop = hostProp(name, value, node.namespace)
		if (Option.isNone(prop)) continue
		switch (prop.value._tag) {
			case "Attribute":
				attributes[prop.value.name] = prop.value.value
				break
			case "ClassList":
				attributes.class = hostString(prop.value.value)
				break
			case "Style":
				attributes.style = Object.entries(styleDeclarations(prop.value.value))
					.map(([property, styleValue]) => `${property}:${styleValue}`)
					.join(";")
				break
		}
	}
	for (const [name, value] of Object.entries(node.attributes)) {
		if (value === null) delete attributes[name]
		else attributes[name] = value
	}
	return attributes
}
