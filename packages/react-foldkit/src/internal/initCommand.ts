export const CompletionTypeId: unique symbol = Symbol.for("react-foldkit/InitCommandCompletionTypeId")

type TrackedCommand = {
	readonly [CompletionTypeId]?: () => void
}

export const track = <Command extends object>(command: Command, onComplete: () => void): Command => ({
	...command,
	[CompletionTypeId]: onComplete,
})

export function complete(command: object): void {
	const onComplete = (command as TrackedCommand)[CompletionTypeId]
	if (onComplete !== undefined) onComplete()
}
