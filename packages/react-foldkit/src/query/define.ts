import { Predicate } from "effect"
import * as AsyncData from "../asyncData"
import { Lifted, type ParentMessage, type ParentMessageValue } from "./internal"
import { defineKeyedQuery, type KeyedQuery, type KeyedQueryConfig, type SyncFields } from "./keyedQuery"
import { defineQuery, type Query, type QueryConfig } from "./query"

export type { KeyedQuery, KeyedQueryConfig, SyncFields } from "./keyedQuery"
export type { Query, QueryConfig } from "./query"
export { Lifted }
export type { ParentMessage, ParentMessageValue }

type DefineConfig =
	| (QueryConfig<string, unknown, unknown, unknown, unknown, any> & { readonly args?: never; readonly toKey?: never })
	| KeyedQueryConfig<string, unknown, unknown, unknown, unknown, any, any>

const isKeyedQueryConfig = (
	config: DefineConfig
): config is KeyedQueryConfig<string, unknown, unknown, unknown, unknown, any, any> =>
	Predicate.hasProperty(config, "args")

/** Defines a remote-data Submodel as {@link Query} or {@link KeyedQuery}. */
export function define<Name extends string, A, AI, E, EI, R = never>(
	config: QueryConfig<Name, A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
): Query<
	Name,
	ReturnType<typeof defineQuery<Name, A, AI, E, EI, R>>["Model"],
	ReturnType<typeof defineQuery<Name, A, AI, E, EI, R>>["Message"],
	R
>
export function define<Name extends string, A, AI, E, EI, Fields extends SyncFields, R = never>(
	config: KeyedQueryConfig<Name, A, AI, E, EI, Fields, R>
): KeyedQuery<
	Name,
	ReturnType<typeof defineKeyedQuery<Name, A, AI, E, EI, Fields, R>>["Model"],
	ReturnType<typeof defineKeyedQuery<Name, A, AI, E, EI, Fields, R>>["Message"],
	Fields,
	AsyncData.AsyncData<A, E>,
	R
>
export function define(config: DefineConfig): unknown {
	if (isKeyedQueryConfig(config)) return defineKeyedQuery(config)

	return defineQuery(config)
}
