# React submodel views

Implemented in `src/react.tsx`; TodoForm and the router fixture use this API.

A child defines its Model, Messages, update, and views. Parents embed it through
Foldkit composition. Child Providers read the root store; the root runs update,
Commands, and Subscriptions.

## Define a child

```tsx
// settings.tsx
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineSubmodel } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

export const Model = Schema.Struct({ draft: Schema.String })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ChangedDraft: { text: Schema.String } })
export type Message = typeof Message.Type
export const init = (): Model => ({ draft: "" })
export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
	Message.match(message, {
		ChangedDraft: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
	})

const { useModel, useDispatch, Provider } = defineSubmodel<Model, Message>()
export { Provider }

export function View() {
	const draft = useModel((model) => model.draft)
	const dispatch = useDispatch()
	return (
		<input
			value={draft}
			onChange={(event) => dispatch(Message.ChangedDraft({ text: event.target.value }))}
		/>
	)
}
```

The factory takes Model and Message types. This example exports only
`Settings.Provider`; nested children use the same projection hooks. The
[composition example](COMMIT_SOURCE_COMPOSITION_SPEC.md) exports all standard bindings.

## Connect it to a parent

```tsx
import { Option, Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodelProjection } from "react-foldkit/react"
import * as Update from "react-foldkit/update"
import { modifyFields } from "react-foldkit/struct"
import * as Settings from "./settings"

const Model = Schema.Struct({ settings: Settings.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotSettingsMessage: { message: Settings.Message } })
type Message = typeof Message.Type

const settingsProjection = defineSubmodelProjection({
	read: (model: Model) => model.settings,
	toParentMessage: (message: Settings.Message) => Message.GotSettingsMessage({ message }),
})

const foldSettings = Update.foldChild({
	update: Settings.update,
	read: (model: Model) => Option.some(settingsProjection.read(model)),
	write: (model, settings) => modifyFields(model, { settings: () => settings }),
	toParentMessage: settingsProjection.toParentMessage,
})
const App = defineApplication({
	Model,
	update: (model: Model, message: Message) =>
		Message.match(message, {
			GotSettingsMessage: ({ message }) => foldSettings(model, message),
		}),
})

function AppView() {
	const source = App.useSubmodel(settingsProjection)
	return (
		<Settings.Provider source={source}>
			<Settings.View />
		</Settings.Provider>
	)
}
export function Application() {
	return (
		<App.Provider init={{ model: { settings: Settings.init() } }}>
			<AppView />
		</App.Provider>
	)
}
```

Root and child definitions expose `useSubmodel`. It reads the store handle without
subscribing the parent view. Keep projection functions outside components, or
memoize them per instance. Changing a function or parent source replaces the projection.

## Source and selectors

```ts
interface ModelReader<Model> {
	readonly getSnapshot: () => Model
	readonly getServerSnapshot: () => Model
	readonly subscribe: (notify: () => void) => () => void
}
interface ModelSource<Model, Message> extends ModelReader<Model> {
	readonly dispatch: (message: Message) => void
}
```

| API                                      | Behavior                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `useSubmodel({ read, toParentMessage })` | Infers child types; returns a source compatible with the child Provider. |
| `Provider({ source, children? })`        | Keeps context stable while the source is unchanged.                      |
| `useModel()`                             | Reads the whole Model using snapshot identity.                           |
| `useModel(selector, isEqual?)`           | Infers the selection; defaults to `Equal.equals`. `undefined` is valid.  |
| `useDispatch()`                          | Does not subscribe to Model changes.                                     |

Equal selections keep their reference and skip source-driven renders. Parent,
prop, state, and context changes can still render the component. React's selector
helper protects committed selections from abandoned renders. New selectors and
comparators apply on the next render.

Reads must be pure. Results cache by parent snapshot identity, separately for
live and server reads. SSR/hydration uses the initial Model; live reads use the current Model.

Hooks outside their matching child Provider throw the Schema.Error
`SubmodelProviderError`. Other Providers cannot supply that context.

## Optional and keyed children

`useOptionalSubmodel` takes an Option-returning read and returns
`Option<ModelSource<ChildModel, ChildMessage>>`. Only presence changes rerender
the connection; value changes update child consumers. Render a Provider for `Some`.

```tsx
function SettingsConnection({ instanceId }: { instanceId: string }) {
	const projection = React.useMemo(
		() => ({
			read: (model: Model) =>
				model.settings.pipe(
					Option.filter((instance) => instance.id === instanceId),
					Option.map((instance) => instance.model)
				),
			toParentMessage: (message: Settings.Message) => Message.GotSettingsMessage({ instanceId, message }),
		}),
		[instanceId]
	)
	const source = App.useOptionalSubmodel(projection)
	return Option.match(source, {
		onNone: () => null,
		onSome: (source) => (
			<Settings.Provider source={source}>
				<Settings.View />
			</Settings.Provider>
		),
	})
}
```

Reuse the guarded read and Message lift in the parent fold. Give each recreated
instance a fresh parent-owned ID, even for the same business key. Use it as the
React key and to route sibling Messages.

A removed child's source keeps its last Model until unmount. The parent fold
rejects handlers and Command results carrying the old ID. Update handles
cancellation; unmounting alone does not cancel Commands.

## Coverage

- `src/react.submodel.test.tsx`: real-store tests for selectors, equality,
  allocating reads, abandoned renders, nesting/siblings, optional instances,
  Strict Mode/Activity, Commands, OutMessages, and stale work.
- `src/internal/model-source.test.ts`: independent live/server retention.
- `test/types/react.submodel.test.ts`: emitted API checks with `expectTypeOf`
  and compile-only invalid calls.
- Router integration, SSR/hydration, and Chromium tests read through production
  child Providers beneath one persistent root Provider.
