/**
 * Vendored Foldkit interrupt registry (source under `repos/foldkit`).
 * Foldkit is an implementation detail — apps import `@rodygosset/react-foldkit/*` only.
 * Relative paths bypass Foldkit's `dist` package exports (no Foldkit build required).
 */
export {
	__CurrentRegistry as CurrentInterruptRegistry,
	__makeRegistry as makeInterruptRegistry,
	type __Registry as InterruptRegistry,
} from "../../../../repos/foldkit/packages/foldkit/src/command/interruptible/index.js"
