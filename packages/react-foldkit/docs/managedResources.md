# Resources whose lifetime follows the Model

A Managed Resource exists while the Model needs it. Use one for a Worker, camera stream, or connection that starts and stops as application state changes.

Import `ManagedResource` from `foldkit`. React Foldkit uses Foldkit's tags, builders, composition helpers, and errors directly. Put the resource declarations on the Program alongside `update` and `subscriptions`.

## Declare a Worker

This Program starts a Worker when it receives `RequestedWorker`. It stops the Worker when it receives `StoppedWorker`.

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

`Option.some(url)` requests the Worker. An equal URL keeps the current Worker. A different URL releases it before acquisition starts again. `Option.none()` releases it without a replacement. The requirements Schema defines equality.

Acquisition failures produce `onAcquireError` Messages. The Store waits for requirements to change before attempting acquisition again. A defect in the requirements function or equality check crashes the Store.

## Read the live value in a Command

`WorkerResource.get` returns an Effect with the current Worker. Catch `ResourceNotAvailable` when the Worker may be absent. The accessor does not wait for acquisition and does not reserve the Worker for the Command's lifetime.

When a Command needs a newly acquired Worker, return the Command from the `CompletedAcquireWorker` update handler. Creating a resource requirement and returning the dependent Command in one update does not guarantee that acquisition finishes first.

Registered resources supply their services to both Commands and Subscriptions when `managedResources` is present and its keys are known. A value that may be `undefined`, or a record typed as `Record<string, ...>`, does not supply those services. Infer the service types with Foldkit's `ManagedResource.ServiceOf` or `ServicesOf` when annotating an update's requirements. Use `Program.make` to preserve the registered tags in the Program's type.

A conditional record or resource tag supplies only services present in every alternative. If a condition selects between two different tags, the host must supply any required service that the selected registration might omit.

## Supply other services

The host's `resources` Layer supplies services that the managed records do not provide. An application that only needs managed services requires no Layer. `Store.make` can receive the remaining services from its surrounding Effect. React applications and `Store.boot` require a closed Layer for them.

`acquire` receives an Effect Scope for that resource's lifetime. It can call `Layer.build` or register finalizers. The explicit `release` callback runs before those finalizers. For a Layer that owns all cleanup, use `release: () => Effect.void`. React Foldkit preserves Foldkit's behavior of swallowing failures from the explicit release Effect, clearing the live value, and sending `onReleased`.

## Compose child resources

Use Foldkit's `ManagedResource.lift(childResources)({ read, toParentMessage })` to register a child's resources on the parent Program. `read` returns an `Option`. A missing child releases its resources. Use `ManagedResource.aggregate(childResources, otherResources)` to combine records. It rejects duplicate record keys.

A Submodel Provider owns no resources. Unmounting its React view does not release a resource while the child remains present in the parent Model.

## React and cleanup

Server rendering and abandoned React renders acquire nothing. Client activation starts the watchers from the current Model before starting init Commands.

Deactivation stops Commands and Subscriptions, releases managed resources, and then releases static services. Reactivation acquires fresh resources from the retained Model. `retainInactive` keeps resources and live work running for its retention window.

Each Store and each activation has separate resource holders, even when they use the same resource tag. Shutdown drops lifecycle Messages from that activation so they cannot change a retained or disposed Model.
