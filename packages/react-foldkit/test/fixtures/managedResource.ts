import { Effect, Option, Schema, type Scope } from "effect"
import { Command, ManagedResource } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import type * as Update from "foldkit/update"
import * as Program from "../../src/program"

export const Model = Schema.Struct({
	requested: Schema.Option(Schema.String),
	events: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	RequestedEngine: { id: Schema.String },
	DisabledEngine: {},
	AcquiredEngine: { id: Schema.String },
	ReleasedEngine: {},
	FailedAcquireEngine: { error: Schema.String },
	RequestedRead: {},
	CompletedReadEngine: { id: Schema.String },
	EngineUnavailable: {},
	TriggeredCrash: {},
})
export type Message = typeof Message.Type

export interface EngineShape {
	readonly id: string
}

export const Engine = ManagedResource.tag<EngineShape>()("TestEngine")
export type EngineService = ManagedResource.ServiceOf<typeof Engine>

export const ReadEngine = Command.define("ReadEngine", {
	messages: [Message.CompletedReadEngine, Message.EngineUnavailable],
	execute: Engine.get.pipe(
		Effect.map(({ id }) => Message.CompletedReadEngine({ id })),
		Effect.catchTag("ResourceNotAvailable", () => Effect.succeed(Message.EngineUnavailable()))
	),
})

export function update(model: Model, message: Message): Update.Return<Model, Message, EngineService> {
	switch (message._tag) {
		case "RequestedEngine":
			return { model: { ...model, requested: Option.some(message.id) } }
		case "DisabledEngine":
			return { model: { ...model, requested: Option.none() } }
		case "RequestedRead":
			return { model, commands: [ReadEngine()] }
		case "TriggeredCrash":
			throw new Error("update failed")
		default:
			return {
				model: {
					...model,
					events: [...model.events, "id" in message ? `${message._tag}:${message.id}` : message._tag],
				},
			}
	}
}

export function make<AcquireError = never>(
	acquire: (id: string) => Effect.Effect<EngineShape, AcquireError, Scope.Scope> = (id) => Effect.succeed({ id }),
	release: (engine: EngineShape) => Effect.Effect<void> = () => Effect.void,
	requested: Option.Option<string> = Option.none()
) {
	const managedResources = ManagedResource.make<Model, Message>()((entry) => ({
		engine: entry(Schema.Option(Schema.Struct({ id: Schema.String })), {
			resource: Engine,
			modelToMaybeRequirements: (model) => Option.map(model.requested, (id) => ({ id })),
			acquire: ({ id }) => acquire(id),
			release,
			onAcquired: ({ id }) => Message.AcquiredEngine({ id }),
			onReleased: () => Message.ReleasedEngine(),
			onAcquireError: (error) => Message.FailedAcquireEngine({ error: String(error) }),
		}),
	}))
	return Program.make({
		Model,
		Message,
		init: () => ({ model: { requested, events: [] } }),
		update,
		managedResources,
	})
}
