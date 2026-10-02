import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Schema } from "effect"
import { PlusIcon } from "lucide-react"
import { defineMessageUnion } from "react-foldkit/message"
import { defineSubmodel } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

export const Model = Schema.Struct({
	draft: Schema.String,
})

export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	ChangedDraft: { text: Schema.String },
	ClickedSubmit: {},
})
export type Message = typeof Message.Type

/** Fact for the parent: the user committed a non-empty draft. */
export const OutMessage = defineMessageUnion({
	Submitted: { text: Schema.String },
})
export type OutMessage = typeof OutMessage.Type

export type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage>

export const init = (): Model => ({ draft: "" })

function submit(model: Model): UpdateReturn {
	const text = model.draft.trim()
	if (text.length === 0) return { model }

	return {
		model: modifyFields(model, { draft: () => "" }),
		outMessage: OutMessage.Submitted({ text }),
	}
}

export const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ChangedDraft: ({ text }) => ({ model: modifyFields(model, { draft: () => text }) }),
		ClickedSubmit: () => submit(model),
	})

const { useModel, useDispatch, Provider } = defineSubmodel<Model, Message>()

export { Provider }

/** Reads the child view context supplied by the parent. */
export function View() {
	const draft = useModel((model) => model.draft)
	const dispatch = useDispatch()
	const onSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
		event.preventDefault()
		dispatch(Message.ClickedSubmit())
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
					value={draft}
					placeholder="What needs doing?"
					autoComplete="off"
					onChange={(event) => dispatch(Message.ChangedDraft({ text: event.target.value }))}
				/>
			</div>
			<Button
				type="submit"
				size="icon-lg"
				aria-label="Add todo"
				disabled={draft.trim().length === 0}
			>
				<PlusIcon />
			</Button>
		</form>
	)
}
