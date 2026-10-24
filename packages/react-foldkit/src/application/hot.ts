// Keeps each Provider's Model across hot module reloads, like Foldkit's model preservation.
//
// The `preserveModel` Vite plugin wraps every module that imports React Foldkit in `begin` and
// `end`. A `define` call between them gets a key from the module URL and its position in the
// module, so the same call has the same key after a reload.
//
// React Fast Refresh keeps a component's state only while its type stays the same. A reload runs
// `define` again, so it returns the Provider and React context of the first `define` call with that
// key. Each reload installs the new Program as the next generation. The Provider then remounts its
// Store from the new Program and starts it from the previous Store's live Model.

/** One `define` call's stable React parts and the newest Program's Provider body. */
export type Entry<Context, Provider, Instance> = {
	readonly Context: Context
	readonly Provider: Provider
	current: Readonly<{ Instance: Instance; generation: number }>
}

type HotState = {
	module: string | undefined
	count: number
	readonly entries: Map<string, Entry<unknown, unknown, unknown>>
	readonly begin: (url: string) => void
	readonly end: () => void
}

const globalKey = Symbol.for("react-foldkit/hot")

function makeState(): HotState {
	const state: HotState = {
		module: undefined,
		count: 0,
		entries: new Map(),
		begin(url) {
			// Vite adds `?t=` to a module that hot reloaded, so drop the query to keep one key per file.
			state.module = url.split("?")[0]
			state.count = 0
		},
		end() {
			state.module = undefined
		},
	}
	return state
}

const host = globalThis as typeof globalThis & { [globalKey]?: HotState }
const state: HotState = (host[globalKey] ??= makeState())

/** Returns the key for a `define` call, or `undefined` outside a module the plugin wrapped. */
export function defineKey(): string | undefined {
	if (state.module === undefined) return undefined
	return `${state.module}#${state.count++}`
}

/** Returns the entry an earlier `define` call with this key registered. */
export const entry = <Context, Provider, Instance>(key: string): Entry<Context, Provider, Instance> | undefined =>
	state.entries.get(key) as Entry<Context, Provider, Instance> | undefined

/** Registers the first entry for a key and returns it. */
export function register<Context, Provider, Instance>(
	key: string,
	value: Entry<Context, Provider, Instance>
): Entry<Context, Provider, Instance> {
	state.entries.set(key, value as Entry<unknown, unknown, unknown>)
	return value
}
