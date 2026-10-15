import { Cause, type Layer, Logger, type LogLevel } from "effect"

export interface LogEntry {
	readonly logLevel: LogLevel.LogLevel
	/** The non-Cause arguments passed to the log call, in order. */
	readonly message: unknown
	/** The Causes passed to the log call, combined. Empty when the call passed none. */
	readonly cause: Cause.Cause<unknown>
}

export interface LogCapture {
	/** Provide this Layer to the Effect that creates the code under test. */
	readonly layer: Layer.Layer<never>
	readonly entries: ReadonlyArray<LogEntry>
	/** The Causes of every entry that logged one, in log order. */
	readonly causes: () => ReadonlyArray<Cause.Cause<unknown>>
}

/**
 * Records every log entry in place of the default logger. Code under test that forks work keeps
 * the logger from the Context it captured, so provide the Layer where that Context is captured,
 * such as around `Store.make` or `session.start`.
 */
export function makeLogCapture(): LogCapture {
	const entries: Array<LogEntry> = []
	const logger = Logger.make(function ({ logLevel, message, cause }) {
		entries.push({ logLevel, message, cause })
	})
	return {
		layer: Logger.layer([logger]),
		entries,
		causes: () => entries.flatMap(({ cause }) => (cause.reasons.length === 0 ? [] : [cause])),
	}
}
