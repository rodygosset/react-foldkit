import type { SerializedCommand, SerializedEntry, SerializedMount } from './protocol.js';
import type { CommandRecord, HistoryEntry, MountRecord } from './store.js';
/**
 * Convert Effect `Redacted` values to their labeled placeholder strings and
 * DOM-class instances (File, Blob, Date, URL) to plain-object
 * representations so the tree renderer's key-enumeration walk can see their
 * meaningful data, which otherwise lives on the prototype as getters and
 * is invisible to `Object.keys`. Recurses through arrays and records so
 * the transform applies at every level. File is matched before Blob
 * because File extends Blob.
 *
 * Memoized by reference. The transform allocates fresh wrappers via
 * `Array.map` / `Record.map` even when the input contains no DOM classes
 * (because `map` always allocates), which would otherwise produce a fresh
 * tree of references on every call. Without memoization, the inspector
 * tree's row-level `lazyTreeNode` cache would miss on every row of every
 * render — the cached row args reference last render's wrapper objects, not
 * this render's. Memoizing on the input reference makes subsequent calls
 * with the same snapshot return identical references end-to-end, so the
 * row lazy actually hits.
 */
export declare const toInspectableValue: (value: unknown) => unknown;
/**
 * Convert a runtime `CommandRecord` to its wire shape. Args are wrapped in an
 * `Option` so `None` cleanly distinguishes argless Commands from Commands that
 * happen to have an empty args record. Nested Effect `Redacted` values become
 * their placeholder strings before transmission.
 */
export declare const toSerializedCommand: (command: CommandRecord) => SerializedCommand;
/**
 * Convert a runtime `MountRecord` to its wire shape. Args are wrapped in an
 * `Option` so `None` cleanly distinguishes argless Mounts from Mounts that
 * happen to have an empty args record. Nested Effect `Redacted` values become
 * their placeholder strings before transmission.
 */
export declare const toSerializedMount: (mount: MountRecord) => SerializedMount;
/**
 * Convert a `HistoryEntry` plus its absolute index into the wire-friendly
 * `SerializedEntry` shape. Flattens the diff's `HashSet` path collections to
 * plain string arrays for JSON transmission and runs the message body through
 * `toInspectableValue` so Effect `Redacted` values become placeholders and
 * DOM-class instances become inspectable objects.
 */
export declare const toSerializedEntry: (entry: HistoryEntry, index: number) => SerializedEntry;
//# sourceMappingURL=serialize.d.ts.map