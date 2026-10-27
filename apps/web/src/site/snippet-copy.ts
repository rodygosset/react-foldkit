import { Duration, Effect, Option, Schema } from "effect"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
import * as Submodel from "react-foldkit/submodel"

/**
 * Copies a code snippet and shows "Copied" on its button for a moment. The site Program keeps this
 * Submodel in its `snippetCopy` field, as the Foldkit website does with its own copy buttons.
 */

const copiedIndicatorDuration = Duration.millis(1500)

// MODEL

export const Model = Schema.Struct({
	maybeCopiedSnippetId: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
	ClickedCopySnippet: { snippetId: Schema.String, text: Schema.String },
	SucceededCopySnippet: { snippetId: Schema.String },
	FailedCopySnippet: {},
	CompletedWaitBeforeHidingCopiedIndicator: { snippetId: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const CopySnippet = Command.define("CopySnippet", {
	args: { snippetId: Schema.String, text: Schema.String },
	messages: [Message.SucceededCopySnippet, Message.FailedCopySnippet],
	execute: ({ snippetId, text }) =>
		Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
			Effect.as(Message.SucceededCopySnippet({ snippetId })),
			Effect.orElseSucceed(() => Message.FailedCopySnippet())
		),
})

export const WaitBeforeHidingCopiedIndicator = Command.define("WaitBeforeHidingCopiedIndicator", {
	args: { snippetId: Schema.String },
	messages: [Message.CompletedWaitBeforeHidingCopiedIndicator],
	execute: ({ snippetId }) =>
		Effect.sleep(copiedIndicatorDuration).pipe(
			Effect.as(Message.CompletedWaitBeforeHidingCopiedIndicator({ snippetId }))
		),
})

// UPDATE

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		ClickedCopySnippet: ({ snippetId, text }) => ({ model, commands: [CopySnippet({ snippetId, text })] }),
		SucceededCopySnippet: ({ snippetId }) => ({
			model: modifyFields(model, { maybeCopiedSnippetId: () => Option.some(snippetId) }),
			commands: [WaitBeforeHidingCopiedIndicator({ snippetId })],
		}),
		FailedCopySnippet: () => ({ model }),
		CompletedWaitBeforeHidingCopiedIndicator: ({ snippetId }) => ({
			model: Option.contains(model.maybeCopiedSnippetId, snippetId)
				? modifyFields(model, { maybeCopiedSnippetId: () => Option.none() })
				: model,
		}),
	})

// INIT

export const initialModel: Model = { maybeCopiedSnippetId: Option.none() }

// HOOKS

export const { Provider, useModel, useSend } = Submodel.define({ Model, Message })
