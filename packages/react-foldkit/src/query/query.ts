import { Predicate } from "effect"
import * as AsyncData from "../asyncData"
import { defineField, type Field, type FieldConfig } from "./field"
import { Lifted, type ParentMessage, type ParentMessageValue } from "./internal"
import { defineKeyed, type Keyed, type KeyedConfig, type SyncFields } from "./keyed"

export type { Field, FieldConfig } from "./field"
export type { Keyed, KeyedConfig, SyncFields } from "./keyed"
export { Lifted }
export type { ParentMessage, ParentMessageValue }

type DefineConfig =
	| (FieldConfig<string, unknown, unknown, unknown, unknown, any> & { readonly args?: never; readonly toKey?: never })
	| KeyedConfig<string, unknown, unknown, unknown, unknown, any, any>

const isKeyedConfig = (
	config: DefineConfig
): config is KeyedConfig<string, unknown, unknown, unknown, unknown, any, any> =>
	Predicate.hasProperty(config, "args")

/** Defines a remote-data Submodel as {@link Field} or {@link Keyed}. */
export function define<Name extends string, A, AI, E, EI, R = never>(
	config: FieldConfig<Name, A, AI, E, EI, R> & { readonly args?: never; readonly toKey?: never }
): Field<
	Name,
	ReturnType<typeof defineField<Name, A, AI, E, EI, R>>["Model"],
	ReturnType<typeof defineField<Name, A, AI, E, EI, R>>["Message"],
	R
>
export function define<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends SyncFields,
	R = never,
>(
	config: KeyedConfig<Name, A, AI, E, EI, Fields, R>
): Keyed<
	Name,
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, R>>["Model"],
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, R>>["Message"],
	Fields,
	AsyncData.AsyncData<A, E>,
	R
>
export function define(config: DefineConfig): unknown {
	if (isKeyedConfig(config)) return defineKeyed(config)

	return defineField(config)
}
