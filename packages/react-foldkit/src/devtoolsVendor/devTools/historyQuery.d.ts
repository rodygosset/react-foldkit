import { Option, Order } from 'effect';
import type { MessageTagCount } from './protocol.js';
import { type HistoryEntry, type StoreState } from './store.js';
/**
 * Test a diff path against a dot-string pattern. Segments compare pairwise
 * for the length of the shorter list; `*` in the pattern matches any single
 * segment. Because the comparison stops at the shorter list, a pattern
 * matches changes below it (`root.grid` matches a change at `root.grid.5.3`)
 * and above it (`root.grid.5.3` matches a wholesale replacement recorded at
 * `root.grid`).
 */
export declare const matchesPathPattern: (path: string, pattern: string) => boolean;
/** Test a diff path against every pattern, succeeding on the first match. */
export declare const matchesAnyPathPattern: (path: string, patterns: ReadonlyArray<string>) => boolean;
/**
 * Find the first pattern that can never match a diff path: one whose first
 * segment is neither `root` nor `*`. Diff paths are always anchored at
 * `root`, so accepting such a pattern would silently return no results.
 */
export declare const findUnanchoredPattern: (patterns: ReadonlyArray<string>) => Option.Option<string>;
/** A retained history entry paired with its absolute history index. */
export type IndexedEntry = Readonly<{
    entry: HistoryEntry;
    index: number;
}>;
/**
 * Materialize the retained history entries with their absolute indices,
 * dropping entries before `maybeSinceIndex` and entries whose `changedPaths`
 * match none of the patterns. `Some([])` is treated as no filter so callers
 * never have to special-case an empty pattern list. Entries that did not
 * change the Model have no changed paths and never match a pattern filter.
 */
export declare const collectMatchingEntries: (state: StoreState, maybeSinceIndex: Option.Option<number>, maybeChangedPathsMatch: Option.Option<ReadonlyArray<string>>) => ReadonlyArray<IndexedEntry>;
/** One page of matching history entries plus the cursor for the next page. */
export type MessagesPage = Readonly<{
    page: ReadonlyArray<IndexedEntry>;
    maybeNextIndex: Option.Option<number>;
}>;
/**
 * Page a filtered candidate list. Forward pages take the first `limit`
 * candidates and report the absolute index of the next matching entry, which
 * a follow-up call passes back as the since index. Tail pages (`isFromEnd`)
 * take the final `limit` candidates, still in chronological order, and never
 * have a next index.
 */
export declare const pageMatchingEntries: (candidates: ReadonlyArray<IndexedEntry>, limit: number, isFromEnd: boolean) => MessagesPage;
/**
 * Count entries by Message tag, sorted by count descending then tag ascending
 * so the noisiest Messages surface first.
 */
export declare const countEntriesByTag: (entries: ReadonlyArray<IndexedEntry>) => ReadonlyArray<MessageTagCount>;
/**
 * The oldest non-init index `getModelAtIndex` can answer. The keyframe
 * stored at `startIndex` is the Model right after entry `startIndex - 1`, so
 * the index one before the oldest retained entry is still readable even
 * though its entry was evicted.
 */
export declare const oldestReadableIndex: (state: StoreState) => number;
/**
 * Whether `getModelAtIndex` can answer for this index: `INIT_INDEX` once the
 * init Model is recorded, otherwise an index between `oldestReadableIndex`
 * and the latest entry. Indices outside this range have been evicted (or
 * have not happened yet) and must be rejected rather than silently replayed
 * from the wrong keyframe.
 */
export declare const isIndexReadable: (state: StoreState, index: number) => boolean;
/**
 * Format a clear error for an index `isIndexReadable` rejected, listing the
 * index ranges the runtime can still answer for.
 */
export declare const formatIndexNotReadable: (state: StoreState, index: number) => string;
/**
 * Order diff paths for readability: segments compare pairwise, numeric
 * segments compare as numbers so `root.items.2` sorts before
 * `root.items.10`, and a path that is a prefix of another sorts first.
 */
export declare const pathOrder: Order.Order<string>;
/**
 * Read the summarized value at a diff path on a Model snapshot. `None` when
 * the path does not exist on this side of the diff (a key or element that was
 * added or removed). Resolution happens on the `toInspectableValue` transform
 * of the Model, the same tree the diff handler walks.
 */
export declare const readSummarizedValueAt: (model: unknown, path: string) => Option.Option<unknown>;
//# sourceMappingURL=historyQuery.d.ts.map