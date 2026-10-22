export function ancestorsOf(target: unknown): (root: unknown) => ReadonlyArray<{
	readonly sel?: string
	readonly elm?: unknown
	readonly data?: {
		readonly attrs?: Readonly<Record<string, unknown>>
		readonly props?: Readonly<Record<string, unknown>>
	}
	readonly children?: ReadonlyArray<unknown>
}>

export function allSelector(css: string): (root: unknown) => ReadonlyArray<{
	readonly sel?: string
	readonly elm?: unknown
	readonly data?: {
		readonly attrs?: Readonly<Record<string, unknown>>
		readonly props?: Readonly<Record<string, unknown>>
	}
	readonly children?: ReadonlyArray<unknown>
}>
