# Declaration snapshot

Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.

## dist/asyncData.implementation.d.ts

```ts
import { AsyncData, AsyncDataEncoded, AsyncDataSchema, Failure, Idle, Loading, Refreshing, Schema, Stale, Success, all, fail, flatMap, fromOptionOrIdle, getData, getError, getOrElse, hasData, hasError, isAsyncData, isFailure, isIdle, isLoading, isPending, isRefreshing, isStale, isSuccess, loadIfMissing, map, mapBoth, mapError, match, matchData, matchDataSplitEmpty, orElse, revalidate, revalidateOrLoad, settle, succeed, zipWith } from 'foldkit/asyncData';
declare const asyncData_AsyncData: typeof AsyncData;
declare const asyncData_AsyncDataEncoded: typeof AsyncDataEncoded;
declare const asyncData_AsyncDataSchema: typeof AsyncDataSchema;
declare const asyncData_Failure: typeof Failure;
declare const asyncData_Idle: typeof Idle;
declare const asyncData_Loading: typeof Loading;
declare const asyncData_Refreshing: typeof Refreshing;
declare const asyncData_Schema: typeof Schema;
declare const asyncData_Stale: typeof Stale;
declare const asyncData_Success: typeof Success;
declare const asyncData_all: typeof all;
declare const asyncData_fail: typeof fail;
declare const asyncData_flatMap: typeof flatMap;
declare const asyncData_fromOptionOrIdle: typeof fromOptionOrIdle;
declare const asyncData_getData: typeof getData;
declare const asyncData_getError: typeof getError;
declare const asyncData_getOrElse: typeof getOrElse;
declare const asyncData_hasData: typeof hasData;
declare const asyncData_hasError: typeof hasError;
declare const asyncData_isAsyncData: typeof isAsyncData;
declare const asyncData_isFailure: typeof isFailure;
declare const asyncData_isIdle: typeof isIdle;
declare const asyncData_isLoading: typeof isLoading;
declare const asyncData_isPending: typeof isPending;
declare const asyncData_isRefreshing: typeof isRefreshing;
declare const asyncData_isStale: typeof isStale;
declare const asyncData_isSuccess: typeof isSuccess;
declare const asyncData_loadIfMissing: typeof loadIfMissing;
declare const asyncData_map: typeof map;
declare const asyncData_mapBoth: typeof mapBoth;
declare const asyncData_mapError: typeof mapError;
declare const asyncData_match: typeof match;
declare const asyncData_matchData: typeof matchData;
declare const asyncData_matchDataSplitEmpty: typeof matchDataSplitEmpty;
declare const asyncData_orElse: typeof orElse;
declare const asyncData_revalidate: typeof revalidate;
declare const asyncData_revalidateOrLoad: typeof revalidateOrLoad;
declare const asyncData_settle: typeof settle;
declare const asyncData_succeed: typeof succeed;
declare const asyncData_zipWith: typeof zipWith;
declare namespace asyncData {
  export { asyncData_AsyncData as AsyncData, asyncData_AsyncDataEncoded as AsyncDataEncoded, asyncData_AsyncDataSchema as AsyncDataSchema, asyncData_Failure as Failure, asyncData_Idle as Idle, asyncData_Loading as Loading, asyncData_Refreshing as Refreshing, asyncData_Schema as Schema, asyncData_Stale as Stale, asyncData_Success as Success, asyncData_all as all, asyncData_fail as fail, asyncData_flatMap as flatMap, asyncData_fromOptionOrIdle as fromOptionOrIdle, asyncData_getData as getData, asyncData_getError as getError, asyncData_getOrElse as getOrElse, asyncData_hasData as hasData, asyncData_hasError as hasError, asyncData_isAsyncData as isAsyncData, asyncData_isFailure as isFailure, asyncData_isIdle as isIdle, asyncData_isLoading as isLoading, asyncData_isPending as isPending, asyncData_isRefreshing as isRefreshing, asyncData_isStale as isStale, asyncData_isSuccess as isSuccess, asyncData_loadIfMissing as loadIfMissing, asyncData_map as map, asyncData_mapBoth as mapBoth, asyncData_mapError as mapError, asyncData_match as match, asyncData_matchData as matchData, asyncData_matchDataSplitEmpty as matchDataSplitEmpty, asyncData_orElse as orElse, asyncData_revalidate as revalidate, asyncData_revalidateOrLoad as revalidateOrLoad, asyncData_settle as settle, asyncData_succeed as succeed, asyncData_zipWith as zipWith };
}
export { asyncData as a };
```

## dist/asyncData.d.ts

```ts
export { AsyncData, AsyncDataEncoded, AsyncDataSchema, Failure, Idle, Loading, Refreshing, Schema, Stale, Success, all, fail, flatMap, fromOptionOrIdle, getData, getError, getOrElse, hasData, hasError, isAsyncData, isFailure, isIdle, isLoading, isPending, isRefreshing, isStale, isSuccess, loadIfMissing, map, mapBoth, mapError, match, matchData, matchDataSplitEmpty, orElse, revalidate, revalidateOrLoad, settle, succeed, zipWith } from 'foldkit/asyncData';
```

