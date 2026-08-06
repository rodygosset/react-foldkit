import { ReactFoldkit } from "@rodygosset/react-foldkit"
import * as Command from "@rodygosset/react-foldkit/command"
import { m } from "@rodygosset/react-foldkit/message"
import * as Struct from "@rodygosset/react-foldkit/struct"
import type * as Update from "@rodygosset/react-foldkit/update"
import { Button } from "@workspace/ui/components/button"
import { Match, Schema } from "effect"
import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { ExampleShell } from "./components/example-shell"

const Model = Schema.Struct({
	count: Schema.Number,
})

type Model = typeof Model.Type

const ClickedDecrement = m("ClickedDecrement")
const ClickedIncrement = m("ClickedIncrement")
const ClickedReset = m("ClickedReset")

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

const { Provider, useModel, useDispatch } = ReactFoldkit.make({ schema: Model, update })

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
