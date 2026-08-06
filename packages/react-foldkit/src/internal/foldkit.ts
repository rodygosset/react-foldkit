import { Interruptible } from "foldkit/command"
import { Context, Effect, Fiber } from "effect"

type InterruptOutcome = typeof Interruptible.Outcome.Type

/**
 * Runtime side of Foldkit's interruptible Command protocol.
 *
 * Foldkit intentionally keeps this registry out of its public API. Its
 * Commands locate the registry through this stable Context reference key, so
 * React Foldkit can provide a registry per Store without importing private
 * Foldkit source.
 */
export type InterruptRegistry = Readonly<{
	lookup: (key: string) => ReadonlyArray<Fiber.Fiber<unknown, unknown>>
	register: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void
	release: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void
	interrupt: (key: string) => Effect.Effect<InterruptOutcome>
}>

export const makeInterruptRegistry = (): InterruptRegistry => {
	const holders = new Map<string, Set<Fiber.Fiber<unknown, unknown>>>()

	const lookup = (key: string): ReadonlyArray<Fiber.Fiber<unknown, unknown>> => [
		...(holders.get(key) ?? []),
	]

	const register = (key: string, fiber: Fiber.Fiber<unknown, unknown>): void => {
		const fibers = holders.get(key)
		if (fibers === undefined) holders.set(key, new Set([fiber]))
		else fibers.add(fiber)
	}

	const release = (key: string, fiber: Fiber.Fiber<unknown, unknown>): void => {
		const fibers = holders.get(key)
		if (fibers === undefined) return
		fibers.delete(fiber)
		if (fibers.size === 0) holders.delete(key)
	}

	const interrupt = (key: string): Effect.Effect<InterruptOutcome> =>
		Effect.suspend(function (): Effect.Effect<InterruptOutcome> {
			const fibers = lookup(key)
			if (fibers.length === 0) return Effect.succeed<InterruptOutcome>(Interruptible.NotFound())
			return Effect.as(Fiber.interruptAll(fibers), Interruptible.Interrupted() as InterruptOutcome)
		})

	return { lookup, register, release, interrupt }
}

export const CurrentInterruptRegistry = Context.Reference<InterruptRegistry>(
	"foldkit/Command/Interruptible/CurrentRegistry",
	{ defaultValue: makeInterruptRegistry }
)
