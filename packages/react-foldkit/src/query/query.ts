import { Predicate, Schema } from "effect"
import * as AsyncData from "../asyncData"
import { defineField, type Field, type FieldConfig } from "./field"
import { type ParentMessage, type ParentMessageValue, Lifted } from "./internal"
import { defineKeyed, type Keyed, type KeyedConfig } from "./keyed"

export type { Field, FieldConfig } from "./field"
export type { Keyed, KeyedConfig } from "./keyed"
export type { ParentMessage, ParentMessageValue }
export { Lifted }

type DefineConfig =
	| (FieldConfig<string, unknown, unknown, unknown, unknown, any> & { readonly args?: never; readonly toKey?: never })
	| KeyedConfig<string, unknown, unknown, unknown, unknown, any, any, any>

const isKeyedConfig = (
	config: DefineConfig
): config is KeyedConfig<string, unknown, unknown, unknown, unknown, any, any, any> =>
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
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R = never,
>(
	config: KeyedConfig<Name, A, AI, E, EI, Fields, KeyField, R>
): Keyed<
	Name,
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Model"],
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Message"],
	Fields,
	KeyField,
	AsyncData.AsyncData<A, E>,
	R
>
export function define(config: DefineConfig): unknown {
	if (isKeyedConfig(config)) return defineKeyed(config)

	return defineField(config)
}

export type DefinedField<Name extends string, A, AI, E, EI, R = never> = Field<
	Name,
	ReturnType<typeof defineField<Name, A, AI, E, EI, R>>["Model"],
	ReturnType<typeof defineField<Name, A, AI, E, EI, R>>["Message"],
	R
>

export type DefinedKeyed<
	Name extends string,
	A,
	AI,
	E,
	EI,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	R = never,
> = Keyed<
	Name,
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Model"],
	ReturnType<typeof defineKeyed<Name, A, AI, E, EI, Fields, KeyField, R>>["Message"],
	Fields,
	KeyField,
	AsyncData.AsyncData<A, E>,
	R
>
