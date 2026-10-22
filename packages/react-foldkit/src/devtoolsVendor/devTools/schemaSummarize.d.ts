import { Option } from 'effect';
import type { MessageSchemaIndexEntry } from './protocol.js';
/**
 * Build a flat directory of every top-level Message variant from a JSON Schema
 * document produced by `Schema.toJsonSchemaDocument`. The directory is small
 * even for hundreds of variants, so an MCP client can paginate by tag without
 * paying for the full schema.
 *
 * Returns `None` when the document's top-level `schema` is not a discriminated
 * union of `_tag`-keyed structs (e.g. a single-variant Message Schema, or a
 * shape produced by a future Effect Schema release that the summarizer does
 * not yet understand). The caller should fall back to fetching the full
 * document in that case.
 */
export declare const indexMessageSchemaDocument: (document: unknown) => Option.Option<ReadonlyArray<MessageSchemaIndexEntry>>;
/**
 * Split a dot-separated variant path into its segments. Empty segments are
 * dropped so callers can pass user-supplied strings without first trimming
 * leading/trailing dots.
 */
export declare const splitVariantPath: (variantPath: string) => ReadonlyArray<string>;
/**
 * Enumerate the variant tags available as the next segment of a variant path.
 * Given a partial path that resolves to a tagged-union field, returns the tags
 * of every variant in that union. Useful for crafting `not-found` error
 * messages: if `narrowToVariant` fails on `"a.b.c"`, calling this with `["a", "b"]`
 * yields the valid choices for the third segment.
 *
 * Returns `None` when the prefix cannot be resolved at all (e.g. the first
 * segment names no top-level variant, or an intermediate variant lacks a
 * tagged-union payload field).
 */
export declare const variantTagsAtPathPrefix: (document: unknown, pathPrefix: ReadonlyArray<string>) => Option.Option<ReadonlyArray<string>>;
/**
 * Diagnose where a variant-path walk would fail. Walks back from one segment
 * before the supplied path length, returning the deepest prefix whose
 * tagged-union level resolves cleanly, the tags available at that level, and
 * the next segment from the original path (the one that broke the walk). When
 * the offending segment is a known tag at that level, the failure means the
 * variant exists but has no tagged-union field to step into further. When it
 * is unknown, the failure is a simple typo. Returns `None` when not even the
 * empty prefix resolves (i.e. the document is not a discriminated union at
 * the top level).
 */
export declare const diagnoseVariantPath: (document: unknown, segments: ReadonlyArray<string>) => Option.Option<{
    prefix: ReadonlyArray<string>;
    failingSegment: Option.Option<string>;
    available: ReadonlyArray<string>;
}>;
/**
 * Replace the top-level `anyOf` in a JSON Schema document with a single-element
 * `anyOf` containing the variant(s) selected by a dot-separated variant path.
 *
 * `variantPath` is a dot-string of variant `_tag` values, walked through the
 * one tagged-union payload field at each step. For example, `"GotChildMessage"`
 * narrows the top-level union to that wrapper variant, and
 * `"GotChildMessage.Opened"` walks into the wrapper's nested union and narrows
 * to the inner variant. Any deeper discriminated unions inside the deepest
 * variant's payload are collapsed to `{ _summary: 'union', variants: [...] }`
 * placeholders so the response stays small even for deeply-nested Submodel
 * trees; agents drill further by extending the path.
 *
 * The `definitions` block is kept (any `$ref` targets the narrowed variant
 * relies on still resolve, and dead refs left over from trimmed variants are
 * harmless), but any discriminated unions inside it are collapsed to the same
 * `_summary` placeholder shape so a shared union annotated with an
 * `identifier` does not balloon the response. The path walker does not
 * resolve `$ref` indirection through `definitions`; agents that need to step
 * through a `$ref`-shared union look up the definition by name and use the
 * placeholder's variant list directly.
 *
 * Returns `None` when the document is not a top-level discriminated union, the
 * path is empty, a segment names no variant in the current union, or an
 * intermediate variant lacks exactly one tagged-union payload field to step
 * into (zero or multiple union fields are both ambiguous). The "exactly one"
 * rule encodes the Foldkit idiom (`Got<Child>Message { message }` Submodel
 * wrappers, single-union value-type fields); apps whose Message variants need
 * additional surrounding state should pass it as an argument to the child's
 * `update`/`view` rather than as a sibling field on the parent Message.
 */
export declare const narrowToVariant: (document: unknown, variantPath: string) => Option.Option<unknown>;
//# sourceMappingURL=schemaSummarize.d.ts.map