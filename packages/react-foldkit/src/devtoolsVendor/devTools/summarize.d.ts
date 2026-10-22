import { Schema } from 'effect';
declare const PathResolution: import("../schema/index.js").TaggedUnion<{
    readonly Found: {
        value: Schema.Unknown;
        atPath: Schema.String;
    };
    readonly NotFound: {
        failedAt: Schema.String;
        reason: Schema.String;
        availableKeys: Schema.$Array<Schema.String>;
    };
}>;
/**
 * The result of looking up a `root.foo.bar` path in a Model snapshot.
 * `PathResolution.Found` returns the value and the path where it was found.
 * `PathResolution.NotFound` reports where the lookup stopped and which keys
 * were available there.
 */
export type PathResolution = typeof PathResolution.Type;
/** Looks up a `root.foo.bar` path in a Model snapshot. On failure, returns the
 * deepest path reached and the keys available there. */
export declare const resolvePath: (root: unknown, path: string) => PathResolution;
/**
 * Apply structural summarization rules to a value:
 * - Arrays collapse to `{ _summary, length, sample: [head, last] }` at every depth.
 * - Records walk to a depth of 3, then collapse to `{ _summary, keys }`.
 * - Long strings collapse to `{ _summary, length, head }`.
 * - Tagged values (`{ _tag, ... }`) keep their `_tag` since it's a record key.
 *
 * The result is JSON-serializable and intended for transmission to MCP clients
 * with `expand: false`. Use raw values directly when `expand: true`.
 */
export declare const summarizeValue: (value: unknown) => unknown;
/** Formats a `NotFound` result for `ResponseError.reason`, including the keys
 * available where the lookup stopped. */
export declare const formatPathNotFound: (notFound: Extract<PathResolution, {
    _tag: 'NotFound';
}>) => string;
export {};
//# sourceMappingURL=summarize.d.ts.map