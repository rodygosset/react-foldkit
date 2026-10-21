import { Array, Function, Match, Option, Predicate, Record, Schema, } from 'effect';
import { OptionExt } from '../effectExtensions/index.js';
import { defineTaggedUnion } from 'foldkit/schema';
const ROOT = 'root';
const PATH_SEPARATOR = '.';
const MAX_DEPTH = 3;
const STRING_TRUNCATE = 200;
const ARRAY_SAMPLE = 2;
// PATH
const PathResolution = defineTaggedUnion({
    Found: { value: Schema.Unknown, atPath: Schema.String },
    NotFound: {
        failedAt: Schema.String,
        reason: Schema.String,
        availableKeys: Schema.Array(Schema.String),
    },
});
const isExpandable = Predicate.isObjectOrArray;
const keysOf = (value) => Match.value(value).pipe(Match.when(globalThis.Array.isArray, items => Array.makeBy(items.length, index => index.toString())), Match.when(Predicate.isObject, Record.keys), Match.orElse(() => []));
const segmentsOf = (path) => path === ROOT ? [] : path.split(PATH_SEPARATOR).slice(1);
const isRootAnchored = (path) => path === ROOT || path.startsWith(`${ROOT}${PATH_SEPARATOR}`);
const descend = (parent, segment) => Match.value(parent).pipe(Match.when(globalThis.Array.isArray, array => Option.liftPredicate(Number(segment), Number.isInteger).pipe(Option.flatMap(index => Array.get(array, index)))), Match.when(Predicate.isObject, record => Record.get(record, segment)), Match.orElse(() => Option.none()));
/** Looks up a `root.foo.bar` path in a Model snapshot. On failure, returns the
 * deepest path reached and the keys available there. */
export const resolvePath = (root, path) => {
    if (!isRootAnchored(path)) {
        return PathResolution.NotFound({
            failedAt: '',
            reason: `Path must start with '${ROOT}'. Received: '${path}'.`,
            availableKeys: [],
        });
    }
    const initial = PathResolution.Found({
        value: root,
        atPath: ROOT,
    });
    return Array.reduce(segmentsOf(path), initial, (resolution, segment) => {
        if (resolution._tag === 'NotFound') {
            return resolution;
        }
        return Option.match(descend(resolution.value, segment), {
            onNone: () => PathResolution.NotFound({
                failedAt: resolution.atPath,
                reason: isExpandable(resolution.value)
                    ? `No '${segment}' at '${resolution.atPath}'.`
                    : `Cannot descend into a primitive at '${resolution.atPath}' (looking for '${segment}').`,
                availableKeys: keysOf(resolution.value),
            }),
            onSome: descended => PathResolution.Found({
                value: descended,
                atPath: `${resolution.atPath}${PATH_SEPARATOR}${segment}`,
            }),
        });
    });
};
// SUMMARIZE
const truncateString = (value) => value.length <= STRING_TRUNCATE
    ? value
    : {
        _summary: 'string',
        length: value.length,
        head: value.slice(0, STRING_TRUNCATE),
    };
const sampleArray = (items, depth) => {
    const sample = items.length <= ARRAY_SAMPLE
        ? items
        : [
            ...Array.take(items, ARRAY_SAMPLE - 1),
            ...Option.toArray(Array.last(items)),
        ];
    return Array.map(sample, item => summarizeAt(item, depth + 1));
};
const summarizeArray = (items, depth) => ({
    _summary: 'array',
    length: items.length,
    sample: sampleArray(items, depth),
});
const summarizeRecord = (value, depth) => {
    if (depth >= MAX_DEPTH) {
        return {
            _summary: 'record',
            keys: Record.keys(value),
        };
    }
    return Record.map(value, child => summarizeAt(child, depth + 1));
};
const summarizeAt = (value, depth) => Match.value(value).pipe(Match.when(Predicate.isString, truncateString), Match.when(globalThis.Array.isArray, items => summarizeArray(items, depth)), Match.when(Predicate.isObject, record => summarizeRecord(record, depth)), Match.orElse(Function.identity));
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
export const summarizeValue = (value) => summarizeAt(value, 0);
// FORMAT
const formatAvailableKeys = (keys) => OptionExt.when(Array.isReadonlyArrayNonEmpty(keys), `Available keys: ${keys.join(', ')}.`);
/** Formats a `NotFound` result for `ResponseError.reason`, including the keys
 * available where the lookup stopped. */
export const formatPathNotFound = (notFound) => Option.match(formatAvailableKeys(notFound.availableKeys), {
    onNone: () => notFound.reason,
    onSome: hint => `${notFound.reason} ${hint}`,
});
