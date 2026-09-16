import { Predicate } from "effect"
import { Lifted, type ParentMessage, type ParentMessageValue } from "./internal"
import { defineKeyedQuery, type KeyedQuery, type KeyedQueryConfig, type SyncFields } from "./keyedQuery"
import { defineQuery, type Query, type QueryConfig } from "./query"

export type { KeyedQuery, KeyedQueryConfig, KeyedQueryMessage, KeyedQueryModel, SyncFields } from "./keyedQuery"
export type { Query, QueryConfig, QueryMessage, QueryModel } from "./query"
export { Lifted }
export type { ParentMessage, ParentMessageValue }

type DefineConfig =
	| (QueryConfig<string, unknown, unknown, unknown, unknown, any> & { readonly args?: never; readonly toKey?: never })
	| KeyedQueryConfig<string, unknown, unknown, unknown, unknown, SyncFields, any>

const isKeyedQueryConfig = (
	config: DefineConfig
): config is KeyedQueryConfig<string, unknown, unknown, unknown, unknown, SyncFields, any> =>
	Predicate.hasProperty(config, "args")

/** Defines a remote-data Submodel as {@link Query} or {@link KeyedQuery}. */
export function define<Name extends string, A, AI, E, EI, R = never>(
	config: QueryConfig<Name, A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
): Query<Name, A, AI, E, EI, R>
export function define<Name extends string, A, AI, E, EI, Fields extends SyncFields, R = never>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R>
): KeyedQuery<Name, A, AI, E, EI, Fields, R>
export function define(config: DefineConfig): unknown {
	if (isKeyedQueryConfig(config)) return defineKeyedQuery(config)

	return defineQuery(config)
}
