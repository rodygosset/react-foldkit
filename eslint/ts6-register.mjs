// Side-by-side TypeScript 6 shim for @typescript-eslint/parser.
//
// The parser hard-crashes on TypeScript >= 7 (which ships no JS compiler API),
// while the workspace compiler is TypeScript 7 (required by @effect/tsgo).
// Preload this module with `--import` / `NODE_OPTIONS` before the parser loads:
// it seeds node's require cache so the parser's `require("typescript")`
// resolves to the `typescript6` alias install instead of the workspace TS 7.
//
// This only affects the current process (eslint / rule regression tests), where
// nothing else consumes the TypeScript API. Delete when typescript-eslint
// supports TS >= 7.1 (https://github.com/typescript-eslint/typescript-eslint/issues/10940).
import { createRequire } from "node:module"

const rootRequire = createRequire(import.meta.url)
const ts6 = rootRequire("typescript6")
const parserEntry = rootRequire.resolve("@typescript-eslint/parser")
const parserRequire = createRequire(parserEntry)
const tsEntryFromParser = parserRequire.resolve("typescript")
parserRequire.cache[tsEntryFromParser] = {
	id: tsEntryFromParser,
	filename: tsEntryFromParser,
	loaded: true,
	exports: ts6,
}
