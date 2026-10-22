import { Cause, Deferred, Effect, Option, Scope, Stream, SubscriptionRef } from "effect"
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
	mounted: Deferred.Deferred<void>
}>

type Registry = Readonly<{
	overlay: DevToolsOverlay | undefined
	hot: Hot | undefined
	registrations: ReadonlyArray<Registration>
	pinnedId: symbol | undefined
	nextLabel: number
}>

type Selection = Readonly<{
	id: symbol
	overlay: DevToolsOverlay
	registration: Registration
}>

const registry = Effect.runSync(
	SubscriptionRef.make<Registry>({
		overlay: undefined,
		hot: undefined,
		registrations: [],
		pinnedId: undefined,
		nextLabel: 1,
	})
)

function selection(state: Registry): Selection | undefined {
	if (state.overlay === undefined) return undefined
	const pinned = state.registrations.find((registration) => registration.id === state.pinnedId)
	const registration = pinned ?? state.registrations.at(-1)
	if (registration === undefined) return undefined
	return { id: registration.id, overlay: state.overlay, registration }
}

const sameSelection = (previous: Selection | undefined, next: Selection | undefined): boolean =>
	previous?.id === next?.id && previous?.overlay === next?.overlay

function createSelect(): HTMLSelectElement {
	const select = document.createElement("select")
	select.setAttribute("aria-label", "Foldkit DevTools Provider")
	select.dataset.reactFoldkitDevtools = "provider-selector"
	Object.assign(select.style, {
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
	select.addEventListener("change", function () {
		const index = Number(select.value)
		Effect.runSync(
			SubscriptionRef.update(registry, function (state) {
				const id = state.registrations[index]?.id
				if (id === undefined) return state
				return { ...state, pinnedId: id }
			})
		)
	})
	return select
}

function renderSelect(select: HTMLSelectElement, state: Registry): void {
	if (typeof document === "undefined" || state.registrations.length < 2) {
		select.remove()
		return
	}
	select.replaceChildren(
		...state.registrations.map(function (registration, index) {
			const option = document.createElement("option")
			option.value = String(index)
			option.textContent = registration.label
			option.selected = registration.id === (state.pinnedId ?? state.registrations.at(-1)?.id)
			return option
		})
	)
	if (select.parentElement === null) document.body.append(select)
}

const settle = (registration: Registration): Effect.Effect<void> =>
	Effect.sync(function () {
		if (Deferred.isDoneUnsafe(registration.mounted)) return
		Deferred.doneUnsafe(registration.mounted, Effect.void)
	})

function trackSelection(
	previous: Selection | undefined,
	state: Registry,
): readonly [
	Selection | undefined,
	ReadonlyArray<{ readonly previous: Selection | undefined; readonly next: Selection | undefined }>,
] {
	const next = selection(state)
	return [next, [{ previous, next }]]
}

const mountChoice = (
	registration: Registration,
	overlay: DevToolsOverlay,
): Effect.Effect<Stream.Stream<never>, never, Scope.Scope> =>
	Effect.gen(function* () {
		const select = yield* Effect.acquireRelease(
			Effect.sync(createSelect),
			(element) =>
				Effect.sync(function () {
					element.remove()
				}),
		)
		yield* SubscriptionRef.changes(registry).pipe(
			Stream.runForEach((state) =>
				Effect.sync(function () {
					renderSelect(select, state)
				}),
			),
			Effect.forkScoped,
		)
		yield* overlay(registration.store, registration.position, registration.mode, registration.banner).pipe(
			Effect.catchCauseIf(
				(cause) => !Cause.hasInterruptsOnly(cause),
				(cause) => Effect.logError("[react-foldkit] DevTools overlay failed", cause),
			),
		)
		yield* settle(registration)
		return Stream.never
	})

const mounted = SubscriptionRef.changes(registry).pipe(
	Stream.mapAccum((): Selection | undefined => undefined, trackSelection),
	Stream.tap(function (frame) {
		if (frame.previous === undefined || frame.previous.id === frame.next?.id) return Effect.void
		return settle(frame.previous.registration)
	}),
	Stream.map((frame) => frame.next),
	Stream.changesWith(sameSelection),
	Stream.switchMap(function (choice) {
		if (choice === undefined) return Stream.never
		return Stream.unwrap(mountChoice(choice.registration, choice.overlay))
	}),
)

Effect.runFork(
	Effect.scoped(Stream.runDrain(mounted)).pipe(
		Effect.catchCause((cause) => Effect.logError("[react-foldkit] DevTools overlay failed", cause)),
	)
)

/**
 * Connects the injected native Foldkit overlay and Vite HMR bridge to Provider recorders.
 *
 * @category configuration
 * @since 0.2.0
 */
export function __configure(overlayFactory: DevToolsOverlay, devServerHot: Hot | undefined): () => void {
	Effect.runSync(
		SubscriptionRef.update(registry, (state) => ({ ...state, overlay: overlayFactory, hot: devServerHot })),
	)
	return function () {
		Effect.runSync(
			SubscriptionRef.update(registry, function (state) {
				if (state.overlay !== overlayFactory) return state
				return { ...state, overlay: undefined, hot: undefined }
			})
		)
	}
}

export const getHot = (): Hot | undefined => SubscriptionRef.getUnsafe(registry).hot

export const register = (
	store: DevToolsStore,
	position: DevToolsPosition,
	mode: DevToolsMode,
	banner: Option.Option<string>,
): Effect.Effect<void, never, Scope.Scope> =>
	Effect.gen(function* () {
		const registration = yield* Effect.acquireRelease(
			SubscriptionRef.modify(registry, function (state) {
				const next: Registration = {
					id: Symbol(),
					store,
					position,
					mode,
					banner,
					label: `Provider ${state.nextLabel}`,
					mounted: Deferred.makeUnsafe<void>(),
				}
				return [
					next,
					{
						...state,
						registrations: [...state.registrations, next],
						nextLabel: state.nextLabel + 1,
					},
				]
			}),
			(registration) =>
				SubscriptionRef.update(registry, (state) => ({
					...state,
					registrations: state.registrations.filter((item) => item.id !== registration.id),
					pinnedId: state.pinnedId === registration.id ? undefined : state.pinnedId,
				})),
		)
		if (selection(SubscriptionRef.getUnsafe(registry))?.id === registration.id) {
			yield* Deferred.await(registration.mounted)
		}
	})
