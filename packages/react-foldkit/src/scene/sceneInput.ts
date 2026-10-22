import type { HostElement, HostText } from "./sceneHost"
import { hostString } from "./sceneHost"

export type Checkable =
	| { readonly _tag: "Checkbox"; readonly target: HostElement }
	| { readonly _tag: "Radio"; readonly target: HostElement; readonly group: ReadonlyArray<HostElement> }

export type CheckedSnapshot = ReadonlyArray<readonly [HostElement, boolean]>

export function snapshotChecked(checkable: Checkable): CheckedSnapshot {
	switch (checkable._tag) {
		case "Checkbox":
			return [[checkable.target, checkable.target.checked === true]]
		case "Radio":
			return checkable.group.map((node) => [node, node.checked === true] as const)
		default: {
			const unexpected: never = checkable
			return unexpected
		}
	}
}

export function assignChecked(checkable: Checkable): void {
	switch (checkable._tag) {
		case "Checkbox":
			checkable.target.checked = checkable.target.checked !== true
			return
		case "Radio":
			for (const node of checkable.group) node.checked = node === checkable.target
			checkable.target.checked = true
			return
		default: {
			const unexpected: never = checkable
			throw new Error(`Unexpected checkable ${String(unexpected)}`)
		}
	}
}

export function revertChecked(snapshot: CheckedSnapshot): void {
	for (const [node, checked] of snapshot) node.checked = checked
}

function selectOptions(
	children: ReadonlyArray<HostElement | HostText>,
	disabled = false
): ReadonlyArray<{ readonly node: HostElement; readonly disabled: boolean }> {
	const options: Array<{ readonly node: HostElement; readonly disabled: boolean }> = []
	for (const node of children) {
		if (!("tag" in node)) continue
		const inactive = disabled || node.props.disabled === true
		if (node.tag === "option") {
			options.push({ node, disabled: inactive })
			continue
		}
		for (const option of selectOptions(node.children, inactive)) options.push(option)
	}
	return options
}

export function syncSelect(node: HostElement, selection: unknown, fallback: boolean): void {
	const options = selectOptions(node.children)
	const values =
		selection === undefined
			? options
					.filter((option) => option.node.selected === true)
					.map((option) => hostString(option.node.props.value ?? option.node.textContent))
			: (Array.isArray(selection) ? selection : [selection]).map(hostString)
	let selected = false
	for (const option of options) {
		option.node.value = hostString(option.node.props.value ?? option.node.textContent)
		option.node.selected =
			values.includes(option.node.value as string) && (!selected || Boolean(node.props.multiple))
		selected = selected || option.node.selected
	}
	if (!selected && fallback && !node.props.multiple) {
		const first = options.find((option) => !option.disabled)
		if (first !== undefined) first.node.selected = true
	}
	node.selectedValues = options
		.filter((option) => option.node.selected === true)
		.map((option) => hostString(option.node.value))
	node.value = node.selectedValues[0] ?? ""
}

function syncNode(node: HostElement | HostText): void {
	if (!("tag" in node)) return
	if (node.props.value !== undefined && node.props.value !== null) node.value = node.props.value
	if (node.props.checked !== undefined && node.props.checked !== null) node.checked = Boolean(node.props.checked)
	for (const child of node.children) syncNode(child)
	if (node.tag === "select") {
		const selection = node.props.value ?? node.selectedValues ?? node.value
		syncSelect(node, selection, selection === undefined || node.props.value !== undefined)
	}
}

/** Copies controlled `value` and `checked` from props after paint. Gesture toggles stay on the click path. */
export function syncControlledFields(children: ReadonlyArray<HostElement | HostText>): void {
	for (const node of children) syncNode(node)
}
