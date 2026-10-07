import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Context, Deferred, Effect, Layer, Option, Result, Schema } from "effect"
import React from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { modifyFields } from "./struct"
import { ChildMessage, ChildModel, createSubmodelFixture } from "../test/fixtures/react-submodel"
import * as Command from "./command"
import { defineMessageUnion } from "./message"
import {
	defineApplication,
	defineSubmodel,
	defineSubmodelProjection,
	SubmodelProviderError,
	type ModelSource,
} from "./react"
import * as Update from "./update"

const Model = Schema.Struct({ count: Schema.Finite })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Increment: {}, Load: {}, Loaded: { count: Schema.Finite } })
type Message = typeof Message.Type
const OutMessage = defineMessageUnion({ Changed: { count: Schema.Finite } })
type OutMessage = typeof OutMessage.Type

class Reader extends Context.Service<Reader, { readonly read: Effect.Effect<number> }>()("SubmodelTest/Reader") {}

const Load = Command.define("LoadCount", {
	messages: [Message.Loaded],
	execute: Effect.gen(function* () {
		const reader = yield* Reader
		return Message.Loaded({ count: yield* reader.read })
	}),
})

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, Reader>

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		Increment: () => ({
			model: modifyFields(model, { count: (count) => count + 1 }),
			outMessage: OutMessage.Changed({ count: model.count + 1 }),
		}),
		Load: () => ({ model, commands: [Load()] }),
		Loaded: ({ count }) => ({
			model: modifyFields(model, { count: () => count }),
			outMessage: OutMessage.Changed({ count }),
		}),
	})

const Submodel = defineSubmodel<Model, Message>()

afterEach(cleanup)

function View(props: { name: string }) {
	const model = Submodel.useModel()
	const dispatch = Submodel.useDispatch()
	return (
		<div>
			<output data-testid={props.name}>{model.count}</output>
			<button onClick={() => dispatch(Message.Increment())}>{props.name} increment</button>
			<button onClick={() => dispatch(Message.Load())}>{props.name} load</button>
		</div>
	)
}