## dist/command.implementation.d.ts

```ts
import { Command, CommandDefinition, CommandDefinitionNoArgs, CommandDefinitionTypeId, CommandDefinitionWithArgs, InterruptOption, Interruptible, define, mapEffect, mapMessage, mapMessages } from 'foldkit/command';
declare const command_Command: typeof Command;
declare const command_CommandDefinition: typeof CommandDefinition;
declare const command_CommandDefinitionNoArgs: typeof CommandDefinitionNoArgs;
declare const command_CommandDefinitionTypeId: typeof CommandDefinitionTypeId;
declare const command_CommandDefinitionWithArgs: typeof CommandDefinitionWithArgs;
declare const command_InterruptOption: typeof InterruptOption;
declare const command_Interruptible: typeof Interruptible;
declare const command_define: typeof define;
declare const command_mapEffect: typeof mapEffect;
declare const command_mapMessage: typeof mapMessage;
declare const command_mapMessages: typeof mapMessages;
declare namespace command {
  export { command_Command as Command, command_CommandDefinition as CommandDefinition, command_CommandDefinitionNoArgs as CommandDefinitionNoArgs, command_CommandDefinitionTypeId as CommandDefinitionTypeId, command_CommandDefinitionWithArgs as CommandDefinitionWithArgs, command_InterruptOption as InterruptOption, command_Interruptible as Interruptible, command_define as define, command_mapEffect as mapEffect, command_mapMessage as mapMessage, command_mapMessages as mapMessages };
}
export { command as c };
```

## dist/command.d.ts

```ts
export { Command, CommandDefinition, CommandDefinitionNoArgs, CommandDefinitionTypeId, CommandDefinitionWithArgs, InterruptOption, Interruptible, define, mapEffect, mapMessage, mapMessages } from 'foldkit/command';
```

## dist/commitSource.d.ts

```ts
import * as effect_Cause from 'effect/Cause';
import { Result, Schema } from 'effect';
interface CommitEntry<Message> {
  readonly key: string;
  readonly version: string | number;
  readonly message: Message;
}
interface CommitSource<Message, E = never> {
  readonly getSnapshot: () => Result.Result<ReadonlyArray<CommitEntry<Message>>, E>;
  readonly subscribe: (notify: () => void) => () => void;
}
declare const CommitSourceError_base: Schema.Class<CommitSourceError, Schema.Struct<{
  readonly _tag: Schema.tag<"CommitSourceError">;
  readonly details: Schema.Union<readonly [Schema.Struct<{
    readonly reason: Schema.Literal<"DuplicateKey">;
    readonly key: Schema.String;
  }>, Schema.Struct<{
    readonly reason: Schema.Literal<"Reentrant">;
  }>]>;
}>, effect_Cause.YieldableError>;
declare class CommitSourceError extends CommitSourceError_base {
  get message(): string;
}
export { type CommitEntry, type CommitSource, CommitSourceError };
```

## dist/index.d.ts

