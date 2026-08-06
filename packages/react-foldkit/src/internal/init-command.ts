export const CompletionTypeId: unique symbol = Symbol.for(
	"@rodygosset/react-foldkit/InitCommandCompletionTypeId"
)

type TrackedCommand = {
	readonly [CompletionTypeId]?: () => void
}

export function track<Command extends object>(command: Command, onComplete: () => void): Command {
	return { ...command, [CompletionTypeId]: onComplete }
}

export function complete(command: object): void {
	const onComplete = (command as TrackedCommand)[CompletionTypeId]
	if (onComplete !== undefined) onComplete()
}