describe("defineSubmodel", function () {
	it("composes inline root, sibling, and nested Providers without parent subscriptions", function () {
		const fixture = createSubmodelFixture()
		const NumberView = defineSubmodel<number, string>()
		const nestedProjection = defineSubmodelProjection({
			read: (model: ChildModel) => model.count,
			toParentMessage: (_message: string) => ChildMessage.Increment(),
		})
		let commit: ReturnType<typeof fixture.App.useCommit> | undefined
		const sources: Array<ModelSource<{ readonly count: number; readonly unrelated: number }, ChildMessage>> = []
		function Capture() {
			commit = fixture.App.useCommit()
			return null
		}
		function Nested() {
			return (
				<fixture.Child.SubmodelProvider
					projection={nestedProjection}
					render={({ source }) => (
						<NumberView.Provider source={source}>
							<Counter />
						</NumberView.Provider>
					)}
				/>
			)
		}
		function Counter() {
			const count = NumberView.useModel()
			const dispatch = NumberView.useDispatch()
			return <button onClick={() => dispatch("increment")}>{count}</button>
		}
		function Sibling() {
			return <output>{fixture.Child.useModel((model) => model.count)}</output>
		}
		render(
			<fixture.App.Provider init={{ model: { child: { count: 1, unrelated: 0 }, other: 0 } }}>
				<Capture />
				<fixture.App.SubmodelProvider
					projection={fixture.projection}
					render={function ({ source }) {
						sources.push(source)
						return (
							<fixture.Child.Provider source={source}>
								<Nested />
							</fixture.Child.Provider>
						)
					}}
				/>
				<fixture.App.SubmodelProvider
					projection={fixture.projection}
					render={function ({ source }) {
						sources.push(source)
						return (
							<fixture.Child.Provider source={source}>
								<Sibling />
							</fixture.Child.Provider>
						)
					}}
				/>
			</fixture.App.Provider>
		)
		act(function () {
			Result.getOrThrow(commit!({ _tag: "Other" }))
		})
		expect(sources).toHaveLength(2)
		fireEvent.click(screen.getByRole("button"))
		// Dispatch is queued; commit flushes it without subscribing the helpers.
		act(function () {
			Result.getOrThrow(commit!({ _tag: "Other" }))
		})
		expect(screen.getByRole("button").textContent).toBe("2")
		expect(screen.getByRole("status").textContent).toBe("2")
		expect(sources).toHaveLength(2)
	})

	it("suppresses equal selections and dispatch-only renders without subscribing the parent view", async function () {
		const fixture = createSubmodelFixture()
		const selected: Array<{ value: number }> = []
		let fullRenders = 0
		let dispatchRenders = 0
		function Selected() {
			const value = fixture.Child.useModel((model) => ({ value: model.count }))
			selected.push(value)
			return <output data-testid="selected">{value.value}</output>
		}
		function Full() {
			fullRenders += 1
			return <output data-testid="full">{fixture.Child.useModel().unrelated}</output>
		}
		function Dispatch() {
			dispatchRenders += 1
			const dispatch = fixture.Child.useDispatch()
			return <button onClick={() => dispatch(ChildMessage.Increment())}>increment</button>
		}
		render(
			<fixture.Tree>
				<Selected />
				<Full />
				<Dispatch />
			</fixture.Tree>
		)
		const initial = selected[0]
		const parentRenders = fixture.parentRenders
		const source = fixture.source
		expect(source.getSnapshot()).toBe(source.getSnapshot())
		act(() => fixture.set({ count: 1, unrelated: 9 }))
		expect(selected).toEqual([initial])
		expect(fullRenders).toBe(2)
		expect(screen.getByTestId("full").textContent).toBe("9")
		act(() => fixture.other())
		expect(selected).toHaveLength(1)
		expect(fixture.parentRenders).toBe(parentRenders)
		expect(fixture.source).toBe(source)
		expect(dispatchRenders).toBe(1)
		expect(source.getServerSnapshot()).toEqual({ count: 1, unrelated: 0 })
		expect(source.getServerSnapshot()).toBe(source.getServerSnapshot())
		fireEvent.click(screen.getByText("increment"))
		await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("2"))
	})

	it("uses changed selectors and comparators, including undefined selections", function () {
		const fixture = createSubmodelFixture()
		const selected: Array<{ value: number }> = []
		let undefinedRenders = 0
		const parity = (a: { value: number }, b: { value: number }) => a.value % 2 === b.value % 2
		const exact = (a: { value: number }, b: { value: number }) => a.value === b.value
		function Selected(props: { other: boolean; equal: typeof parity }) {
			const value = fixture.Child.useModel(
				(model) => ({ value: props.other ? model.unrelated : model.count }),
				props.equal
			)
			selected.push(value)
			return <output>{value.value}</output>
		}
		function Undefined() {
			undefinedRenders += 1
			expect(fixture.Child.useModel(() => undefined)).toBeUndefined()
			return null
		}
		const tree = (other: boolean, equal: typeof parity) => (
			<fixture.Tree>
				<Selected
					other={other}
					equal={equal}
				/>
				<Undefined />
			</fixture.Tree>
		)
		const rendered = render(tree(false, parity))
		const initial = selected[0]
		act(() => fixture.set({ count: 3, unrelated: 9 }))
		expect(selected).toEqual([initial])
		expect(undefinedRenders).toBe(1)
		rendered.rerender(tree(false, exact))
		expect(selected.at(-1)).toEqual({ value: 3 })
		rendered.rerender(tree(true, exact))
		expect(selected.at(-1)).toEqual({ value: 9 })
	})

	it("composes nested projections and isolates sibling dispatchers under one root", async function () {
		const fixture = createSubmodelFixture()
		const NumberView = defineSubmodel<number, ChildMessage>()
		const left = {
			read: (model: Model & { unrelated: number }) => model.count,
			toParentMessage: (message: ChildMessage) => message,
		}
		const right = {
			...left,
			read: (model: Model & { unrelated: number }) => model.unrelated,
			toParentMessage: (_message: ChildMessage) => ChildMessage.IncrementOther(),
		}
		const renders: number[] = []
		function NumberComponent(props: { name: string }) {
			const value = NumberView.useModel()
			const dispatch = NumberView.useDispatch()
			return (
				<button onClick={() => dispatch(ChildMessage.Increment())}>
					{props.name}:{value}
				</button>
			)
		}
		function Nested() {
			renders.push(1)
			const one = fixture.Child.useSubmodel(left)
			const two = fixture.Child.useSubmodel(right)
			return (
				<>
					<NumberView.Provider source={one}>
						<NumberComponent name="left" />
					</NumberView.Provider>
					<NumberView.Provider source={two}>
						<NumberComponent name="right" />
					</NumberView.Provider>
				</>
			)
		}
		render(
			<fixture.Tree>
				<Nested />
			</fixture.Tree>
		)
		fireEvent.click(screen.getByText("right:0"))
		await waitFor(() => expect(screen.getByText("right:1")).toBeDefined())
		expect(screen.getByText("left:1")).toBeDefined()
		fireEvent.click(screen.getByText("left:1"))
		await waitFor(() => expect(screen.getByText("left:2")).toBeDefined())
		expect(screen.getByText("right:1")).toBeDefined()
		expect(renders).toHaveLength(1)
	})

	it("replaces both the snapshot and dispatcher when a projection changes", async function () {
		const fixture = createSubmodelFixture()
		const alternate = {
			...fixture.projection,
			read: (model: Parameters<typeof fixture.projection.read>[0]) =>
				modifyFields(model.child, { count: () => model.child.unrelated + 10 }),
			toParentMessage: (_message: ChildMessage) =>
				fixture.projection.toParentMessage(ChildMessage.IncrementOther()),
		}
		function Selected() {
			const count = fixture.Child.useModel((model) => model.count)
			const dispatch = fixture.Child.useDispatch()
			return <button onClick={() => dispatch(ChildMessage.Increment())}>{count}</button>
		}
		function Connection(props: { alternate: boolean }) {
			const source = fixture.App.useSubmodel(props.alternate ? alternate : fixture.projection)
			// Public sources may use normal methods that depend on their receiver.
			const receiver = React.useMemo(
				() => ({
					underlying: source,
					getSnapshot() {
						return this.underlying.getSnapshot()
					},
					getServerSnapshot() {
						return this.underlying.getServerSnapshot()
					},
					subscribe(notify: () => void) {
						return this.underlying.subscribe(notify)
					},
					dispatch(message: ChildMessage) {
						this.underlying.dispatch(message)
					},
				}),
				[source]
			)
			return (
				<fixture.Child.Provider source={receiver}>
					<Selected />
				</fixture.Child.Provider>
			)
		}
		const tree = (alternate: boolean) => (
			<fixture.Tree>
				<Connection alternate={alternate} />
			</fixture.Tree>
		)
		const rendered = render(tree(false))
		expect(screen.getByText("1")).toBeDefined()
		rendered.rerender(tree(true))
		expect(screen.getByText("10")).toBeDefined()
		fireEvent.click(screen.getByText("10"))
		await waitFor(() => expect(screen.getByText("11")).toBeDefined())
		rendered.rerender(tree(false))
		expect(screen.getByText("1")).toBeDefined()
		fireEvent.click(screen.getByText("1"))
		await waitFor(() => expect(screen.getByText("2")).toBeDefined())
	})

	it("keeps committed selections when a selector render is abandoned by Suspense", async function () {
		const fixture = createSubmodelFixture()
		const selections: Array<{ value: number }> = []
		const committed: Array<{ value: number }> = []
		const sameParity = (a: { value: number }, b: { value: number }) => a.value % 2 === b.value % 2
		// A native Promise is the React Suspense protocol, not an Effect service API.
		const pending = new Promise<void>(function () {})
		function Selected(props: { suspend: boolean }) {
			const value = fixture.Child.useModel(
				(model) => ({ value: props.suspend ? model.unrelated : model.count }),
				sameParity
			)
			selections.push(value)
			React.useLayoutEffect(function recordCommittedSelection() {
				committed.push(value)
			})
			if (props.suspend) throw pending
			return <output data-testid="selection">{value.value}</output>
		}
		function View() {
			const [suspend, setSuspend] = React.useState(false)
			return (
				<>
					<button onClick={() => React.startTransition(() => setSuspend(true))}>suspend</button>
					<button onClick={() => setSuspend(false)}>replace</button>
					<React.Suspense fallback={<span>pending</span>}>
						<Selected suspend={suspend} />
					</React.Suspense>
				</>
			)
		}
		render(
			<fixture.Tree>
				<View />
			</fixture.Tree>
		)
		const initial = selections[0]
		fireEvent.click(screen.getByText("suspend"))
		await waitFor(() => expect(selections.some((value) => value.value === 0)).toBe(true))
		expect(screen.getByTestId("selection").textContent).toBe("1")
		fireEvent.click(screen.getByText("replace"))
		act(() => fixture.set({ count: 3, unrelated: 0 }))
		expect(screen.getByTestId("selection").textContent).toBe("1")
		expect(committed.at(-1)).toBe(initial)
	})

	it("releases subscriptions through Strict Mode, Activity, and unmount, then catches up on reconnect", function () {
		const fixture = createSubmodelFixture()
		function Selected() {
			return <output>{fixture.Child.useModel((model) => model.count)}</output>
		}
		const child = <Selected />
		const tree = (visible: boolean) => (
			<React.StrictMode>
				<fixture.Tree>
					<React.Activity mode={visible ? "visible" : "hidden"}>{child}</React.Activity>
				</fixture.Tree>
			</React.StrictMode>
		)
		const rendered = render(tree(true))
		expect(fixture.listeners).toBe(1)
		rendered.rerender(tree(false))
		expect(fixture.listeners).toBe(0)
		act(() => fixture.set({ count: 9, unrelated: 0 }))
		rendered.rerender(tree(true))
		expect(screen.getByText("9")).toBeDefined()
		expect(fixture.listeners).toBe(1)
		rendered.unmount()
		expect(fixture.listeners).toBe(0)
	})

	it.each(["useModel", "useDispatch"] as const)("%s requires its matching child Provider", function (hook) {
		const fixture = createSubmodelFixture()
		function Missing() {
			Submodel[hook]()
			return null
		}
		expect(() =>
			renderToString(
				<fixture.Tree>
					<Missing />
				</fixture.Tree>
			)
		).toThrow(SubmodelProviderError)
	})

	it("reuses one child under different parents while the root runs Commands and folds OutMessages", async function () {
		const layer = Layer.succeed(Reader, { read: Effect.succeed(7) })
		const ParentMessage = defineMessageUnion({ GotChild: { message: Message } })
		type ParentMessage = typeof ParentMessage.Type
		const FirstModel = Schema.Struct({ form: Model, reported: Schema.Finite })
		type FirstModel = typeof FirstModel.Type
		const SecondModel = Schema.Struct({ editor: Model, total: Schema.Finite })
		type SecondModel = typeof SecondModel.Type
		const foldFirst = Update.foldChild({
			update,
			read: (model: FirstModel) => Option.some(model.form),
			write: (model, form) => modifyFields(model, { form: () => form }),
			toParentMessage: (message) => ParentMessage.GotChild({ message }),
			foldOutMessage: (out) => (model) => ({ model: modifyFields(model, { reported: () => out.count }) }),
		})
		const foldSecond = Update.foldChild({
			update,
			read: (model: SecondModel) => Option.some(model.editor),
			write: (model, editor) => modifyFields(model, { editor: () => editor }),
			toParentMessage: (message) => ParentMessage.GotChild({ message }),
			foldOutMessage: (out) => (model) => ({ model: modifyFields(model, { total: () => out.count }) }),
		})
		const First = defineApplication({
			Model: FirstModel,
			update: (model: FirstModel, { message }: ParentMessage) => foldFirst(model, message),
			layer,
		})
		const Second = defineApplication({
			Model: SecondModel,
			update: (model: SecondModel, { message }: ParentMessage) => foldSecond(model, message),
			layer,
		})
		function FirstView() {
			const model = First.useModel()
			const source = First.useSubmodel({
				read: (model) => model.form,
				toParentMessage: (message: Message) => ParentMessage.GotChild({ message }),
			})
			return (
				<Submodel.Provider source={source}>
					<View name="first" />
					<output data-testid="reported">{model.reported}</output>
				</Submodel.Provider>
			)
		}
		function SecondView() {
			const model = Second.useModel()
			const source = Second.useSubmodel({
				read: (model) => model.editor,
				toParentMessage: (message: Message) => ParentMessage.GotChild({ message }),
			})
			return (
				<Submodel.Provider source={source}>
					<View name="second" />
					<output data-testid="total">{model.total}</output>
				</Submodel.Provider>
			)
		}
		render(
			<>
				<First.Provider init={{ model: { form: { count: 0 }, reported: 0 } }}>
					<FirstView />
				</First.Provider>
				<Second.Provider init={{ model: { editor: { count: 4 }, total: 4 } }}>
					<SecondView />
				</Second.Provider>
			</>
		)
		fireEvent.click(screen.getByText("first load"))
		await waitFor(() => expect(screen.getByTestId("reported").textContent).toBe("7"))
		expect(screen.getByTestId("first").textContent).toBe("7")
		expect(screen.getByTestId("second").textContent).toBe("4")
		expect(screen.getByTestId("total").textContent).toBe("4")
		fireEvent.click(screen.getByText("second increment"))
		await waitFor(() => expect(screen.getByTestId("total").textContent).toBe("5"))
		expect(screen.getByTestId("second").textContent).toBe("5")
		expect(screen.getByTestId("first").textContent).toBe("7")
	})

	it("subscribes optional composition only to presence and supports initial absence and re-entry", function () {
		const ParentModel = Schema.Struct({ child: Schema.Option(Model) })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({ Set: { child: Schema.Option(Model) } })
		type ParentMessage = typeof ParentMessage.Type
		const App = defineApplication({
			Model: ParentModel,
			update: (model: ParentModel, { child }: ParentMessage) => ({
				model: modifyFields(model, { child: () => child }),
			}),
		})
		const projection = defineSubmodelProjection({
			read: (model: ParentModel) => model.child,
			toParentMessage: (_message: Message) => ParentMessage.Set({ child: Option.none() }),
		})
		let commit: Option.Option<ReturnType<typeof App.useCommit>> = Option.none()
		let parentRenders = 0
		function Connection() {
			parentRenders += 1
			commit = Option.some(App.useCommit())
			const source = App.useOptionalSubmodel(projection)
			return Option.match(source, {
				onNone: () => <span>absent</span>,
				onSome: (source) => (
					<Submodel.Provider source={source}>
						<View name="optional" />
					</Submodel.Provider>
				),
			})
		}
		render(
			<App.Provider init={{ model: { child: Option.none() } }}>
				<Connection />
			</App.Provider>
		)
		expect(screen.getByText("absent")).toBeDefined()
		const set = (child: Option.Option<Model>) =>
			act(() => Result.getOrThrow(Option.getOrThrow(commit)(ParentMessage.Set({ child }))))
		set(Option.some({ count: 1 }))
		expect(screen.getByTestId("optional").textContent).toBe("1")
		const renders = parentRenders
		set(Option.some({ count: 2 }))
		expect(screen.getByTestId("optional").textContent).toBe("2")
		expect(parentRenders).toBe(renders)
		set(Option.none())
		expect(screen.queryByTestId("optional")).toBeNull()
		set(Option.some({ count: 9 }))
		expect(screen.getByTestId("optional").textContent).toBe("9")
	})

	it("lets the parent reject stale handlers and Command results after an optional child is replaced", async function () {
		const result = Deferred.makeUnsafe<number>()
		let starts = 0
		const layer = Layer.succeed(Reader, {
			read: Effect.gen(function* () {
				starts += 1
				return yield* Deferred.await(result)
			}),
		})
		const Child = Schema.Struct({ instanceId: Schema.String, model: Model })
		const ParentModel = Schema.Struct({ child: Schema.Option(Child), reported: Schema.Finite })
		type ParentModel = typeof ParentModel.Type
		const ParentMessage = defineMessageUnion({
			GotChild: { instanceId: Schema.String, message: Message },
			Remove: {},
			Recreate: { instanceId: Schema.String },
		})
		type ParentMessage = typeof ParentMessage.Type
		const seen = vi.fn<(message: ParentMessage) => void>()
		const foldChild = (instanceId: string) =>
			Update.foldChild({
				update,
				read: (model: ParentModel) =>
					model.child.pipe(
						Option.filter((child) => child.instanceId === instanceId),
						Option.map((child) => child.model)
					),
				write: (model, childModel) =>
					modifyFields(model, {
						child: (child) =>
							Option.map(child, (child) => modifyFields(child, { model: () => childModel })),
					}),
				toParentMessage: (message) => ParentMessage.GotChild({ instanceId, message }),
				foldOutMessage: (out) => (model) => ({ model: modifyFields(model, { reported: () => out.count }) }),
			})
		const App = defineApplication({
			Model: ParentModel,
			layer,
			update(model: ParentModel, message: ParentMessage): Update.Return<ParentModel, ParentMessage, Reader> {
				seen(message)
				return ParentMessage.match(message, {
					GotChild: ({ instanceId, message }) => foldChild(instanceId)(model, message),
					Remove: () => ({ model: modifyFields(model, { child: () => Option.none() }) }),
					Recreate: ({ instanceId }) => ({
						model: modifyFields(model, { child: () => Option.some({ instanceId, model: { count: 0 } }) }),
					}),
				})
			},
		})
		let departing: Option.Option<ModelSource<Model, Message>> = Option.none()
		let staleDispatch: Option.Option<(message: Message) => void> = Option.none()
		function Capture(props: { instanceId: string }) {
			const dispatch = Submodel.useDispatch()
			React.useLayoutEffect(
				function captureOriginalDispatch() {
					if (props.instanceId === "original") staleDispatch = Option.some(dispatch)
				},
				[dispatch, props.instanceId]
			)
			return <View name="child" />
		}
		function ChildConnection(props: { instanceId: string }) {
			const projection = React.useMemo(
				() => ({
					read: (model: ParentModel) =>
						model.child.pipe(
							Option.filter((child) => child.instanceId === props.instanceId),
							Option.map((child) => child.model)
						),
					toParentMessage: (message: Message) =>
						ParentMessage.GotChild({ instanceId: props.instanceId, message }),
				}),
				[props.instanceId]
			)
			const source = App.useOptionalSubmodel(projection)
			if (props.instanceId === "original" && Option.isSome(source)) departing = source
			return Option.match(source, {
				onNone: () => null,
				onSome: (source) => (
					<Submodel.Provider source={source}>
						<Capture instanceId={props.instanceId} />
					</Submodel.Provider>
				),
			})
		}
		function ParentView() {
			const model = App.useModel()
			const commit = App.useCommit()
			return (
				<>
					<button
						onClick={function () {
							expect(Option.getOrThrow(departing).getServerSnapshot()).toEqual({ count: 0 })
							Result.getOrThrow(commit(ParentMessage.Remove()))
							// Read after root removal, before React has flushed the unmount.
							expect(Option.getOrThrow(departing).getSnapshot()).toEqual({ count: 1 })
						}}
					>
						remove
					</button>
					<button
						onClick={() => Result.getOrThrow(commit(ParentMessage.Recreate({ instanceId: "replacement" })))}
					>
						recreate
					</button>
					<output data-testid="reported">{model.reported}</output>
					{Option.match(model.child, {
						onNone: () => null,
						onSome: (child) => (
							<ChildConnection
								key={child.instanceId}
								instanceId={child.instanceId}
							/>
						),
					})}
				</>
			)
		}
		render(
			<App.Provider
				init={{ model: { child: Option.some({ instanceId: "original", model: { count: 0 } }), reported: 0 } }}
			>
				<ParentView />
			</App.Provider>
		)
		fireEvent.click(screen.getByText("child load"))
		await waitFor(() => expect(starts).toBe(1))
		fireEvent.click(screen.getByText("child increment"))
		await waitFor(() => expect(screen.getByTestId("child").textContent).toBe("1"))
		fireEvent.click(screen.getByText("remove"))
		expect(screen.queryByTestId("child")).toBeNull()
		act(() => Option.getOrThrow(staleDispatch)(Message.Increment()))
		await waitFor(() =>
			expect(seen).toHaveBeenCalledWith(
				ParentMessage.GotChild({ instanceId: "original", message: Message.Increment() })
			)
		)
		expect(screen.queryByTestId("child")).toBeNull()
		fireEvent.click(screen.getByText("recreate"))
		act(() => Option.getOrThrow(staleDispatch)(Message.Increment()))
		act(function () {
			Effect.runSync(Deferred.succeed(result, 9))
		})
		await waitFor(() =>
			expect(seen).toHaveBeenCalledWith(
				ParentMessage.GotChild({ instanceId: "original", message: Message.Loaded({ count: 9 }) })
			)
		)
		expect(screen.getByTestId("child").textContent).toBe("0")
		expect(screen.getByTestId("reported").textContent).toBe("1")
		fireEvent.click(screen.getByText("child load"))
		await waitFor(() => expect(screen.getByTestId("child").textContent).toBe("9"))
		expect(screen.getByTestId("reported").textContent).toBe("9")
		expect(starts).toBe(2)
	})
})