```ts
export { a as AsyncData } from './asyncData.implementation.js';
export { c as Command } from './command.implementation.js';
import { CommitEntry, CommitSource, CommitSourceError } from './commitSource.js';
import { Config, Declaration, Delivery, Envelope, FromKeyedQueryOptions, FromQueryOptions, KeyedQueryLoader, LoadPayload, Loader, QueryLoader, Receipt, SettleQueryIfOptions, define, fromQuery, load, loadQuery, mapMessages, settleQueryIf } from './loader.js';
export { m as Message } from './message.implementation.js';
import { A as Application, C as Config$1, E as ErrorOptions, M as ModelHooks, P as ProviderProps, S as SourceOptions, d as defineApplication, L as Lift, O as OptionalLift, l as lift } from './public.implementation.js';
import { CommitError, Config as Config$2, Crashed, Disposed, Program, Store, StoreTypeId, boot, commit, make, takeWhen } from './store.js';
import { ProviderError, Submodel, define as define$1 } from './submodel.js';
export { s as Struct } from './struct.implementation.js';
export { s as Subscription } from './subscription.implementation.js';
export { u as Update } from './update.implementation.js';
export { s as Schema } from './schema.implementation.js';
import { ModelReader, ModelSource } from './modelSource.js';
import 'foldkit/asyncData';
import 'foldkit/command';
import 'effect/Cause';
import 'effect';
import 'foldkit/experimental/query';
import 'foldkit/update';
import 'foldkit/message';
import 'react';
import 'foldkit/subscription';
import 'foldkit/struct';
import 'foldkit/schema';
declare const commitSource_CommitEntry: typeof CommitEntry;
declare const commitSource_CommitSource: typeof CommitSource;
declare const commitSource_CommitSourceError: typeof CommitSourceError;
declare namespace commitSource {
  export { commitSource_CommitEntry as CommitEntry, commitSource_CommitSource as CommitSource, commitSource_CommitSourceError as CommitSourceError };
}
declare const loader_Config: typeof Config;
declare const loader_Declaration: typeof Declaration;
declare const loader_Delivery: typeof Delivery;
declare const loader_Envelope: typeof Envelope;
declare const loader_FromKeyedQueryOptions: typeof FromKeyedQueryOptions;
declare const loader_FromQueryOptions: typeof FromQueryOptions;
declare const loader_KeyedQueryLoader: typeof KeyedQueryLoader;
declare const loader_LoadPayload: typeof LoadPayload;
declare const loader_Loader: typeof Loader;
declare const loader_QueryLoader: typeof QueryLoader;
declare const loader_Receipt: typeof Receipt;
declare const loader_SettleQueryIfOptions: typeof SettleQueryIfOptions;
declare const loader_define: typeof define;
declare const loader_fromQuery: typeof fromQuery;
declare const loader_load: typeof load;
declare const loader_loadQuery: typeof loadQuery;
declare const loader_mapMessages: typeof mapMessages;
declare const loader_settleQueryIf: typeof settleQueryIf;
declare namespace loader {
  export { loader_Config as Config, loader_Declaration as Declaration, loader_Delivery as Delivery, loader_Envelope as Envelope, loader_FromKeyedQueryOptions as FromKeyedQueryOptions, loader_FromQueryOptions as FromQueryOptions, loader_KeyedQueryLoader as KeyedQueryLoader, loader_LoadPayload as LoadPayload, loader_Loader as Loader, loader_QueryLoader as QueryLoader, loader_Receipt as Receipt, loader_SettleQueryIfOptions as SettleQueryIfOptions, loader_define as define, loader_fromQuery as fromQuery, loader_load as load, loader_loadQuery as loadQuery, loader_mapMessages as mapMessages, loader_settleQueryIf as settleQueryIf };
}
declare const modelSource_ModelReader: typeof ModelReader;
declare const modelSource_ModelSource: typeof ModelSource;
declare namespace modelSource {
  export { modelSource_ModelReader as ModelReader, modelSource_ModelSource as ModelSource };
}
declare const react_Application: typeof Application;
declare const react_CommitEntry: typeof CommitEntry;
declare const react_CommitSource: typeof CommitSource;
declare const react_CommitSourceError: typeof CommitSourceError;
declare const react_ErrorOptions: typeof ErrorOptions;
declare const react_ModelHooks: typeof ModelHooks;
declare const react_ProviderProps: typeof ProviderProps;
declare const react_SourceOptions: typeof SourceOptions;
declare const react_defineApplication: typeof defineApplication;
declare namespace react {
  export { react_Application as Application, react_CommitEntry as CommitEntry, react_CommitSource as CommitSource, react_CommitSourceError as CommitSourceError, Config$1 as Config, react_ErrorOptions as ErrorOptions, react_ModelHooks as ModelHooks, react_ProviderProps as ProviderProps, react_SourceOptions as SourceOptions, react_defineApplication as defineApplication };
}
declare const store_CommitError: typeof CommitError;
declare const store_Crashed: typeof Crashed;
declare const store_Disposed: typeof Disposed;
declare const store_Program: typeof Program;
declare const store_Store: typeof Store;
declare const store_StoreTypeId: typeof StoreTypeId;
declare const store_boot: typeof boot;
declare const store_commit: typeof commit;
declare const store_make: typeof make;
declare const store_takeWhen: typeof takeWhen;
declare namespace store {
  export { store_CommitError as CommitError, Config$2 as Config, store_Crashed as Crashed, store_Disposed as Disposed, store_Program as Program, store_Store as Store, store_StoreTypeId as StoreTypeId, store_boot as boot, store_commit as commit, store_make as make, store_takeWhen as takeWhen };
}
declare const submodel_Lift: typeof Lift;
declare const submodel_OptionalLift: typeof OptionalLift;
declare const submodel_ProviderError: typeof ProviderError;
declare const submodel_Submodel: typeof Submodel;
declare const submodel_lift: typeof lift;
declare namespace submodel {
  export { submodel_Lift as Lift, submodel_OptionalLift as OptionalLift, submodel_ProviderError as ProviderError, submodel_Submodel as Submodel, define$1 as define, submodel_lift as lift };
}
export { commitSource as CommitSource, loader as Loader, modelSource as ModelSource, react as ReactFoldkit, store as Store, submodel as Submodel };
```

## dist/loader.d.ts

