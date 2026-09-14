import { Array, Context, Effect, HashMap, Option, Record, Schema } from "effect"
import type { Simplify } from "effect/Types"
import type * as HttpApi from "effect/unstable/httpapi/HttpApi"
import type * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint"
import type * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup"
import * as AsyncData from "../asyncData"
import { define, type Field, type Keyed } from "./index"

type FieldModel<A, AI, E, EI> = Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncDataEncoded<AI, EI>>

/**
 * A `Context.Service` whose value is `HttpApiClient.Client<Groups>` and whose
 * `api` is the `HttpApi` {@link fromHttpApi} reads for schemas and routes.
 *
 * @example
 * ```ts
 * interface BlogClient {}
 * const BlogClient = Query.HttpApiService<BlogClient>()("BlogClient", { api: BlogApi })
 * ```
 */
export interface HttpApiService<Self, Id extends string, Groups extends HttpApiGroup.Constraint>
	extends Context.Service<Self, HttpApiClient.Client<Groups, never, never>> {
	readonly api: HttpApi.HttpApi<string, Groups>
}

/**
 * Builds an {@link HttpApiService} tag that carries `api` for {@link fromHttpApi}.
 *
 * @example
 * ```ts
 * interface BlogClient {}
 * const BlogClient = Query.HttpApiService<BlogClient>()("BlogClient", { api: BlogApi })
 * ```
 */
export function HttpApiService<Self = never>() {
	return function <const Id extends string, ApiId extends string, Groups extends HttpApiGroup.Constraint>(
		id: Id,
		options: { readonly api: HttpApi.HttpApi<ApiId, Groups> }
	): HttpApiService<Self, Id, Groups> {
		const self = Context.Service<Self, HttpApiClient.Client<Groups, never, never>>()(id) as unknown as HttpApiService<
			Self,
			Id,
			Groups
		>
		Object.assign(self, { api: options.api })
		return self
	}
}

type EndpointFrom<
	Groups extends HttpApiGroup.Constraint,
	GroupId extends HttpApiGroup.Identifier<Groups>,
	EndpointId extends string,
	Group extends HttpApiGroup.Constraint = HttpApiGroup.WithIdentifier<Groups, GroupId>,
	Endpoint extends HttpApiEndpoint.Constraint = HttpApiEndpoint.WithIdentifier<
		HttpApiGroup.Endpoints<Group>,
		EndpointId
	>,
> = Endpoint

type ClientRequestOf<Endpoint> = Endpoint extends HttpApiEndpoint.ConstraintRequest
	? Simplify<
			HttpApiEndpoint.ClientRequest<
				Endpoint["~Params"],
				Endpoint["~Query"],
				Endpoint["~Payload"],
				Endpoint["~Headers"],
				"decoded-only"
			>
		>
	: never

type RequestBody<Request> = Omit<Extract<Request, object>, "responseMode">

type EndpointSuccess<Endpoint> = Endpoint extends { readonly "~Success": infer S extends Schema.Constraint }
	? S["Type"]
	: unknown
type EndpointSuccessEncoded<Endpoint> = Endpoint extends { readonly "~Success": infer S extends Schema.Constraint }
	? S["Encoded"]
	: unknown
type EndpointError<Endpoint> = HttpApiEndpoint.Errors<Endpoint>
type EndpointErrorEncoded<Endpoint> = Endpoint extends { readonly "~Error": infer S extends Schema.Constraint }
	? S["Encoded"]
	: unknown

type IsFieldRequest<Request> = [RequestBody<Request>] extends [never]
	? true
	: [keyof RequestBody<Request>] extends [never]
		? true
		: false

type EndpointIdOf<
	Groups extends HttpApiGroup.Constraint,
	GroupId extends HttpApiGroup.Identifier<Groups>,
> = HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<HttpApiGroup.WithIdentifier<Groups, GroupId>>>

type FromHttpApiBase<Name extends string, GroupId extends string, EndpointId extends string> = Readonly<{
	name: Name
	group: GroupId
	endpoint: EndpointId
}>

type InferredKeyed<
	Name extends string,
	Groups extends HttpApiGroup.Constraint,
	GroupId extends HttpApiGroup.Identifier<Groups>,
	EndpointId extends EndpointIdOf<Groups, GroupId>,
	Client,
	Endpoint = EndpointFrom<Groups, GroupId, EndpointId>,
	Request extends RequestBody<ClientRequestOf<Endpoint>> = RequestBody<ClientRequestOf<Endpoint>>,
> = Keyed<
	Name,
	Schema.Codec<
		HashMapModel<Request, EndpointSuccess<Endpoint>, EndpointError<Endpoint>>,
		unknown,
		never,
		never
	>,
	Schema.Top,
	Schema.Struct.Fields,
	string,
	AsyncData.AsyncData<EndpointSuccess<Endpoint>, EndpointError<Endpoint>>,
	Client
>

