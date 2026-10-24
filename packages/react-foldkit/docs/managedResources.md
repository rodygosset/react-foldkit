# Resources that follow the Model

A Managed Resource exists only while the Model asks for it. Use one for a Worker, a camera stream, or a connection that should start and stop as your app's state changes. The Store opens it, hands it to your Commands, and closes it for you.

Import `ManagedResource` from `foldkit`. React Foldkit uses Foldkit's tags, builders, helpers, and errors as they are. Put the resource declarations on the Program, next to `update` and `subscriptions`.

## Declare a Worker

This Program starts a Worker when it receives `RequestedWorker`, and stops it when it receives `StoppedWorker`.

```ts
import { Effect, Option, Schema } from "effect"
import { ManagedResource } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import { Application, Program } from "react-foldkit"

const Model = Schema.Struct({
	maybeWorkerUrl: Schema.Option(Schema.String),
	maybeError: Schema.Option(Schema.String),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
	RequestedWorker: { url: Schema.String },
	StoppedWorker: {},
	CompletedAcquireWorker: {},
	CompletedReleaseWorker: {},
	FailedAcquireWorker: { error: Schema.String },
})
type Message = typeof Message.Type

const WorkerResource = ManagedResource.tag<Worker>()("WorkerResource")

const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
	worker: entry(Schema.Option(Schema.String), {
		resource: WorkerResource,
		modelToMaybeRequirements: (model) => model.maybeWorkerUrl,
		acquire: (url) => Effect.try(() => new Worker(url, { type: "module" })),
		release: (worker) => Effect.sync(() => worker.terminate()),
		onAcquired: () => Message.CompletedAcquireWorker(),
		onReleased: () => Message.CompletedReleaseWorker(),
		onAcquireError: (error) => Message.FailedAcquireWorker({ error: String(error) }),
	}),
}))

const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		RequestedWorker: ({ url }) => ({
			model: modifyFields(model, {
				maybeWorkerUrl: () => Option.some(url),
				maybeError: () => Option.none(),
			}),
		}),
		StoppedWorker: () => ({
			model: modifyFields(model, { maybeWorkerUrl: () => Option.none() }),
		}),
		CompletedAcquireWorker: () => ({ model }),
		CompletedReleaseWorker: () => ({ model }),
		FailedAcquireWorker: ({ error }) => ({
			model: modifyFields(model, { maybeError: () => Option.some(error) }),
		}),
	})

const program = Program.make({
	Model,
	Message,
	init: () => ({
		model: { maybeWorkerUrl: Option.none(), maybeError: Option.none() },
	}),
	update,
	managedResources,
})

export const App = Application.define(program)
```

`modelToMaybeRequirements` tells the Store what the Model asks for:

| The Model asks for | The Store |
| --- | --- |
| `Option.some(url)` for the first time | Starts a Worker for `url` |
| The same URL again | Keeps the current Worker |
| A different URL | Stops the current Worker, then starts a new one |
| `Option.none()` | Stops the Worker and starts none |

The requirements Schema decides whether two requirements are the same.

If starting fails, the Store sends the `onAcquireError` Message, and waits for the requirements to change before it tries again. A bug that throws inside `modelToMaybeRequirements` or the Schema's equality check crashes the Store.

## Read the live value in a Command

`WorkerResource.get` is an Effect that returns the current Worker. Catch `ResourceNotAvailable` when there may be no Worker. `get` doesn't wait for the Worker to start, and doesn't keep it alive while the Command runs.

To run a Command right after the Worker starts, return it from the `CompletedAcquireWorker` handler. If one update both asks for the Worker and returns the Command, the Command may run before the Worker exists.

### Which services a record supplies

A registered resource supplies its service to Commands and Subscriptions, so the host doesn't have to. That holds only when TypeScript can see the record's keys:

| `managedResources` is | Supplies its services |
| --- | --- |
| A record with known keys | Yes |
| A value that may be `undefined` | No |
| A record typed as `Record<string, ...>` | No |
| A choice between records or tags | Only the services every choice has |

When a condition picks between two tags, the host must supply any service the picked record might lack.

To write an update's service types by hand, get them from Foldkit's `ManagedResource.ServiceOf` or `ServicesOf`. Build the Program with `Program.make` so its type keeps the registered tags.

## Supply other services

The host's `resources` Layer supplies the services the managed records don't. An app that only needs managed services needs no Layer. `Store.make` can take the other services from the Effect around it. React apps and `Store.boot` need a closed Layer for them.

`acquire` runs in an Effect Scope that lasts as long as the resource. It can call `Layer.build` or add finalizers. `release` runs before those finalizers. If a Layer does all the cleanup, use `release: () => Effect.void`. As in Foldkit, a failure inside `release` is ignored, and the Store still clears the value and sends `onReleased`.

## Compose child resources

- To register a child's resources on the parent Program, use Foldkit's `ManagedResource.lift(childResources)({ read, toParentMessage })`. `read` returns an `Option`, and when the child is missing, its resources stop.
- To combine records, use `ManagedResource.aggregate(childResources, otherResources)`. It rejects duplicate keys.

A Submodel Provider owns no resources. Unmounting a child's React view doesn't stop a resource while the child is still in the parent Model.

## When resources start and stop

- Server rendering, and React renders that get thrown away, start nothing.
- When the Provider activates in the browser, the Store reads the current Model and starts resources before it starts init Commands.
- Deactivation stops Commands and Subscriptions, then stops managed resources, then releases the other services.
- Reactivation starts fresh resources from the kept Model. `retainInactive` keeps resources running for its window, so a quick hide and show stops nothing.

Each Store and each activation holds its own resources, even when two use the same tag. After shutdown, the Store drops that activation's start and stop Messages, so they can't change a kept or disposed Model.