```ts
import { Schema, Pipeable, Result, Effect } from 'effect';
import * as AsyncData from 'foldkit/asyncData';
import { KeyedQuery, Query } from 'foldkit/experimental/query';
import { Return } from 'foldkit/update';
declare const Receipt: Schema.Struct<{
  readonly name: Schema.String;
  readonly key: Schema.String;
  readonly version: Schema.String;
}>;
type Receipt = typeof Receipt.Type;
declare const Envelope: <S extends Schema.Codec<unknown, unknown>>(schema: S) => Schema.Struct<{
  readonly payload: S;
  readonly _tag: Schema.tag<"react-foldkit/Loader">;
  readonly name: Schema.String;
  readonly key: Schema.String;
  readonly version: Schema.String;
  readonly format: Schema.Literal<1>;
}>;
type Envelope<I = unknown> = ReturnType<typeof Envelope<Schema.Codec<unknown, I>>>["Encoded"];
type SyncFields = {
  readonly [x: PropertyKey]: Schema.Codec<unknown, unknown, never, never>;
};
type KeyedArgs<Fields extends SyncFields> = Schema.Schema.Type<Schema.Struct<Fields>>;
interface Delivery<out Message> {
  readonly receipt: Receipt;
  readonly message: Message;
}
interface Declaration<out Message> extends Pipeable.Pipeable {
  readonly name: string;
  readonly decodeDelivery: (envelope: unknown) => Result.Result<Delivery<Message>, Schema.SchemaError>;
  readonly decode: (envelope: unknown) => Result.Result<Message, Schema.SchemaError>;
}
interface Loader<A, I, out Message = A> extends Declaration<Message> {
  readonly data: Schema.Codec<A, I>;
  readonly key: (data: A) => string;
  readonly load: <E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>;
}
interface Config<A, I> {
  readonly name: string;
  readonly data: Schema.Codec<A, I>;
  readonly key: (data: NoInfer<A>) => string;
}
declare const define: <A, I>(config: Config<A, I>) => Loader<A, Schema.Json>;
type LoadPayload<Args, A, E> = {
  readonly args: Args;
  readonly result: AsyncData.AsyncData<A, E>;
};
type KeyedLoadType<Fields extends SyncFields, A, E> = LoadPayload<KeyedArgs<Fields>, A, E>;
type LoadType<A, E> = {
  readonly result: AsyncData.AsyncData<A, E>;
};
type WithLoadSchema<A, I, LoadSchema extends Schema.Top> = Loader<A, I> & {
  readonly Load: LoadSchema;
};
interface KeyedQueryLoader<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, LoadSchema extends Schema.Top, Interrupt extends boolean = boolean> extends WithLoadSchema<KeyedLoadType<Fields, A, E>, Schema.Json, LoadSchema> {
  readonly query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>;
  readonly loadQuery: (args: KeyedArgs<Fields>) => Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>;
}
interface QueryLoader<Name extends string, A, AI, E, EI, R, LoadSchema extends Schema.Top, Interrupt extends boolean = boolean> extends WithLoadSchema<LoadType<A, E>, Schema.Json, LoadSchema> {
  readonly query: Query<Name, A, AI, E, EI, R, Interrupt>;
  readonly loadQuery: Effect.Effect<Envelope<Schema.Json>, Schema.SchemaError, R>;
}
interface KeyedLoadProgram<Args, I, R> {
  readonly loadQuery: (args: Args) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>;
}
declare const loadQuery: {
  <I, R>(self: {
    readonly loadQuery: Effect.Effect<Envelope<I>, Schema.SchemaError, R>;
  }): Effect.Effect<Envelope<I>, Schema.SchemaError, R>;
  <Args>(args: Args): <I, R>(self: KeyedLoadProgram<Args, I, R>) => Effect.Effect<Envelope<I>, Schema.SchemaError, R>;
  <Args, I, R>(self: KeyedLoadProgram<Args, I, R>, args: NoInfer<Args>): Effect.Effect<Envelope<I>, Schema.SchemaError, R>;
};
type QueryLoadSchema<A, AI, E, EI> = Schema.Struct<{
  readonly result: Schema.Codec<AsyncData.AsyncData<A, E>, AsyncData.AsyncDataEncoded<AI, EI>>;
}>;
type KeyedQueryLoadSchema<Fields extends SyncFields, A, AI, E, EI> = Schema.Struct<{
  readonly args: Schema.Struct<Fields>;
} & QueryLoadSchema<A, AI, E, EI>["fields"]>;
interface FromQueryOptions {
  readonly name?: string;
}
interface FromKeyedQueryOptions<Args> extends FromQueryOptions {
  readonly key?: (args: Args) => string;
}
declare function fromQuery<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>, options?: FromKeyedQueryOptions<KeyedArgs<Fields>>): KeyedQueryLoader<Name, A, AI, E, EI, Fields, R, KeyedQueryLoadSchema<Fields, A, AI, E, EI>, Interrupt>;
declare function fromQuery<Name extends string, A, AI, E, EI, R, Interrupt extends boolean>(query: Query<Name, A, AI, E, EI, R, Interrupt>, options?: FromQueryOptions): QueryLoader<Name, A, AI, E, EI, R, QueryLoadSchema<A, AI, E, EI>, Interrupt>;
interface SettleQueryIfOptions<A, E> {
  readonly fresher: (incoming: A, current: A) => boolean;
  readonly acceptFailure?: (current: AsyncData.AsyncData<A, E>) => boolean;
}
declare function settleQueryIf<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>, model: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"], args: KeyedArgs<Fields>, result: AsyncData.AsyncData<A, E>, options: SettleQueryIfOptions<A, E>): Return<KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"], KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Message"]["Type"]>;
declare function settleQueryIf<Name extends string, A, AI, E, EI, R, Interrupt extends boolean>(query: Query<Name, A, AI, E, EI, R, Interrupt>, model: Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"], result: AsyncData.AsyncData<A, E>, options: SettleQueryIfOptions<A, E>): Return<Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"], Query<Name, A, AI, E, EI, R, Interrupt>["Message"]["Type"]>;
declare const mapMessages: {
  <Message, Next>(f: (message: Message, receipt: Receipt) => Next): <A, I>(self: Loader<A, I, Message>) => Loader<A, I, Next>;
  <A, I, Message, Next>(self: Loader<A, I, Message>, f: (message: Message, receipt: Receipt) => Next): Loader<A, I, Next>;
};
declare const load: {
  <A, I, Message, E, R>(effect: Effect.Effect<A, E, R>): (self: Loader<A, I, Message>) => Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>;
  <A, I, Message, E, R>(self: Loader<A, I, Message>, effect: Effect.Effect<A, E, R>): Effect.Effect<Envelope<I>, E | Schema.SchemaError, R>;
};
export { type Config, type Declaration, type Delivery, Envelope, type FromKeyedQueryOptions, type FromQueryOptions, type KeyedQueryLoader, type LoadPayload, type Loader, type QueryLoader, Receipt, type SettleQueryIfOptions, define, fromQuery, load, loadQuery, mapMessages, settleQueryIf };
```

