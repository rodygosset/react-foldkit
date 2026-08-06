import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Match, Option, Schema } from "effect"
import { PlusIcon } from "lucide-react"
import * as Command from "react-foldkit/command"
import { m } from "react-foldkit/message"
import { evo } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

export const Model = Schema.Struct({
	draft: Schema.String,
})

export type Model = typeof Model.Type

const ChangedDraft = m("ChangedDraft", { text: Schema.String })
const ClickedSubmit = m("ClickedSubmit")

export const Message = Schema.Union([ChangedDraft, ClickedSubmit])
export type Message = typeof Message.Type

/** Fact for the parent: the user committed a non-empty draft. */
export const Submitted = m("Submitted", { text: Schema.String })
export const OutMessage = Schema.Union([Submitted])
export type OutMessage = typeof OutMessage.Type

export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

export const init = (): Model => ({ draft: "" })

function submit(model: Model): UpdateReturn {
	const text = model.draft.trim()
	if (text.length === 0) return [model, Command.none, Option.none()]

	return [evo(model, { draft: () => "" }), Command.none, Option.some(Submitted({ text }))]
}

export const update = (model: Model, message: Message): UpdateReturn =>
	Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			ChangedDraft: ({ text }) => [evo(model, { draft: () => text }), Command.none, Option.none()],
			ClickedSubmit: () => submit(model),
		})
	)

/** Props-only view: no Store, no parent Messages. */
export function View(props: { model: Model; dispatch: (message: Message) => void }) {
	function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
		event.preventDefault()
		props.dispatch(ClickedSubmit())
	}

	return (
		<form
			className="flex gap-2"
			onSubmit={onSubmit}
		>
			<div className="min-w-0 flex-1 space-y-2">
				<Label
					htmlFor="todo-draft"
					className="sr-only"
				>
					New todo
				</Label>
				<Input
					id="todo-draft"
					value={props.model.draft}
					placeholder="What needs doing?"
					autoComplete="off"
					onChange={(event) => props.dispatch(ChangedDraft({ text: event.target.value }))}
				/>
			</div>
			<Button
				type="submit"
				size="icon-lg"
				aria-label="Add todo"
				disabled={props.model.draft.trim().length === 0}
			>
				<PlusIcon />
			</Button>
		</form>
	)
}
