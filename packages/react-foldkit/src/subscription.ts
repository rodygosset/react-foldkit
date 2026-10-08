/**
 * Model-gated subscriptions (Foldkit vocabulary).
 * Apps use `react-foldkit/subscription` for this curated subscription surface.
 * Query APIs remain available directly from `foldkit/experimental/query`.
 *
 * v1 surface: `make` / `entry` (via `make`) only. Foldkit helpers such as
 * `persistent`, `aggregate`, `lift`, and `fromEvent` are intentionally omitted
 * until something in-tree needs them — reexport from Foldkit's public barrel
 * then, rather than growing ad-hoc wrappers here.
 */
import { make } from "foldkit/subscription"

export { make }
export type { EntryWithoutKeepAlive, Subscription, Subscriptions } from "foldkit/subscription"

/** The `entry` callback Foldkit passes into {@link make}. */
export type EntryBuilder<Model, Message, Services = never> = Parameters<
	Parameters<ReturnType<typeof make<Model, Message, Services>>>[0]
>[0]