## dist/message.implementation.d.ts

```ts
import { MessageUnion, defineMessageUnion } from 'foldkit/message';
declare const message_MessageUnion: typeof MessageUnion;
declare const message_defineMessageUnion: typeof defineMessageUnion;
declare namespace message {
  export { message_MessageUnion as MessageUnion, message_defineMessageUnion as defineMessageUnion };
}
export { message as m };
```

## dist/message.d.ts

```ts
export { MessageUnion, defineMessageUnion } from 'foldkit/message';
```

## dist/modelSource.d.ts

```ts
interface ModelReader<Model> {
  readonly getSnapshot: () => Model;
  readonly getServerSnapshot: () => Model;
  readonly subscribe: (notify: () => void) => () => void;
}
interface ModelSource<Model, Message> extends ModelReader<Model> {
  readonly dispatch: (message: Message) => void;
}
export type { ModelReader, ModelSource };
```

## dist/public.implementation.d.ts

```ts
import { Option, Result, Cause, Effect, Schema } from 'effect';
import React from 'react';
import { CommitSource } from './commitSource.js';
import { ModelSource } from './modelSource.js';
import { Config as Config$2, CommitError } from './store.js';
import { Return } from 'foldkit/update';
interface Lift<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Model;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
declare const lift: <ParentModel, ParentMessage, Model, Message>(input: Lift<ParentModel, ParentMessage, Model, Message>) => Lift<ParentModel, ParentMessage, Model, Message>;
interface OptionalLift<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Option.Option<Model>;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
type Config$1<Model, Message, R = never> = Config$2<Model, Message, R> & {
  readonly onReactivate?: () => Message;
};
type ModelCodec = Schema.Codec<unknown, unknown, unknown, unknown>;
type Config<ModelSchema extends ModelCodec, Message, R = never> = Config$1<Schema.Schema.Type<ModelSchema>, Message, R> & {
  readonly Model: ModelSchema;
};
type Type<ModelSchema extends ModelCodec> = Schema.Schema.Type<ModelSchema>;
interface ErrorOptions {
  readonly renderError?: (cause: Cause.Cause<unknown>) => React.ReactNode;
  readonly onError?: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>;
}
type SourceOptions<Message, E = never, FactoryError = never> = {
  readonly commitSource?: CommitSource<Message, E>;
  readonly createCommitSource?: never;
} | {
  readonly commitSource?: never;
  readonly createCommitSource: () => Result.Result<CommitSource<Message, E>, FactoryError>;
};
type ProviderProps<Model, Message, R = never, E = never, FactoryError = never> = {
  readonly init: Return<Model, Message, R>;
  readonly children?: React.ReactNode;
} & SourceOptions<Message, E, FactoryError> & ErrorOptions;
interface ModelHooks<Model, Message> {
  readonly useModel: {
    (): Model;
    <Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected;
  };
  readonly useDispatch: () => (message: Message) => void;
  readonly useOptionalModel: () => Option.Option<Model>;
  readonly useOptionalDispatch: () => Option.Option<(message: Message) => void>;
  readonly useSubmodel: <ChildModel, ChildMessage>(projection: Lift<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>;
  readonly useOptionalSubmodel: <ChildModel, ChildMessage>(projection: OptionalLift<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>;
  readonly SubmodelProvider: <ChildModel, ChildMessage>(props: {
    readonly lift: Lift<Model, Message, ChildModel, ChildMessage>;
    readonly render: (props: {
      readonly source: ModelSource<ChildModel, ChildMessage>;
    }) => React.ReactNode;
  }) => React.ReactNode;
}
interface Application<Model, Message, R = never> extends ModelHooks<Model, Message> {
  readonly Provider: <E = never, FactoryError = never>(props: ProviderProps<Model, Message, R, E, FactoryError>) => React.ReactNode;
  readonly useCommit: () => (message: Message) => Result.Result<void, CommitError>;
  readonly useOptionalCommit: () => Option.Option<(message: Message) => Result.Result<void, CommitError>>;
}
declare function defineApplication<ModelSchema extends ModelCodec, Message, R = never>(config: Config<ModelSchema, Message, R>): Application<Type<ModelSchema>, Message, R>;
export { type Application as A, type Config as C, type ErrorOptions as E, type Lift as L, type ModelHooks as M, type OptionalLift as O, type ProviderProps as P, type SourceOptions as S, defineApplication as d, lift as l };
```

