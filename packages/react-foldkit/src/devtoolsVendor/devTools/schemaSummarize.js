import { Array, Option, Predicate, Record, String, flow, pipe } from 'effect';
const PATH_SEPARATOR = '.';
const isRecord = (value) => Predicate.isObject(value) && !Array.isArray(value);
const isReadonlyArray = (value) => Array.isArray(value);
const isStringArray = (values) => Array.every(values, Predicate.isString);
const stringEnumOf = (schema) => {
    if (!isRecord(schema)) {
        return Option.none();
    }
    const candidate = schema['enum'];
    if (!Array.isArray(candidate)) {
        return Option.none();
    }
    return Option.liftPredicate(candidate, isStringArray);
};
const variantTagOf = (schema) => {
    if (!isRecord(schema) || schema['type'] !== 'object') {
        return Option.none();
    }
    const properties = schema['properties'];
    if (!isRecord(properties)) {
        return Option.none();
    }
    return stringEnumOf(properties['_tag']).pipe(Option.flatMap(tags => tags.length === 1 ? Array.head(tags) : Option.none()));
};
const anyOfOf = (schema) => {
    if (!isRecord(schema)) {
        return Option.none();
    }
    return Option.liftPredicate(schema['anyOf'], isReadonlyArray);
};
const isDiscriminatedUnion = (schema) => Option.exists(anyOfOf(schema), Predicate.and(Array.isReadonlyArrayNonEmpty, Array.every(flow(variantTagOf, Option.isSome))));
const payloadFieldsOf = (variant) => {
    if (!isRecord(variant)) {
        return [];
    }
    const properties = variant['properties'];
    if (!isRecord(properties)) {
        return [];
    }
    return pipe(Record.keys(properties), Array.filter(name => name !== '_tag'));
};
const unionFieldsOf = (variant) => {
    if (!isRecord(variant)) {
        return [];
    }
    const properties = variant['properties'];
    if (!isRecord(properties)) {
        return [];
    }
    return pipe(Record.toEntries(properties), Array.filter(([name, schema]) => name !== '_tag' && isDiscriminatedUnion(schema)), Array.map(([name]) => name));
};
const entryOf = (variant) => variantTagOf(variant).pipe(Option.map(tag => ({
    tag,
    payloadFields: payloadFieldsOf(variant),
    unionFields: unionFieldsOf(variant),
})));
const topLevelVariantsOf = (document) => {
    if (!isRecord(document)) {
        return Option.none();
    }
    return anyOfOf(document['schema']);
};
const indexEntriesOf = (members) => pipe(members, Array.map(entryOf), Array.getSomes);
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
export const indexMessageSchemaDocument = (document) => Option.map(topLevelVariantsOf(document), indexEntriesOf);
const collapseUnionsInValue = (value) => {
    if (Array.isArray(value)) {
        return Array.map(value, collapseUnionsInValue);
    }
    if (!isRecord(value)) {
        return value;
    }
    if (isDiscriminatedUnion(value)) {
        return Option.match(anyOfOf(value), {
            onNone: () => value,
            onSome: members => ({
                _summary: 'union',
                variants: indexEntriesOf(members),
            }),
        });
    }
    return Record.map(value, child => collapseUnionsInValue(child));
};
const collapseUnionsInVariantPayload = (variant) => {
    if (!isRecord(variant)) {
        return variant;
    }
    const properties = variant['properties'];
    if (!isRecord(properties)) {
        return variant;
    }
    const collapsed = Record.map(properties, (schema, name) => name === '_tag' ? schema : collapseUnionsInValue(schema));
    return { ...variant, properties: collapsed };
};
const findVariantByTag = (members, tag) => Array.findFirst(members, variant => Option.exists(variantTagOf(variant), candidate => candidate === tag));
/**
 * Idiomatic Foldkit Messages carry at most one tagged-union payload field per
 * variant: either a `Got<Child>Message { message }` Submodel wrapper or a
 * regular Message with one tagged-union value-type payload (e.g. `ClickedLink {
 * request: UrlRequest }`). Multi-union-field variants are non-idiomatic;
 * surrounding state that a child Submodel needs belongs as an argument to
 * the child's `update`/`view`, not as a sibling field on the parent Message.
 * Returns `None` when zero or multiple union fields exist so the path walker
 * can produce an actionable error rather than silently picking one.
 */
