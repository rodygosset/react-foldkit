import { Effect, Exit, Option, Scope, Semaphore } from "effect"
import type { DevToolsOverlay } from "foldkit/devtools-host"
import type { DevToolsMode, DevToolsPosition } from "foldkit/runtime"
import type { DevToolsStore } from "./devtoolsVendor/devTools/store.js"
/** The part of Vite's `import.meta.hot` that Foldkit's DevTools bridge uses. */
export type Hot = Readonly<{
	send: (event: string, data?: unknown) => void
	on: (event: string, listener: (data: never) => void) => void
	off: (event: string, listener: (data: never) => void) => void
	dispose: (callback: (data: unknown) => void) => void
}>

type Registration = Readonly<{
	id: symbol
	store: DevToolsStore
	position: DevToolsPosition
	mode: DevToolsMode
	banner: Option.Option<string>
	label: string
}>

type Mounted = Readonly<{ registration: Registration; scope: Scope.Closeable; factory: DevToolsOverlay }>

const lock = Semaphore.makeUnsafe(1)
const registrations: Registration[] = []
let overlay: DevToolsOverlay | undefined
let hot: Hot | undefined
let mounted: Mounted | undefined
let selected: symbol | undefined
let selector: HTMLSelectElement | undefined
let nextLabel = 1
let userSelected = false

const chosen = (): Registration | undefined => registrations.find(({ id }) => id === selected) ?? registrations.at(-1)

function updateSelector(): void {
	if (typeof document === "undefined") return
	if (registrations.length < 2) {
		selector?.remove()
		selector = undefined
		return
	}
	if (selector === undefined) {
		selector = document.createElement("select")
		selector.setAttribute("aria-label", "Foldkit DevTools Provider")
		selector.dataset.reactFoldkitDevtools = "provider-selector"
		Object.assign(selector.style, {
			position: "fixed",
			zIndex: "2147483647",
			insetBlockEnd: "1rem",
			insetInlineEnd: "1rem",
			padding: "0.4rem 0.6rem",
			borderRadius: "0.5rem",
			font: "12px system-ui",
			color: "#fff",
			background: "#1d1d1d",
			border: "1px solid #555",
		})
		selector.addEventListener("change", function () {
			selected = registrations[Number(selector?.value)]?.id
			userSelected = true
			Effect.runFork(lock.withPermit(reconcile()))
		})
		document.body.append(selector)
	}
	selector.replaceChildren(
		...registrations.map(function (registration, index) {
			const option = document.createElement("option")
			option.value = String(index)
			option.textContent = registration.label
			option.selected = registration.id === selected
			return option
		})
	)
}

const reconcile = (): Effect.Effect<void> =>
	Effect.gen(function* () {
		const next = chosen()
		if (
			next !== undefined &&
			overlay !== undefined &&
			mounted?.registration === next &&
			mounted.factory === overlay
		) {
			updateSelector()
			return
		}
		if (mounted !== undefined) {
			const previous = mounted
			mounted = undefined
			yield* Scope.close(previous.scope, Exit.void)
		}
		if (next !== undefined && overlay !== undefined) {
			const scope = yield* Scope.make()
			yield* overlay(next.store, next.position, next.mode, next.banner).pipe(Scope.provide(scope))
			mounted = { registration: next, scope, factory: overlay }
		}
		updateSelector()
	})

/**
 * Connects the injected native Foldkit overlay and Vite HMR bridge to Provider recorders.
 *
 * @category configuration
 * @since 0.2.0
 */
export function __configure(overlayFactory: DevToolsOverlay, devServerHot: Hot | undefined): () => void {
	overlay = overlayFactory
	hot = devServerHot
	Effect.runFork(
		lock
			.withPermit(reconcile())
			.pipe(
				Effect.catchCause((cause) =>
					Effect.logError("[react-foldkit] DevTools overlay activation failed", cause)
				)
			)
	)
	return function () {
		if (overlay !== overlayFactory) return
		overlay = undefined
		hot = undefined
		Effect.runFork(
			lock
				.withPermit(reconcile())
				.pipe(
					Effect.catchCause((cause) =>
						Effect.logError("[react-foldkit] DevTools overlay cleanup failed", cause)
					)
				)
		)
	}
}

export const getHot = (): Hot | undefined => hot

export const register = (
	store: DevToolsStore,
	position: DevToolsPosition,
	mode: DevToolsMode,
	banner: Option.Option<string>
): Effect.Effect<void, never, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.gen(function* () {
			const registration: Registration = {
				id: Symbol(),
				store,
				position,
				mode,
				banner,
				label: `Provider ${nextLabel++}`,
			}
			registrations.push(registration)
			if (!userSelected) selected = registration.id
			yield* lock
				.withPermit(reconcile())
				.pipe(
					Effect.catchCause((cause) =>
						Effect.logError("[react-foldkit] DevTools overlay activation failed", cause)
					)
				)
			return registration
		}),
		(registration) =>
			lock.withPermit(
				Effect.sync(function () {
					const index = registrations.indexOf(registration)
					if (index < 0) return
					registrations.splice(index, 1)
					if (selected === registration.id) {
						selected = registrations.at(-1)?.id
						userSelected = false
					}
				}).pipe(
					Effect.andThen(reconcile()),
					Effect.catchCause((cause) =>
						Effect.logError("[react-foldkit] DevTools overlay cleanup failed", cause)
					)
				)
			)
	)
