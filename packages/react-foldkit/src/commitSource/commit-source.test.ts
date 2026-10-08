// @vitest-environment node

import { Cause, Effect, Exit, Function, Option, Result, Scope } from "effect"
import { describe, expect, it, vi } from "vitest"
import { entry, fakeSource, Message } from "../../test/fixtures/commit-source"
import { CommitError } from "../store"
import * as CommitSource from "./connection"

type ReconcileObserver<E = never> = Parameters<CommitSource.Connection<Message, E>["connect"]>[1]

const succeed = () => Result.void

/**
 * Mirrors how a host owns the connection: it provides a Scope, and closes it on failure the
 * same way a React cleanup would on unmount.
 */
function connect<E>(
	connection: CommitSource.Connection<Message, E>,
	commit: Parameters<typeof connection.connect>[0],
	onReconcile: ReconcileObserver<E> = Function.constVoid
) {
	const scope = Scope.makeUnsafe()
	const exit = Effect.runSyncExit(
		connection.connect(commit, onReconcile).pipe(
			Scope.provide(scope),
			Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause)))
		)
	)
	return { scope, exit, stop: () => Effect.runSync(Scope.close(scope, Exit.void)) }
}

describe("commit source reconciliation and failures", function () {
	it("deduplicates cloned entries, changed Messages, and reordered snapshots with the same tokens", function () {
		const initial = [entry("a", 1), entry("b", "v1")]
		const source = fakeSource(initial)
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: initial }))
		const committed = vi.fn(succeed)
		const { stop } = connect(connection, committed)
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
		const { stop } = connect(connection, committed)
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
		const { stop } = connect(connection, committed)
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
		const onReconcile = vi.fn<ReconcileObserver>()
		const { stop } = connect(connection, committed, onReconcile)
		try {
			source.publish([entry("fresh", 1), entry("a", 1), entry("a", 2)])
			expect(onReconcile).toHaveBeenCalledWith(
				Exit.fail(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" }))
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
				return Result.succeed(this.entries)
			},
			subscribe: () => function () {},
		}
		const connection = Result.getOrThrow(CommitSource.make({ source, initialSnapshot: [] }))
		const committed = vi.fn(succeed)
		const { stop } = connect(connection, committed)
		expect(committed).toHaveBeenCalledWith(Message.Received({ value: "a" }))
		stop()
	})

	it("returns a typed baseline validation failure before subscribing", function () {
		const source = fakeSource<Message>()
		const result = CommitSource.make({ source: source.source, initialSnapshot: [entry("a", 1), entry("a", 2)] })
		expect(result).toEqual(Result.fail(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" })))
		expect(source.subscriptions).toBe(0)
	})

	it("retains a successful prefix delivery but retries a failed commit after reconnection", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		source.set([entry("a", 1), entry("b", 1)])
		const attempted: string[] = []
		const error = new CommitError({ reason: "Disposed" })
		const { exit } = connect(connection, function (message) {
			if (message._tag === "Received") attempted.push(message.value)
			return message._tag === "Received" && message.value === "b" ? Result.fail(error) : Result.succeed(undefined)
		})
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause))).toBe(error)
			expect(Cause.hasDies(exit.cause)).toBe(false)
		}
		expect(attempted).toEqual(["a", "b"])
		expect(source.listeners).toBe(0)
		const { stop } = connect(connection, function (message) {
			if (message._tag === "Received") attempted.push(message.value)
			return Result.succeed(undefined)
		})
		expect(attempted).toEqual(["a", "b", "b"])
		stop()
	})

	it("reports reentrancy without replaying successfully committed tokens", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const onReconcile = vi.fn<ReconcileObserver>()
		const { stop } = connect(
			connection,
			function () {
				source.notify()
				source.notify()
				return Result.succeed(undefined)
			},
			onReconcile
		)
		source.publish([entry("a", 1)])
		expect(onReconcile).toHaveBeenCalledExactlyOnceWith(
			Exit.fail(new CommitSource.CommitSourceError({ reason: "Reentrant" }))
		)
		stop()
		const committed = vi.fn(succeed)
		const { stop: again } = connect(connection, committed)
		expect(committed).not.toHaveBeenCalled()
		again()
	})

	it("reports a failing reporter once, never feeding its own failure back to it", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const onReconcile = vi.fn<ReconcileObserver>(function () {
			throw new Error("reporter defect")
		})
		const { stop } = connect(connection, succeed, onReconcile)
		try {
			expect(() => source.publish([entry("a", 1), entry("a", 2)])).toThrow("reporter defect")
			expect(onReconcile).toHaveBeenCalledExactlyOnceWith(
				Exit.fail(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" }))
			)
		} finally {
			stop()
		}
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
		const { exit, stop } = connect(connection, committed)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findDefect(exit.cause))).toEqual(new Error("read failed"))
		}
		expect(source.listeners).toBe(0)
		fail = false
		source.set([entry("a", 1)])
		source.notifications[0]!()
		expect(committed).not.toHaveBeenCalled()
		stop()
		const retry = connect(connection, committed)
		expect(committed).toHaveBeenCalledTimes(1)
		retry.stop()
		expect(source.unsubscriptions).toBe(2)
	})

	it("retries a failed live delivery without reconnecting or replaying its successful prefix", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const attempted: string[] = []
		let fail = true
		const error = new CommitError({ reason: "Reentrant" })
		const onReconcile = vi.fn<ReconcileObserver>()
		const { stop } = connect(
			connection,
			function (message) {
				if (message._tag === "Received") attempted.push(message.value)
				return fail && message._tag === "Received" && message.value === "b"
					? Result.fail(error)
					: Result.succeed(undefined)
			},
			onReconcile
		)
		try {
			source.publish([entry("a", 1), entry("b", 1)])
			expect(onReconcile).toHaveBeenCalledExactlyOnceWith(Exit.fail(error))
			expect(source.listeners).toBe(1)
			fail = false
			source.notify()
			source.notify()
			expect(attempted).toEqual(["a", "b", "b"])
			expect(source.subscriptions).toBe(1)
		} finally {
			stop()
		}
	})

	it("reports a typed snapshot failure, cancels delivery, and accepts the next publication", function () {
		const source = fakeSource<Message>()
		const readFailure = new Error("snapshot failure")
		let fail = false
		const connection = Result.getOrThrow(
			CommitSource.make({
				source: {
					...source.source,
					getSnapshot: () => (fail ? Result.fail(readFailure) : source.source.getSnapshot()),
				},
				initialSnapshot: [],
			})
		)
		const committed = vi.fn(succeed)
		const onReconcile = vi.fn<ReconcileObserver<Error>>()
		const { stop } = connect(connection, committed, onReconcile)
		try {
			fail = true
			source.notify()
			expect(onReconcile).toHaveBeenCalledExactlyOnceWith(Exit.fail(readFailure))
			expect(committed).not.toHaveBeenCalled()
			expect(source.listeners).toBe(1)
			fail = false
			source.publish([entry("a", 1)])
			expect(committed).toHaveBeenCalledExactlyOnceWith(Message.Received({ value: "a" }))
		} finally {
			stop()
		}
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
		const { exit } = connect(connection, () => Result.fail(failure))
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Result.getOrThrow(Cause.findError(exit.cause))).toBe(failure)
			expect(Result.getOrThrow(Cause.findDefect(exit.cause))).toBe(release)
		}
		expect(source.listeners).toBe(0)
		expect(source.unsubscriptions).toBe(1)
	})

	it("treats every activation as a fresh subscription", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const committed = vi.fn(succeed)
		connect(connection, committed).stop()
		source.publish([entry("a", 1)])
		expect(committed).not.toHaveBeenCalled()
		connect(connection, committed).stop()
		expect(committed).toHaveBeenCalledExactlyOnceWith(Message.Received({ value: "a" }))
	})

	it("reports live Exits in order, leaving setup and release to the scoped Effect", function () {
		const source = fakeSource<Message>()
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const onReconcile = vi.fn<ReconcileObserver>()
		const { exit, stop } = connect(connection, succeed, onReconcile)
		expect(exit).toEqual(Exit.void)
		expect(onReconcile).not.toHaveBeenCalled()
		try {
			source.publish([entry("a", 1)])
			source.publish([entry("a", 1), entry("a", 2)])
			source.publish([entry("a", 1)])
			source.notify()
			expect(onReconcile.mock.calls).toEqual([
				[Exit.void],
				[Exit.fail(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" }))],
				[Exit.void],
				[Exit.void],
			])
		} finally {
			stop()
		}
		source.notifications[0]!()
		expect(onReconcile).toHaveBeenCalledTimes(4)
	})

	it("reports a throwing live snapshot as a defect and recovers without reconnecting", function () {
		const source = fakeSource<Message>()
		const defect = new Error("live snapshot defect")
		let fail = false
		const connection = Result.getOrThrow(
			CommitSource.make({
				source: {
					...source.source,
					getSnapshot() {
						if (fail) throw defect
						return source.source.getSnapshot()
					},
				},
				initialSnapshot: [],
			})
		)
		const onReconcile = vi.fn<ReconcileObserver>()
		const committed = vi.fn(succeed)
		const { stop } = connect(connection, committed, onReconcile)
		fail = true
		expect(() => source.notify()).not.toThrow()
		expect(onReconcile).toHaveBeenCalledExactlyOnceWith(Exit.die(defect))
		fail = false
		source.publish([entry("a", 1)])
		expect(committed).toHaveBeenCalledExactlyOnceWith(Message.Received({ value: "a" }))
		stop()
	})

	it("acquires cleanup before a throwing immediate notification fails setup", function () {
		const source = fakeSource<Message>()
		const defect = new Error("immediate snapshot defect")
		const cleanupDefect = new Error("cleanup defect")
		source.onSubscribe(() => source.notify())
		source.onUnsubscribe(function () {
			throw cleanupDefect
		})
		const connection = Result.getOrThrow(
			CommitSource.make<Message, never>({
				source: {
					...source.source,
					getSnapshot() {
						throw defect
					},
				},
				initialSnapshot: [],
			})
		)
		const { exit } = connect(connection, succeed)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) expect(exit.cause).toEqual(Cause.combine(Cause.die(defect), Cause.die(cleanupDefect)))
		expect(source.listeners).toBe(0)
		expect(source.unsubscriptions).toBe(1)
	})

	it("retains an immediate notification failure when a later setup notification succeeds", function () {
		const source = fakeSource<Message>()
		source.onSubscribe(function () {
			source.publish([entry("a", 1), entry("a", 2)])
			source.publish([entry("a", 1)])
		})
		const connection = Result.getOrThrow(CommitSource.make({ source: source.source, initialSnapshot: [] }))
		const { exit } = connect(connection, succeed)
		expect(Exit.isFailure(exit)).toBe(true)
		if (Exit.isFailure(exit)) {
			expect(Cause.findErrorOption(exit.cause)).toEqual(
				Option.some(new CommitSource.CommitSourceError({ reason: "DuplicateKey", key: "a" }))
			)
		}
		expect(source.listeners).toBe(0)
		expect(source.unsubscriptions).toBe(1)
	})

	it("captures a throwing subscription as a setup defect", function () {
		const defect = new Error("subscribe defect")
		const connection = Result.getOrThrow(
			CommitSource.make<Message, never>({
				source: {
					getSnapshot: () => Result.succeed([]),
					subscribe() {
						throw defect
					},
				},
				initialSnapshot: [],
			})
		)
		const { exit, stop } = connect(connection, succeed)
		expect(exit).toEqual(Exit.die(defect))
		stop()
	})
})
