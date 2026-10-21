import { Option } from 'effect';
export declare const GOT_MESSAGE_PATTERN: RegExp;
export declare const isTagged: <I>(input: I) => input is I & {
    readonly _tag: string;
};
/** Submodel chain information extracted from a recorded Message. */
export type SubmodelInfo = Readonly<{
    submodelPath: ReadonlyArray<string>;
    maybeLeafTag: Option.Option<string>;
}>;
/**
 * Walk a chain of `Got<Submodel>Message` wrappers in a recorded Message and
 * return the wrapper tags plus the innermost leaf tag.
 *
 * The Submodel pattern propagates child Messages up to a parent by wrapping
 * them in `GotChildMessage({ message: childMessage })`. Nested submodels stack
 * those wrappers. Walking the chain reveals the parent → child → grandchild
 * dispatch path that produced the entry.
 *
 * Returns an empty path and `Option.none` for top-level Messages whose tag
 * doesn't match the `Got*Message` pattern. Otherwise the path lists wrapper
 * tags from outer to inner, and `maybeLeafTag` is `Some` when the innermost
 * wrapped value is itself a tagged Message (the underlying child Message that
 * originated the chain).
 */
export declare const extractSubmodelInfo: (tag: string, message: unknown) => SubmodelInfo;
//# sourceMappingURL=submodelPath.d.ts.map