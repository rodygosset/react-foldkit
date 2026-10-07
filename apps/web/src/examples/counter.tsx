import { Button } from "@workspace/ui/components/button"
import { Schema } from "effect"
import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"
import { ExampleShell } from "../components/example-shell"

const Model = Schema.Struct({
	count: Schema.Finite,
})

type Model = typeof Model.Type

const Message = defineMessageUnion({
	ClickedDecrement: {},
	ClickedIncrement: {},
	ClickedReset: {},
})
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

const init = (): UpdateReturn => ({ model: { count: 0 } })

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ClickedDecrement: () => ({ model: modifyFields(model, { count: (count) => count - 1 }) }),
		ClickedIncrement: () => ({ model: modifyFields(model, { count: (count) => count + 1 }) }),
		ClickedReset: () => ({ model: modifyFields(model, { count: () => 0 }) }),
	})

const { Provider, useModel, useDispatch } = defineApplication({ Model, update })

function View() {
	const count = useModel((model) => model.count)
	const dispatch = useDispatch()

	return (
		<ExampleShell
			title="Counter"
			description="Dispatch Messages. Update returns a new Model. No local React state."
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center px-6 pb-20">
				<p
					className="text-[7.5rem] leading-none font-semibold tracking-tight tabular-nums transition-transform duration-300 sm:text-[9rem]"
					aria-live="polite"
				>
					{count}
				</p>
				<div className="mt-10 flex items-center gap-3">
					<Button
						variant="outline"
						size="icon-lg"
						aria-label="Decrement"
						onClick={() => dispatch(Message.ClickedDecrement())}
					>
						<MinusIcon />
					</Button>
					<Button
						variant="outline"
						size="icon-lg"
						aria-label="Increment"
						onClick={() => dispatch(Message.ClickedIncrement())}
					>
						<PlusIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label="Reset"
						onClick={() => dispatch(Message.ClickedReset())}
					>
						<RotateCcwIcon />
					</Button>
				</div>
			</div>
		</ExampleShell>
	)
}

export function Counter() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
