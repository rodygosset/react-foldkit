import { Context, Effect, Layer, Option, Schema, Scope } from "effect"
import { Command, ManagedResource } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import { Application, Program, Store } from "react-foldkit"
import { expectTypeOf } from "vitest"

const Model = Schema.Struct({ requested: Schema.Option(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Acquired: {}, Released: {}, Failed: {}, Read: {} })
type Message = typeof Message.Type
const Engine = ManagedResource.tag<string>()("TypeEngine")
const Other = ManagedResource.tag<string>()("OtherTypeEngine")
type EngineService = ManagedResource.ServiceOf<typeof Engine>

const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
	engine: entry(Schema.Option(Schema.String), {
		resource: Engine,
		modelToMaybeRequirements: (model) => model.requested,
		acquire: Effect.succeed,
		release: () => Effect.void,
		onAcquired: () => Message.Acquired(),
		onReleased: () => Message.Released(),
		onAcquireError: () => Message.Failed(),
	}),
}))
const Read = Command.define("Read", {
	messages: [Message.Read, Message.Failed],
	execute: Engine.get.pipe(
		Effect.as(Message.Read()),
		Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Message.Failed()))
	),
})
const init = () => ({ model: { requested: Option.none<string>() }, commands: [Read()] })
const update = (model: Model, _message: Message): Update.Return<Model, Message, EngineService> => ({
	model,
	commands: [Read()],
})
const program = Program.make({ Model, Message, init, update, managedResources })
expectTypeOf(program.managedResources).toEqualTypeOf<typeof managedResources>()
expectTypeOf(program.init).toEqualTypeOf<() => Update.Return<Model, Message, EngineService>>()
expectTypeOf(Store.make(program, init())).toEqualTypeOf<
	Effect.Effect<Store.Store<Model, Message>, never, Scope.Scope>
>()
Application.define(program)
Store.boot(program, init())
Store.boot({ managedResources, update: (model: Model, _message: Message) => ({ model }) }, init())
Application.define({ Model, Message, managedResources, init, update: (model: Model, _message: Message) => ({ model }) })

const lifted = ManagedResource.lift(managedResources)({
	read: (model: Model) => Option.some(model),
	toParentMessage: (message: Message) => message,
})
const otherResources = ManagedResource.make<Model, Message>()((entry) => ({
	other: entry(Schema.Option(Schema.String), {
		resource: Other,
		modelToMaybeRequirements: (model) => model.requested,
		acquire: Effect.succeed,
		release: () => Effect.void,
		onAcquired: () => Message.Acquired(),
		onReleased: () => Message.Released(),
		onAcquireError: () => Message.Failed(),
	}),
}))
const combined = ManagedResource.aggregate(lifted, otherResources)
const curried = ManagedResource.aggregate<Model, Message>()(lifted, otherResources)
expectTypeOf<ManagedResource.ServicesOf<typeof curried>>().toEqualTypeOf<ManagedResource.ServicesOf<typeof combined>>()
expectTypeOf<ManagedResource.ServicesOf<typeof combined>>().toEqualTypeOf<
	EngineService | ManagedResource.ServiceOf<typeof Other>
>()
const withBoth = (
	model: Model,
	_message: Message
): Update.Return<Model, Message, ManagedResource.ServicesOf<typeof combined>> => ({ model })
Application.define(Program.make({ Model, Message, update: withBoth, managedResources: combined }))

class Api extends Context.Service<Api, string>()("TypeApi") {}
const withApi = (model: Model, _message: Message): Update.Return<Model, Message, EngineService | Api> => ({ model })
const mixed = Program.make({ Model, Message, init, update: withApi, managedResources })
Application.define(mixed, { resources: Layer.succeed(Api, "api") })
Store.boot({ ...mixed, resources: Layer.succeed(Api, "api") }, init())
expectTypeOf(Store.make(mixed, init())).toEqualTypeOf<
	Effect.Effect<Store.Store<Model, Message>, never, Api | Scope.Scope>
>()
expectTypeOf(Store.make({ ...mixed, resources: Layer.succeed(Api, "api") }, init())).toEqualTypeOf<
	Effect.Effect<Store.Store<Model, Message>, never, Scope.Scope>
>()

if (false) {
	const missing = Program.make({ Model, Message, init, update })
	// @ts-expect-error The unregistered Engine service still needs a provider.
	Application.define(missing)
	// @ts-expect-error Boot has no ambient services for an unregistered Engine.
	Store.boot(missing, init())
	// @ts-expect-error Registering a managed Engine does not provide Api.
	Application.define(mixed)
	// @ts-expect-error An empty Layer cannot provide Api.
	Application.define(mixed, { resources: Layer.empty })
	// @ts-expect-error An empty Layer cannot provide Api.
	Store.boot({ ...mixed, resources: Layer.empty }, init())
	const other = (
		model: Model,
		_message: Message
	): Update.Return<Model, Message, ManagedResource.ServiceOf<typeof Other>> => ({ model })
	// @ts-expect-error Registering Engine does not provide Other.
	Application.define(Program.make({ Model, Message, update: other, managedResources }))
	// @ts-expect-error Managed Resources belong to the Program, not React options.
	Application.define(program, { managedResources })
	const widened: ManagedResource.ManagedResources<Model, Message> = managedResources
	// @ts-expect-error A widened record cannot prove that Engine and Api are supplied.
	Application.define(Program.make({ Model, Message, init, update: withApi, managedResources: widened }))

	const optionalResources = (enabled: boolean): typeof managedResources | undefined =>
		enabled ? managedResources : undefined
	const optional = Program.make({
		Model,
		Message,
		init,
		update,
		managedResources: optionalResources(false),
	})
	// @ts-expect-error A record that may be absent does not register Engine.
	Application.define(optional)
	// @ts-expect-error A record that may be absent does not register Engine.
	Store.boot(optional, init())
	// @ts-expect-error A record that may be absent does not register Engine.
	Store.boot({ managedResources: optionalResources(false), update }, init())
	expectTypeOf(Store.make(optional, init())).toEqualTypeOf<
		Effect.Effect<Store.Store<Model, Message>, never, EngineService | Scope.Scope>
	>()

	// @ts-expect-error A concrete record type still requires that record.
	const omitted: Program.Program<typeof Model, typeof Message, never, EngineService, typeof managedResources> = {
		Model,
		Message,
		init,
		update,
	}
	void omitted
	// @ts-expect-error A concrete Store record type still requires that record.
	const omittedStore: Store.Program<Model, Message, EngineService, typeof managedResources> = { update }
	void omittedStore

	const dictionary: Record<string, (typeof managedResources)["engine"]> = {}
	// @ts-expect-error A string-keyed dictionary may be empty, so it does not register Engine.
	Application.define(Program.make({ Model, Message, init, update, managedResources: dictionary }))
	// @ts-expect-error A string-keyed dictionary may be empty, so it does not register Engine.
	Store.boot({ managedResources: dictionary, update }, init())
}