type HashMapModel<Args, A, E> = HashMap.HashMap<
	string,
	{
		readonly args: Args
		readonly data: AsyncData.AsyncData<A, E>
	}
>

type FlattenedKeyed<
	Name extends string,
	Groups extends HttpApiGroup.Constraint,
	GroupId extends HttpApiGroup.Identifier<Groups>,
	EndpointId extends EndpointIdOf<Groups, GroupId>,
	Fields extends Schema.Struct.Fields,
	KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	Client,
	Endpoint = EndpointFrom<Groups, GroupId, EndpointId>,
> = Keyed<
	Name,
	Schema.Codec<
		HashMapModel<
			Schema.Schema.Type<Schema.Struct<Fields>>,
			EndpointSuccess<Endpoint>,
			EndpointError<Endpoint>
		>,
		unknown,
		never,
		never
	>,
	Schema.Top,
	Fields,
	KeyField,
	AsyncData.AsyncData<EndpointSuccess<Endpoint>, EndpointError<Endpoint>>,
	Client
>

export interface FromHttpApi<Client, Groups extends HttpApiGroup.Constraint> {
	<
		Name extends string,
		const GroupId extends HttpApiGroup.Identifier<Groups>,
		const EndpointId extends EndpointIdOf<Groups, GroupId>,
	>(
		config: FromHttpApiBase<Name, GroupId, EndpointId> & {
			readonly args?: never
			readonly toRequest?: never
			readonly keyFields?: Array.NonEmptyReadonlyArray<string>
			readonly toKey?: (args: unknown) => string
		}
	): IsFieldRequest<ClientRequestOf<EndpointFrom<Groups, GroupId, EndpointId>>> extends true
		? Field<
				Name,
				FieldModel<
					EndpointSuccess<EndpointFrom<Groups, GroupId, EndpointId>>,
					EndpointSuccessEncoded<EndpointFrom<Groups, GroupId, EndpointId>>,
					EndpointError<EndpointFrom<Groups, GroupId, EndpointId>>,
					EndpointErrorEncoded<EndpointFrom<Groups, GroupId, EndpointId>>
				>,
				Schema.Top,
				Client
			>
		: InferredKeyed<Name, Groups, GroupId, EndpointId, Client>
	<
		Name extends string,
		const GroupId extends HttpApiGroup.Identifier<Groups>,
		const EndpointId extends EndpointIdOf<Groups, GroupId>,
		Fields extends Schema.Struct.Fields,
		KeyField extends keyof Schema.Schema.Type<Schema.Struct<Fields>> & string,
	>(
		config: FromHttpApiBase<Name, GroupId, EndpointId> & {
			readonly args: Fields
			readonly toRequest: (
				args: Schema.Schema.Type<Schema.Struct<Fields>>
			) => ClientRequestOf<EndpointFrom<Groups, GroupId, EndpointId>>
			readonly keyFields?: Array.NonEmptyReadonlyArray<KeyField>
			readonly toKey?: (args: Pick<Schema.Schema.Type<Schema.Struct<Fields>>, KeyField>) => string
		}
	): FlattenedKeyed<Name, Groups, GroupId, EndpointId, Fields, KeyField, Client>
}

/**
 * `HttpApiEndpoint.getSuccessSchemas` / `getErrorSchemas` / `getPayloadSchemas`
 * exist at runtime and are used by AtomHttpApi. They are `@internal`, so they
 * are omitted from Effect's public `.d.ts`.
 */
type EndpointSchemaFns = {
	readonly getSuccessSchemas: (
		endpoint: HttpApiEndpoint.Top
	) => readonly [Schema.Top, ...ReadonlyArray<Schema.Top>]
	readonly getErrorSchemas: (endpoint: HttpApiEndpoint.Top) => ReadonlyArray<Schema.Top>
	readonly getPayloadSchemas: (endpoint: HttpApiEndpoint.Top) => ReadonlyArray<Schema.Top>
}

const endpointSchemas: EndpointSchemaFns = HttpApiEndpoint as unknown as EndpointSchemaFns

function successCodec(endpoint: HttpApiEndpoint.Top): Schema.Top {
	return Schema.Union(endpointSchemas.getSuccessSchemas(endpoint))
}

function errorCodec(endpoint: HttpApiEndpoint.Top): Schema.Top {
	const schemas = endpointSchemas.getErrorSchemas(endpoint)
	if (schemas.length === 0) return Schema.Never
	return Schema.Union(schemas as Array.NonEmptyReadonlyArray<Schema.Top>)
}

function payloadCodec(endpoint: HttpApiEndpoint.Top): Schema.Top | undefined {
	const schemas = endpointSchemas.getPayloadSchemas(endpoint)
	if (schemas.length === 0) return undefined
	return Schema.Union(schemas as Array.NonEmptyReadonlyArray<Schema.Top>)
}

