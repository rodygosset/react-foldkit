import { Button } from "@workspace/ui/components/button"
import { Schema } from "effect"
import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
import { modifyFields } from "foldkit/struct"
import type * as Update from "foldkit/update"
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

const { Provider, useModel, useSend } = Application.define({ Model, Message, update })

function View() {
	const count = useModel((model) => model.count)
	const send = useSend()

	return (
		<ExampleShell slug="counter">
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
						onClick={() => send.ClickedDecrement()}
					>
						<MinusIcon />
					</Button>
					<Button
						variant="outline"
						size="icon-lg"
						aria-label="Increment"
						onClick={() => send.ClickedIncrement()}
					>
						<PlusIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label="Reset"
						onClick={() => send.ClickedReset()}
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
