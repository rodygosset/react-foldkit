// @vitest-environment node

import { Cause, Effect, Exit, Result, Scope } from "effect"
import { describe, expect, it, vi } from "vitest"
import { entry, fakeSource, Message } from "../../test/fixtures/commit-source"
import { CommitError } from "../store"
import * as CommitSource from "./commit-source"

function connect(connection: CommitSource.Connection<Message>, commit: Parameters<typeof connection.connect>[0]) {
	const scope = Scope.makeUnsafe()
	Effect.runSync(
		connection.connect(commit).pipe(
			Scope.provide(scope),
			Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause)))
		)
	)
	return () => Effect.runSync(Scope.close(scope, Exit.void))
}
const succeed = () => Result.void

describe("commit source reconciliation and failures", function () {
	it("deduplicates cloned entries, changed Messages, and reordered snapshots with the same tokens", function () {
		const initial = [entry("a", 1), entry("b", "v1")]
		const source = fakeSource(initial)
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: initial }))
		const committed = vi.fn(succeed)
		const stop = connect(connection, committed)
		try {
			source.publish([entry("b", "v1", "different"), entry("a", 1, "different")])
			source.notify()
			expect(committed).not.toHaveBeenCalled()
		} finally {
			stop()
		}
	})

	it("delivers changed scalar tokens once, without coercion or monotonicity requirements", function () {
		const initial = [entry("a", 10)]
		const source = fakeSource(initial)
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: initial }))
		const committed = vi.fn(succeed)
		const stop = connect(connection, committed)
		try {
			for (const version of [2, "2", "new-token"]) {
				source.publish([entry("a", version, String(version))])
				source.notify()
			}
			expect(committed.mock.calls).toEqual([
				[Message.Received({ value: "2" })],
				[Message.Received({ value: "2" })],
				[Message.Received({ value: "new-token" })],
			])
		} finally {
			stop()
		}
	})

	it("forgets only removed entries and delivers a cached version again on re-entry", function () {
		const initial = [entry("a", 1), entry("b", 1)]
		const source = fakeSource(initial)
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: initial }))
		const committed = vi.fn(succeed)
		const stop = connect(connection, committed)
		try {
			source.publish([initial[1]!])
			expect(committed).not.toHaveBeenCalled()
			source.publish(initial)
			expect(committed.mock.calls).toEqual([[Message.Received({ value: "a" })]])
		} finally {
			stop()
		}
	})

	it("validates all keys before delivering any part of a malformed snapshot", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const committed = vi.fn(succeed)
		const stop = connect(connection, committed)
		try {
			expect(() => source.publish([entry("fresh", 1), entry("a", 1), entry("a", 2)])).toThrow(
				new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" })
			)
			expect(committed).not.toHaveBeenCalled()
			source.publish([entry("a", 1)])
			expect(committed.mock.calls).toEqual([[Message.Received({ value: "a" })]])
		} finally {
			stop()
		}
	})

	it("preserves the receiver of a consumer's snapshot method", function () {
		const source = {
			entries: [entry("a", 1)],
			getSnapshot() {
				return this.entries
			},
			subscribe: () => function () {},
		}
		const connection = Result.getOrThrow(CommitSource.make({ source, initialSnapshot: [] }))
		const committed = vi.fn(succeed)
		const stop = connect(connection, committed)
		expect(committed).toHaveBeenCalledWith(Message.Received({ value: "a" }))
		stop()
	})
	it("returns a typed baseline validation failure before subscribing", function () {
		const source = fakeSource<Message>()
		const result = CommitSource.make({ source: source.source, initialSnapshot: [entry("a", 1), entry("a", 2)] })
		expect(result).toEqual(Result.fail(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" })))
		expect(source.subscriptions).toBe(0)
	})

	it("retains successful prefix delivery but retries a typed failed commit after reconnection", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		source.set([entry("a", 1), entry("b", 1)])
		const attempted: string[] = []
		const error = new CommitError({ reason: "Disposed" })
		const exit = Effect.runSyncExit(
			Effect.scoped(
				connection.connect(function (message) {
					if (message._tag === "Received") attempted.push(message.value)
					return message._tag === "Received" && message.value === "b"
						? Result.fail(error)
						: Result.succeed(undefined)
				})
			)
		)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause))).toBe(error)
			expect(Cause.hasDies(exit.cause)).toBe(false)
		}
		expect(attempted).toEqual(["a", "b"])
		expect(source.listeners).toBe(0)
		const stop = connect(connection, function (message) {
			if (message._tag === "Received") attempted.push(message.value)
			return Result.succeed(undefined)
		})
		expect(attempted).toEqual(["a", "b", "b"])
		stop()
	})

	it("rejects reentrant notifications and retries an undelivered token", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const stop = connect(connection, function () {
			source.notify()
			return Result.succeed(undefined)
		})
		expect(() => source.publish([entry("a", 1)])).toThrow(CommitSource.CommitSourceError)
		stop()
		const committed = vi.fn(succeed)
		const again = connect(connection, committed)
		expect(committed).toHaveBeenCalledTimes(1)
		again()
	})

	it("cleans up and ignores late notifications when catch-up snapshot reading fails", function () {
		const source = fakeSource<Message>()
		let fail = true
		const connection = Result.getOrThrow(
			CommitSource.make({
				source: {
					...source.source,
					getSnapshot() {
						if (fail) throw new Error("read failed")
						return source.source.getSnapshot()
					},
				},
				initialSnapshot: [],
			})
		)
		const committed = vi.fn(succeed)
		expect(() => connect(connection, committed)).toThrow("read failed")
		expect(source.listeners).toBe(0)
		fail = false
		source.set([entry("a", 1)])
		source.notifications[0]!()
		expect(committed).not.toHaveBeenCalled()
		const stop = connect(connection, committed)
		expect(committed).toHaveBeenCalledTimes(1)
		stop()
		stop()
		expect(source.unsubscriptions).toBe(2)
	})

	it("retries a failed live delivery without reconnecting or replaying its successful prefix", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const attempted: string[] = []
		let fail = true
		const error = new CommitError({ reason: "Reentrant" })
		const stop = connect(connection, function (message) {
			if (message._tag === "Received") attempted.push(message.value)
			return fail && message._tag === "Received" && message.value === "b"
				? Result.fail(error)
				: Result.succeed(undefined)
		})
		expect(() => source.publish([entry("a", 1), entry("b", 1)])).toThrow(error)
		expect(source.listeners).toBe(1)
		fail = false
		source.notify()
		source.notify()
		expect(attempted).toEqual(["a", "b", "b"])
		expect(source.subscriptions).toBe(1)
		stop()
	})

	it("preserves setup failure and release defect in one Cause, even with immediate notification", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const failure = new CommitError({ reason: "Disposed" })
		const release = new Error("release failed")
		source.set([entry("a", 1)])
		source.onSubscribe(() => source.notify())
		source.onUnsubscribe(function () {
			throw release
		})
		const exit = Effect.runSyncExit(Effect.scoped(connection.connect(() => Result.fail(failure))))
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause))).toBe(failure)
			expect(Result.getOrThrow(Cause.findDefect(exit.cause))).toBe(release)
		}
		expect(source.listeners).toBe(0)
		expect(source.unsubscriptions).toBe(1)
	})
})
