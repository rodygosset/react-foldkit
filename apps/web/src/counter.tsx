import * as Command from "@workspace/ree/command"
import * as M from "@workspace/ree/message"
import { make } from "@workspace/ree/react"
import * as Struct from "@workspace/ree/struct"
import type * as Update from "@workspace/ree/update"
import { Button } from "@workspace/ui/components/button"
import { Match, Schema } from "effect"
import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { ExampleShell } from "./components/example-shell"

const Model = Schema.Struct({
	count: Schema.Number,
})

type Model = typeof Model.Type

const ClickedDecrement = M.make("ClickedDecrement")
const ClickedIncrement = M.make("ClickedIncrement")
const ClickedReset = M.make("ClickedReset")

const Message = Schema.Union([ClickedDecrement, ClickedIncrement, ClickedReset])
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message>

const init = (): UpdateReturn => [{ count: 0 }, Command.none]

const update = (model: Model, message: Message): UpdateReturn =>
	Match.value(message).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.tagsExhaustive({
			ClickedDecrement: () => [Struct.evo(model, { count: (count) => count - 1 }), Command.none],
			ClickedIncrement: () => [Struct.evo(model, { count: (count) => count + 1 }), Command.none],
			ClickedReset: () => [Struct.evo(model, { count: () => 0 }), Command.none],
		})
	)

const { Provider, useModel, useDispatch } = make({ update })

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
					className="font-heading text-[7.5rem] leading-none tracking-tight italic tabular-nums transition-transform duration-300 sm:text-[9rem]"
					aria-live="polite"
				>
					{count}
				</p>
				<div className="mt-10 flex items-center gap-3">
					<Button
						variant="outline"
						size="icon-lg"
						aria-label="Decrement"
						onClick={() => void dispatch(ClickedDecrement())}
					>
						<MinusIcon />
					</Button>
					<Button
						variant="outline"
						size="icon-lg"
						aria-label="Increment"
						onClick={() => void dispatch(ClickedIncrement())}
					>
						<PlusIcon />
					</Button>
					<Button
						variant="ghost"
						size="icon-lg"
						aria-label="Reset"
						onClick={() => void dispatch(ClickedReset())}
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
