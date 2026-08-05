/**
 * Model-gated subscriptions (Foldkit vocabulary).
 * Apps import `@rodygosset/react-foldkit/subscription` — never `foldkit`.
 *
 * v1 surface: `make` / `entry` (via `make`) only. Foldkit helpers such as
 * `persistent`, `aggregate`, `lift`, and `fromEvent` are intentionally omitted
 * until something in-tree needs them — reexport from Foldkit's public barrel
 * then, rather than growing ad-hoc wrappers here.
 */
export { make } from "../../../repos/foldkit/packages/foldkit/src/subscription/subscription.js"
export type {
	EntryWithoutKeepAlive,
	Subscription,
	Subscriptions,
} from "../../../repos/foldkit/packages/foldkit/src/subscription/subscription.js"