const singleUnionFieldOf = (variant) => {
    if (!isRecord(variant)) {
        return Option.none();
    }
    const properties = variant['properties'];
    if (!isRecord(properties)) {
        return Option.none();
    }
    const unionEntries = pipe(Record.toEntries(properties), Array.filter(([name, schema]) => name !== '_tag' && isDiscriminatedUnion(schema)));
    if (unionEntries.length !== 1) {
        return Option.none();
    }
    return Option.gen(function* () {
        const [name, schema] = yield* Array.head(unionEntries);
        const members = yield* anyOfOf(schema);
        return { name, members };
    });
};
const replaceUnionField = (variant, fieldName, narrowedChild) => {
    if (!isRecord(variant)) {
        return variant;
    }
    const properties = variant['properties'];
    if (!isRecord(properties)) {
        return variant;
    }
    const updated = {
        ...properties,
        [fieldName]: { anyOf: [narrowedChild] },
    };
    return { ...variant, properties: updated };
};
const stepIntoVariant = (variant, rest) => Option.gen(function* () {
    const field = yield* singleUnionFieldOf(variant);
    const narrowedChild = yield* narrowAtPath(field.members, rest);
    return replaceUnionField(variant, field.name, narrowedChild);
});
const narrowAtPath = (members, segments) => Option.gen(function* () {
    const tag = yield* Array.head(segments);
    const variant = yield* findVariantByTag(members, tag);
    const rest = Array.drop(segments, 1);
    if (Array.isReadonlyArrayEmpty(rest)) {
        return collapseUnionsInVariantPayload(variant);
    }
    return yield* stepIntoVariant(variant, rest);
});
/**
 * Split a dot-separated variant path into its segments. Empty segments are
 * dropped so callers can pass user-supplied strings without first trimming
 * leading/trailing dots.
 */
export const splitVariantPath = (variantPath) => pipe(variantPath, String.split(PATH_SEPARATOR), Array.filter(String.isNonEmpty));
const stepToNextUnionMembers = (members, segment) => Option.gen(function* () {
    const variant = yield* findVariantByTag(members, segment);
    const field = yield* singleUnionFieldOf(variant);
    return field.members;
});
const variantsAtPathPrefix = (document, segments) => Option.flatMap(topLevelVariantsOf(document), topMembers => Array.reduce(segments, Option.some(topMembers), (currentMembers, segment) => Option.flatMap(currentMembers, members => stepToNextUnionMembers(members, segment))));
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
export const variantTagsAtPathPrefix = (document, pathPrefix) => Option.map(variantsAtPathPrefix(document, pathPrefix), members => Array.map(indexEntriesOf(members), entry => entry.tag));
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
export const diagnoseVariantPath = (document, segments) => {
    const tryLength = (length) => {
        if (length < 0) {
            return Option.none();
        }
        const prefix = Array.take(segments, length);
        return Option.match(variantTagsAtPathPrefix(document, prefix), {
            onNone: () => tryLength(length - 1),
            onSome: available => Option.some({
                prefix,
                failingSegment: Array.get(segments, length),
                available,
            }),
        });
    };
    return tryLength(segments.length - 1);
};
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
export const narrowToVariant = (document, variantPath) => {
    if (!isRecord(document)) {
        return Option.none();
    }
    const segments = splitVariantPath(variantPath);
    if (Array.isReadonlyArrayEmpty(segments)) {
        return Option.none();
    }
    return Option.gen(function* () {
        const members = yield* topLevelVariantsOf(document);
        const narrowed = yield* narrowAtPath(members, segments);
        return {
            ...document,
            schema: { anyOf: [narrowed] },
            definitions: collapseUnionsInValue(document['definitions']),
        };
    });
};