## dist/react.d.ts

```ts
export { A as Application, C as Config, E as ErrorOptions, M as ModelHooks, P as ProviderProps, S as SourceOptions, d as defineApplication } from './public.implementation.js';
export { CommitEntry, CommitSource, CommitSourceError } from './commitSource.js';
import 'effect';
import 'react';
import './modelSource.js';
import './store.js';
import 'foldkit/subscription';
import 'foldkit/update';
import 'effect/Cause';
```

## dist/schema.implementation.d.ts

```ts
import { CallableTaggedStruct, TaggedUnion, defineTaggedUnion, taggedStruct } from 'foldkit/schema';
declare const schema_CallableTaggedStruct: typeof CallableTaggedStruct;
declare const schema_TaggedUnion: typeof TaggedUnion;
declare const schema_defineTaggedUnion: typeof defineTaggedUnion;
declare const schema_taggedStruct: typeof taggedStruct;
declare namespace schema {
  export { schema_CallableTaggedStruct as CallableTaggedStruct, schema_TaggedUnion as TaggedUnion, schema_defineTaggedUnion as defineTaggedUnion, schema_taggedStruct as taggedStruct };
}
export { schema as s };
```

## dist/schema.d.ts

```ts
export { CallableTaggedStruct, TaggedUnion, defineTaggedUnion, taggedStruct } from 'foldkit/schema';
```

## dist/store.d.ts

```ts
import { Schema, Cause, Option, Layer, Result, Effect, Scope } from 'effect';
import { Subscriptions } from 'foldkit/subscription';
import { Return } from 'foldkit/update';
type Program<Model, Message, R = never> = {
  update: (model: Model, message: Message) => Return<Model, Message, R>;
  subscriptions?: Subscriptions<Model, Message, R>;
  onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void;
};
type Config<Model, Message, R = never> = [R] extends [never] ? Program<Model, Message, R> & {
  layer?: Layer.Layer<never, never, never>;
} : Program<Model, Message, R> & {
  layer: Layer.Layer<NoInfer<R>, never, never>;
};
declare const StoreTypeId: unique symbol;
type StoreTypeId = typeof StoreTypeId;
type Store<Model, Message> = Readonly<{
  [StoreTypeId]: StoreTypeId;
  getModel: () => Model;
  getCrash: () => Option.Option<Cause.Cause<unknown>>;
  subscribeCrash: (listener: () => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  dispatch: (message: Message) => void;
  commit: (message: Message) => Result.Result<void, CommitError>;
  dispose: () => Effect.Effect<void>;
  isDisposed: () => boolean;
}>;
declare const Disposed_base: Schema.Class<Disposed, Schema.Struct<{
  readonly _tag: Schema.tag<"Disposed">;
}>, Cause.YieldableError>;
declare class Disposed extends Disposed_base {
}
declare const Crashed_base: Schema.Class<Crashed, Schema.Struct<{
  readonly _tag: Schema.tag<"Crashed">;
  readonly cause: Schema.declare<Cause.Cause<unknown>, Cause.Cause<unknown>>;
}>, Cause.YieldableError>;
declare class Crashed extends Crashed_base {
}
declare const CommitError_base: Schema.Class<CommitError, Schema.Struct<{
  readonly _tag: Schema.tag<"CommitError">;
  readonly details: Schema.Union<readonly [Schema.Struct<{
    readonly reason: Schema.Literals<readonly ["Inactive", "Reentrant", "Disposed"]>;
  }>, Schema.Struct<{
    readonly reason: Schema.Literal<"Crashed">;
    readonly cause: Schema.declare<Cause.Cause<unknown>, Cause.Cause<unknown>>;
  }>]>;
}>, Cause.YieldableError>;
declare class CommitError extends CommitError_base {
  get message(): string;
}
declare const commit: {
  <Message>(message: Message): <Model>(self: Store<Model, Message>) => Effect.Effect<void, CommitError>;
  <Model, Message>(self: Store<Model, Message>, message: NoInfer<Message>): Effect.Effect<void, CommitError>;
};
declare const takeWhen: {
  <Model, A>(pick: (model: Model) => Option.Option<A>): <Message>(self: Store<Model, Message>) => Effect.Effect<A, Disposed | Crashed>;
  <Model, Message, A>(self: Store<Model, Message>, pick: (model: Model) => Option.Option<A>): Effect.Effect<A, Disposed | Crashed>;
};
declare function make<Model, Message, R = never>(config: Config<Model, Message, R>, init: Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, Scope.Scope>;
declare function make<Model, Message, R = never>(config: Program<Model, Message, R> & {
  readonly layer?: never;
}, init: Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, R | Scope.Scope>;
declare function boot<Model, Message, R = never>(config: Config<Model, Message, R>, init: Return<Model, Message, R>): Store<Model, Message>;
export { CommitError, type Config, Crashed, Disposed, type Program, type Store, StoreTypeId, boot, commit, make, takeWhen };
```

