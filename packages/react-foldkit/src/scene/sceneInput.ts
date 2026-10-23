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
		selection === undefined ? undefined : (Array.isArray(selection) ? selection : [selection]).map(hostString)
	const optionsChanged =
		node.selectSnapshot?.length !== options.length ||
		options.some((option, index) => node.selectSnapshot?.[index] !== option.node)
	let selected = false
	for (const option of options) {
		option.node.value = hostString(option.node.props.value ?? option.node.textContent)
		option.node.selected =
			(values === undefined ? option.node.selected === true : values.includes(option.node.value)) &&
			(!selected || Boolean(node.props.multiple))
		selected = selected || option.node.selected
	}
	if (!selected && (fallback || (selection === undefined && optionsChanged)) && !node.props.multiple) {
		const first = options.find((option) => !option.disabled)
		if (first !== undefined) first.node.selected = true
	}
	node.selectSnapshot = options.map((option) => option.node)
	node.value = options.find((option) => option.node.selected === true)?.node.value ?? ""
}

function syncNode(node: HostElement | HostText): void {
	if (!("tag" in node)) return
	if (node.tag !== "select" && node.props.value !== undefined && node.props.value !== null) {
		node.value = hostString(node.props.value)
	}
	if (node.props.checked !== undefined && node.props.checked !== null) node.checked = Boolean(node.props.checked)
	for (const child of node.children) syncNode(child)
	if (node.tag === "select") {
		const selection = node.props.value ?? (node.selectSnapshot === undefined ? node.props.defaultValue : undefined)
		syncSelect(node, selection, node.props.value !== undefined)
	}
}

/** Synchronizes controlled fields before Effects and after interactions. */
export function syncControlledFields(children: ReadonlyArray<HostElement | HostText>): void {
	for (const node of children) syncNode(node)
}