function clientRequestFields(endpoint: HttpApiEndpoint.Top): Schema.Struct.Fields | undefined {
	const fields: globalThis.Record<string, Schema.Top> = {}
	if (endpoint.params !== undefined) fields.params = endpoint.params
	if (endpoint.query !== undefined) fields.query = endpoint.query
	if (endpoint.headers !== undefined) fields.headers = endpoint.headers
	const payload = payloadCodec(endpoint)
	if (payload !== undefined) fields.payload = payload
	if (Record.isEmptyRecord(fields)) return undefined
	return fields
}

function requireEndpoint(api: { readonly groups: globalThis.Record<string, unknown> }, group: string, endpoint: string) {
	const groupValue = Record.get(api.groups, group) as Option.Option<{
		readonly endpoints: globalThis.Record<string, HttpApiEndpoint.Top>
	}>
	if (Option.isNone(groupValue)) {
		throw new Error(`Query.fromHttpApi: unknown group "${group}"`)
	}
	const endpointValue = Record.get(groupValue.value.endpoints, endpoint)
	if (Option.isNone(endpointValue)) {
		throw new Error(`Query.fromHttpApi: unknown endpoint "${group}.${endpoint}"`)
	}
	return endpointValue.value
}

function clientRequestToKey(args: unknown): string {
	return globalThis.JSON.stringify(args)
}

type EndpointFn = (request: unknown) => Effect.Effect<unknown, unknown>

function callEndpoint<Self, Groups extends HttpApiGroup.Constraint>(
	tag: Context.Service<Self, HttpApiClient.Client<Groups, never, never>>,
	group: string,
	endpoint: string,
	request: unknown
): Effect.Effect<unknown, unknown, Self> {
	return Effect.gen(function* () {
		const apiClient = yield* tag
		const groups = apiClient as globalThis.Record<string, globalThis.Record<string, EndpointFn>>
		const groupClient = groups[group]
		const method = groupClient === undefined ? undefined : groupClient[endpoint]
		if (method === undefined) {
			throw new Error(`Query.fromHttpApi: missing client method "${group}.${endpoint}"`)
		}
		return yield* method(request)
	})
}

type ApiGroups<Client> = Client extends { readonly api: HttpApi.HttpApi<infer _ApiId, infer Groups> }
	? Groups extends HttpApiGroup.Constraint
		? Groups
		: never
	: never

type FromHttpApiConfig = {
	readonly name: string
	readonly group: string
	readonly endpoint: string
	readonly args?: Schema.Struct.Fields
	readonly toRequest?: (args: unknown) => unknown
	readonly keyFields?: Array.NonEmptyReadonlyArray<string>
	readonly toKey?: (args: unknown) => string
}

/**
 * Turns an HttpApi group/endpoint into a Query Field or Keyed Submodel.
 *
 * Empty client request (no params, query, payload, or headers) is a Field.
 * Anything else is Keyed. Default `toRequest` is identity on the client request.
 *
 * @example
 * ```ts
 * const fromBlog = Query.fromHttpApi(BlogClient)
 * const postsQuery = fromBlog({ name: "Posts", group: "blog", endpoint: "listPosts" })
 * const postQuery = fromBlog({ name: "Post", group: "blog", endpoint: "getPost" })
 * // watch: postQuery.watch({ params: { postId } })
 * ```
 */
export function fromHttpApi<Client extends HttpApiService<any, any, any>>(
	client: Client
): FromHttpApi<Client, ApiGroups<Client>> {
	function fromConfig(config: FromHttpApiConfig) {
		const endpoint = requireEndpoint(
			client.api as { readonly groups: globalThis.Record<string, unknown> },
			config.group,
			config.endpoint
		)
		const data = successCodec(endpoint) as Schema.Codec<any, any, never, never>
		const error = errorCodec(endpoint) as Schema.Codec<any, any, never, never>
		const execute = function (request: unknown) {
			return callEndpoint(client, config.group, config.endpoint, request)
		}

		if (config.args !== undefined) {
			const toRequest = config.toRequest as (args: unknown) => unknown
			const toKey = config.toKey
			return define({
				name: config.name,
				data,
				error,
				args: config.args,
				keyFields: config.keyFields,
				toKey:
					toKey === undefined
						? undefined
						: function (args: { readonly [x: string]: unknown }) {
								return toKey(args)
							},
				execute: function (args: { readonly [x: string]: unknown }) {
					return execute(toRequest(args))
				},
			})
		}

		const inferred = clientRequestFields(endpoint)
		if (inferred === undefined) {
			return define({
				name: config.name,
				data,
				error,
				execute: execute({}),
			})
		}

		const toKey = config.toKey ?? clientRequestToKey
		return define({
			name: config.name,
			data,
			error,
			args: inferred,
			keyFields: config.keyFields,
			toKey: function (args: { readonly [x: string]: unknown }) {
				return toKey(args)
			},
			execute,
		})
	}

	return fromConfig as unknown as FromHttpApi<Client, ApiGroups<Client>>
}