## dist/struct.implementation.d.ts

```ts
import { makeModifyFieldsFor, modifyFields } from 'foldkit/struct';
declare const struct_makeModifyFieldsFor: typeof makeModifyFieldsFor;
declare const struct_modifyFields: typeof modifyFields;
declare namespace struct {
  export { struct_makeModifyFieldsFor as makeModifyFieldsFor, struct_modifyFields as modifyFields };
}
export { struct as s };
```

## dist/struct.d.ts

```ts
export { makeModifyFieldsFor, modifyFields } from 'foldkit/struct';
```

## dist/submodel.d.ts

```ts
import * as effect_Cause from 'effect/Cause';
import { Schema } from 'effect';
import React from 'react';
import { M as ModelHooks } from './public.implementation.js';
export { L as Lift, O as OptionalLift, l as lift } from './public.implementation.js';
import { ModelSource } from './modelSource.js';
import './commitSource.js';
import './store.js';
import 'foldkit/subscription';
import 'foldkit/update';
interface Submodel<Model, Message> extends ModelHooks<Model, Message> {
  readonly Provider: (props: {
    readonly source: ModelSource<Model, Message>;
    readonly children?: React.ReactNode;
  }) => React.ReactNode;
}
declare const ProviderError_base: Schema.Class<ProviderError, Schema.Struct<{
  readonly _tag: Schema.tag<"ProviderError">;
}>, effect_Cause.YieldableError>;
declare class ProviderError extends ProviderError_base {
  get message(): string;
}
declare function define<Model, Message>(): Submodel<Model, Message>;
export { ProviderError, type Submodel, define };
```

## dist/subscription.implementation.d.ts

```ts
import { make, EntryWithoutKeepAlive, Subscription, Subscriptions } from 'foldkit/subscription';
type EntryBuilder<Model, Message, Services = never> = Parameters<Parameters<ReturnType<typeof make<Model, Message, Services>>>[0]>[0];
type subscription_EntryBuilder<Model, Message, Services = never> = EntryBuilder<Model, Message, Services>;
declare const subscription_EntryWithoutKeepAlive: typeof EntryWithoutKeepAlive;
declare const subscription_Subscription: typeof Subscription;
declare const subscription_Subscriptions: typeof Subscriptions;
declare const subscription_make: typeof make;
declare namespace subscription {
  export { type subscription_EntryBuilder as EntryBuilder, subscription_EntryWithoutKeepAlive as EntryWithoutKeepAlive, subscription_Subscription as Subscription, subscription_Subscriptions as Subscriptions, subscription_make as make };
}
export { type EntryBuilder as E, subscription as s };
```

## dist/subscription.d.ts

```ts
export { EntryWithoutKeepAlive, Subscription, Subscriptions, make } from 'foldkit/subscription';
export { E as EntryBuilder } from './subscription.implementation.js';
```

## dist/tanstack.d.ts

```ts
import * as effect_Cause from 'effect/Cause';
import { AnyRouter } from '@tanstack/react-router';
import { Schema, Result } from 'effect';
import { CommitSource } from './commitSource.js';
import { Declaration } from './loader.js';
import 'foldkit/asyncData';
import 'foldkit/experimental/query';
import 'foldkit/update';
declare const RegistryError_base: Schema.Class<RegistryError, Schema.Struct<{
  readonly _tag: Schema.tag<"RegistryError">;
  readonly declarationName: Schema.String;
}>, effect_Cause.YieldableError>;
declare class RegistryError extends RegistryError_base {
  get message(): string;
}
type MessageOfDeclaration<D> = D extends Declaration<infer Message> ? Message : never;
declare function make<const D extends ReadonlyArray<Declaration<unknown>>>(router: AnyRouter, declarations: D): Result.Result<CommitSource<MessageOfDeclaration<D[number]>, Schema.SchemaError>, RegistryError>;
export { RegistryError, make };
```

