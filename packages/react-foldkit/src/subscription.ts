import { make } from "foldkit/subscription"

export { make }
export type { EntryWithoutKeepAlive, Subscription, Subscriptions } from "foldkit/subscription"

/**
 * Callback type supplied by `Subscription.make` for defining named entries. Use it when
 * extracting a typed helper that builds Subscription entries.
 *
 * @see {@link make} for declaring a Subscriptions record
 * @category utility types
 * @since 0.1.0
 */
export type EntryBuilder<Model, Message, Services = never> = Parameters<
	Parameters<ReturnType<typeof make<Model, Message, Services>>>[0]
>[0]