## dist/update.implementation.d.ts

```ts
import { Return, ChildFold, ChildFoldWithDerivedParentOutMessage, ChildFoldWithOutMessage, ChildFoldWithParentOutMessage, ChildStepFold, ChildStepFoldWithDerivedParentOutMessage, ChildStepFoldWithOutMessage, ChildStepFoldWithParentOutMessage, Commands, Fold, FoldContext, FoldWithOutMessage, Refreshable, ReturnWithOutMessage, Step, StepWithOutMessage, combine, foldChild, foldChildInit, foldChildInits, foldChildStep, refresh, withOutMessage } from 'foldkit/update';
declare const identity: <Model>(model: Model) => Return<Model, never>;
declare const update_ChildFold: typeof ChildFold;
declare const update_ChildFoldWithDerivedParentOutMessage: typeof ChildFoldWithDerivedParentOutMessage;
declare const update_ChildFoldWithOutMessage: typeof ChildFoldWithOutMessage;
declare const update_ChildFoldWithParentOutMessage: typeof ChildFoldWithParentOutMessage;
declare const update_ChildStepFold: typeof ChildStepFold;
declare const update_ChildStepFoldWithDerivedParentOutMessage: typeof ChildStepFoldWithDerivedParentOutMessage;
declare const update_ChildStepFoldWithOutMessage: typeof ChildStepFoldWithOutMessage;
declare const update_ChildStepFoldWithParentOutMessage: typeof ChildStepFoldWithParentOutMessage;
declare const update_Commands: typeof Commands;
declare const update_Fold: typeof Fold;
declare const update_FoldContext: typeof FoldContext;
declare const update_FoldWithOutMessage: typeof FoldWithOutMessage;
declare const update_Refreshable: typeof Refreshable;
declare const update_Return: typeof Return;
declare const update_ReturnWithOutMessage: typeof ReturnWithOutMessage;
declare const update_Step: typeof Step;
declare const update_StepWithOutMessage: typeof StepWithOutMessage;
declare const update_combine: typeof combine;
declare const update_foldChild: typeof foldChild;
declare const update_foldChildInit: typeof foldChildInit;
declare const update_foldChildInits: typeof foldChildInits;
declare const update_foldChildStep: typeof foldChildStep;
declare const update_identity: typeof identity;
declare const update_refresh: typeof refresh;
declare const update_withOutMessage: typeof withOutMessage;
declare namespace update {
  export { update_ChildFold as ChildFold, update_ChildFoldWithDerivedParentOutMessage as ChildFoldWithDerivedParentOutMessage, update_ChildFoldWithOutMessage as ChildFoldWithOutMessage, update_ChildFoldWithParentOutMessage as ChildFoldWithParentOutMessage, update_ChildStepFold as ChildStepFold, update_ChildStepFoldWithDerivedParentOutMessage as ChildStepFoldWithDerivedParentOutMessage, update_ChildStepFoldWithOutMessage as ChildStepFoldWithOutMessage, update_ChildStepFoldWithParentOutMessage as ChildStepFoldWithParentOutMessage, update_Commands as Commands, update_Fold as Fold, update_FoldContext as FoldContext, update_FoldWithOutMessage as FoldWithOutMessage, update_Refreshable as Refreshable, update_Return as Return, update_ReturnWithOutMessage as ReturnWithOutMessage, update_Step as Step, update_StepWithOutMessage as StepWithOutMessage, update_combine as combine, update_foldChild as foldChild, update_foldChildInit as foldChildInit, update_foldChildInits as foldChildInits, update_foldChildStep as foldChildStep, update_identity as identity, update_refresh as refresh, update_withOutMessage as withOutMessage };
}
export { identity as i, update as u };
```

## dist/update.d.ts

```ts
export { ChildFold, ChildFoldWithDerivedParentOutMessage, ChildFoldWithOutMessage, ChildFoldWithParentOutMessage, ChildStepFold, ChildStepFoldWithDerivedParentOutMessage, ChildStepFoldWithOutMessage, ChildStepFoldWithParentOutMessage, Commands, Fold, FoldContext, FoldWithOutMessage, Refreshable, Return, ReturnWithOutMessage, Step, StepWithOutMessage, combine, foldChild, foldChildInit, foldChildInits, foldChildStep, refresh, withOutMessage } from 'foldkit/update';
export { i as identity } from './update.implementation.js';
```

## eslint/dist/index.d.ts

```ts
import { Linter } from 'eslint';
declare const recommendedConfig: Linter.Config[];
declare const strictConfig: Linter.Config[];
export { recommendedConfig as default, recommendedConfig, strictConfig };
```
