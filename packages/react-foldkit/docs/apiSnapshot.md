# Declaration snapshot

Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.

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
declare const DuplicateKey_base: Schema.Class<DuplicateKey, Schema.Struct<{
  readonly _tag: Schema.tag<"DuplicateKey">;
  readonly key: Schema.String;
}>, effect_Cause.YieldableError>;
declare class DuplicateKey extends DuplicateKey_base {
}
declare const ReentrantNotification_base: Schema.Class<ReentrantNotification, Schema.Struct<{
  readonly _tag: Schema.tag<"ReentrantNotification">;
}>, effect_Cause.YieldableError>;
declare class ReentrantNotification extends ReentrantNotification_base {
}
declare const CommitSourceError_base: Schema.Class<CommitSourceError, Schema.Struct<{
  readonly _tag: Schema.tag<"CommitSourceError">;
  readonly reason: Schema.Union<readonly [typeof DuplicateKey, typeof ReentrantNotification]>;
}>, effect_Cause.YieldableError>;
declare class CommitSourceError extends CommitSourceError_base {
  get message(): string;
}
export { type CommitEntry, type CommitSource, CommitSourceError, DuplicateKey, ReentrantNotification };
```

## dist/index.d.ts

```ts
import { CommitEntry, CommitSource, CommitSourceError, DuplicateKey, ReentrantNotification } from './commitSource.js';
import { Config, Declaration, Delivery, Envelope, FromKeyedQueryOptions, FromQueryOptions, KeyedQueryLoader, LoadPayload, Loader, QueryLoader, Receipt, SettleQueryIfOptions, define, fromQuery, load, loadQuery, mapMessages, settleQueryIf } from './loader.js';
import { A as Application, C as Config$1, a as CrashConfig, b as CrashContext, M as ModelHooks, P as ProviderProps, R as ReactivationContext, S as SourceOptions, d as defineApplication, F as Field, L as Lift, O as OptionalLift, f as field, l as lift } from './public.implementation.js';
import { CommitError, Config as Config$2, Crashed, Disposed, Inactive, Program, Reentrant, Store, StoreTypeId, boot, commit, make, takeWhen } from './store.js';
import { ProviderError, ProviderProps as ProviderProps$1, Submodel, define as define$1 } from './submodel.js';
import { ModelReader, ModelSource } from './modelSource.js';
import 'effect/Cause';
import 'effect';
import 'foldkit/asyncData';
import 'foldkit/experimental/query';
import 'foldkit/update';
import 'react';
import 'foldkit/subscription';
declare const commitSource_CommitEntry: typeof CommitEntry;
declare const commitSource_CommitSource: typeof CommitSource;
declare const commitSource_CommitSourceError: typeof CommitSourceError;
declare const commitSource_DuplicateKey: typeof DuplicateKey;
declare const commitSource_ReentrantNotification: typeof ReentrantNotification;
declare namespace commitSource {
  export { commitSource_CommitEntry as CommitEntry, commitSource_CommitSource as CommitSource, commitSource_CommitSourceError as CommitSourceError, commitSource_DuplicateKey as DuplicateKey, commitSource_ReentrantNotification as ReentrantNotification };
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
declare const react_CrashConfig: typeof CrashConfig;
declare const react_CrashContext: typeof CrashContext;
declare const react_ModelHooks: typeof ModelHooks;
declare const react_ProviderProps: typeof ProviderProps;
declare const react_ReactivationContext: typeof ReactivationContext;
declare const react_SourceOptions: typeof SourceOptions;
declare const react_defineApplication: typeof defineApplication;
declare namespace react {
  export { react_Application as Application, react_CommitEntry as CommitEntry, react_CommitSource as CommitSource, react_CommitSourceError as CommitSourceError, Config$1 as Config, react_CrashConfig as CrashConfig, react_CrashContext as CrashContext, react_ModelHooks as ModelHooks, react_ProviderProps as ProviderProps, react_ReactivationContext as ReactivationContext, react_SourceOptions as SourceOptions, react_defineApplication as defineApplication };
}
declare const store_CommitError: typeof CommitError;
declare const store_Crashed: typeof Crashed;
declare const store_Disposed: typeof Disposed;
declare const store_Inactive: typeof Inactive;
declare const store_Program: typeof Program;
declare const store_Reentrant: typeof Reentrant;
declare const store_Store: typeof Store;
declare const store_StoreTypeId: typeof StoreTypeId;
declare const store_boot: typeof boot;
declare const store_commit: typeof commit;
declare const store_make: typeof make;
declare const store_takeWhen: typeof takeWhen;
declare namespace store {
  export { store_CommitError as CommitError, Config$2 as Config, store_Crashed as Crashed, store_Disposed as Disposed, store_Inactive as Inactive, store_Program as Program, store_Reentrant as Reentrant, store_Store as Store, store_StoreTypeId as StoreTypeId, store_boot as boot, store_commit as commit, store_make as make, store_takeWhen as takeWhen };
}
declare const submodel_Field: typeof Field;
declare const submodel_Lift: typeof Lift;
declare const submodel_OptionalLift: typeof OptionalLift;
declare const submodel_ProviderError: typeof ProviderError;
declare const submodel_Submodel: typeof Submodel;
declare const submodel_field: typeof field;
declare const submodel_lift: typeof lift;
declare namespace submodel {
  export { submodel_Field as Field, submodel_Lift as Lift, submodel_OptionalLift as OptionalLift, submodel_ProviderError as ProviderError, ProviderProps$1 as ProviderProps, submodel_Submodel as Submodel, define$1 as define, submodel_field as field, submodel_lift as lift };
}
export { commitSource as CommitSource, loader as Loader, modelSource as ModelSource, react as ReactFoldkit, store as Store, submodel as Submodel };
```

## dist/loader.d.ts

```ts
import { Schema, Pipeable, Result, Effect } from 'effect';
import * as AsyncData from 'foldkit/asyncData';
import { KeyedQuery, Query } from 'foldkit/experimental/query';
import * as Update from 'foldkit/update';
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
  readonly fresher?: (incoming: A, current: A) => boolean;
  readonly acceptFailure?: (current: AsyncData.AsyncData<A, E>) => boolean;
}
declare function settleQueryIf<Name extends string, A, AI, E, EI, Fields extends SyncFields, R, Interrupt extends boolean>(query: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>, model: KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"], args: KeyedArgs<Fields>, result: AsyncData.AsyncData<A, E>, options?: SettleQueryIfOptions<A, E>): Update.Return<KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Model"]["Type"], KeyedQuery<Name, A, AI, E, EI, Fields, R, Interrupt>["Message"]["Type"]>;
declare function settleQueryIf<Name extends string, A, AI, E, EI, R, Interrupt extends boolean>(query: Query<Name, A, AI, E, EI, R, Interrupt>, model: Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"], result: AsyncData.AsyncData<A, E>, options?: SettleQueryIfOptions<A, E>): Update.Return<Query<Name, A, AI, E, EI, R, Interrupt>["Model"]["Type"], Query<Name, A, AI, E, EI, R, Interrupt>["Message"]["Type"]>;
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
import { Option, Duration, Cause, Effect, Result, Schema } from 'effect';
import React from 'react';
import { CommitSource } from './commitSource.js';
import { ModelSource } from './modelSource.js';
import * as Update from 'foldkit/update';
import { Config as Config$2 } from './store.js';
interface Lift<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Model;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
declare const lift: <ParentModel, ParentMessage, Model, Message>(input: Lift<ParentModel, ParentMessage, Model, Message>) => Lift<ParentModel, ParentMessage, Model, Message>;
interface Field<ParentModel, ParentMessage, Model, Message, FoldResult> extends Lift<ParentModel, ParentMessage, Model, Message> {
  readonly key: string;
  readonly write: (model: ParentModel, child: Model) => ParentModel;
  readonly fold: FoldResult;
}
type FieldUpdate<Model, Message, R> = (model: Model, message: Message) => Update.Return<Model, Message, R>;
type FieldUpdateWithOutMessage<Model, Message, OutMessage, R> = (model: Model, message: Message) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>;
declare function field<ParentModel>(): {
  <K extends keyof ParentModel & string, ParentMessage, Message, OutMessage, R = never, StepR = R, StepMessage = ParentMessage>(key: K, options: {
    readonly update: FieldUpdateWithOutMessage<ParentModel[K], Message, OutMessage, R>;
    readonly toParentMessage: (message: Message) => ParentMessage;
    readonly foldOutMessage: (outMessage: OutMessage, context: Update.FoldContext<Message, ParentMessage>) => Update.Step<NoInfer<ParentModel>, StepMessage, StepR>;
  }): Field<ParentModel, ParentMessage, ParentModel[K], Message, Update.Fold<ParentModel, ParentMessage | StepMessage, Message, R | StepR>>;
  <K extends keyof ParentModel & string, ParentMessage, Message, R = never>(key: K, options: {
    readonly update: FieldUpdate<ParentModel[K], Message, R>;
    readonly toParentMessage: (message: Message) => ParentMessage;
  }): Field<ParentModel, ParentMessage, ParentModel[K], Message, Update.Fold<ParentModel, ParentMessage, Message, R>>;
};
interface OptionalLift<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Option.Option<Model>;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
interface ReactivationContext<Model, Message, R = never> {
  readonly model: Model;
  readonly interrupted: Update.Commands<Message, R>;
}
type Config$1<Model, Message, R = never> = Config$2<Model, Message, R> & {
  readonly onReactivate?: (context: ReactivationContext<Model, Message, R>) => Message;
  readonly retainInactive?: Duration.Input;
  readonly restartInterrupted?: boolean | ((command: Update.Commands<Message, R>[number]) => boolean);
  readonly freezeModel?: boolean;
};
type ModelCodec = Schema.Codec<unknown, unknown, unknown, unknown>;
type Type<ModelSchema extends ModelCodec> = Schema.Schema.Type<ModelSchema>;
interface CrashContext<Model, Message> {
  readonly cause: Cause.Cause<unknown>;
  readonly model: Option.Option<Model>;
  readonly message: Option.Option<Message>;
}
interface CrashConfig<Model, Message> {
  readonly view?: (context: CrashContext<Model, Message> & {
    readonly restart: () => void;
  }) => React.ReactNode;
  readonly report?: (context: CrashContext<Model, Message>) => Effect.Effect<void, unknown>;
}
type Config<ModelSchema extends ModelCodec, Message, R = never> = Config$1<Type<ModelSchema>, Message, R> & {
  readonly Model: ModelSchema;
  readonly crash?: CrashConfig<Type<ModelSchema>, Message>;
  readonly validateInit?: boolean;
};
type SourceOptions<Message, E = never, FactoryError = never> = {
  readonly commitSource?: CommitSource<Message, E>;
  readonly createCommitSource?: never;
} | {
  readonly commitSource?: never;
  readonly createCommitSource: () => Result.Result<CommitSource<Message, E>, FactoryError>;
};
type ProviderProps<Model, Message, R = never, E = never, FactoryError = never> = {
  readonly init: Update.Return<Model, Message, R> | (() => Update.Return<Model, Message, R>);
  readonly children?: React.ReactNode;
  readonly crash?: CrashConfig<Model, Message>;
} & SourceOptions<Message, E, FactoryError>;
interface ModelHooks<Model, Message> {
  readonly useModel: {
    (): Model;
    <Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected;
  };
  readonly useDispatch: () => (message: Message) => void;
  readonly useOptionalModel: () => Option.Option<Model>;
  readonly useOptionalDispatch: () => Option.Option<(message: Message) => void>;
  readonly useInbound: <A>(value: A, toMessage: (value: A) => Message, isEqual?: (previous: A, next: A) => boolean) => void;
  readonly useSubmodel: <ChildModel, ChildMessage>(projection: Lift<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>;
  readonly useOptionalSubmodel: <ChildModel, ChildMessage>(projection: OptionalLift<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>;
}
interface Application<Model, Message, R = never> extends ModelHooks<Model, Message> {
  readonly Provider: <E = never, FactoryError = never>(props: ProviderProps<Model, Message, R, E, FactoryError>) => React.ReactNode;
}
declare function defineApplication<ModelSchema extends ModelCodec, Message, R = never>(config: Config<ModelSchema, Message, R>): Application<Type<ModelSchema>, Message, R>;
export { type Application as A, type Config as C, type Field as F, type Lift as L, type ModelHooks as M, type OptionalLift as O, type ProviderProps as P, type ReactivationContext as R, type SourceOptions as S, type CrashConfig as a, type CrashContext as b, defineApplication as d, field as f, lift as l };
```

## dist/react.d.ts

```ts
export { A as Application, C as Config, a as CrashConfig, b as CrashContext, M as ModelHooks, P as ProviderProps, R as ReactivationContext, S as SourceOptions, d as defineApplication } from './public.implementation.js';
export { CommitEntry, CommitSource, CommitSourceError } from './commitSource.js';
import 'effect';
import 'react';
import './modelSource.js';
import 'foldkit/update';
import './store.js';
import 'foldkit/subscription';
import 'effect/Cause';
```

## dist/store.d.ts

```ts
import { Cause, Option, Layer, Schema, Result, Effect, Scope } from 'effect';
import * as Subscription from 'foldkit/subscription';
import * as Update from 'foldkit/update';
type Program<Model, Message, R = never> = {
  update: (model: Model, message: Message) => Update.Return<Model, Message, R>;
  subscriptions?: Subscription.Subscriptions<Model, Message, R>;
  onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void;
};
type Config<Model, Message, R = never> = [R] extends [never] ? Program<Model, Message, R> & {
  resources?: Layer.Layer<never, never, never>;
} : Program<Model, Message, R> & {
  resources: Layer.Layer<NoInfer<R>, never, never>;
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
  getRunningCommands: () => Update.Commands<Message, unknown>;
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
declare const Inactive_base: Schema.Class<Inactive, Schema.Struct<{
  readonly _tag: Schema.tag<"Inactive">;
}>, Cause.YieldableError>;
declare class Inactive extends Inactive_base {
}
declare const Reentrant_base: Schema.Class<Reentrant, Schema.Struct<{
  readonly _tag: Schema.tag<"Reentrant">;
}>, Cause.YieldableError>;
declare class Reentrant extends Reentrant_base {
}
declare const CommitError_base: Schema.Class<CommitError, Schema.Struct<{
  readonly _tag: Schema.tag<"CommitError">;
  readonly reason: Schema.Union<readonly [typeof Inactive, typeof Reentrant, typeof Disposed, typeof Crashed]>;
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
declare function make<Model, Message, R = never>(config: Config<Model, Message, R>, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, Scope.Scope>;
declare function make<Model, Message, R = never>(config: Program<Model, Message, R> & {
  readonly resources?: never;
}, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, R | Scope.Scope>;
declare function boot<Model, Message, R = never>(config: Config<Model, Message, R>, init: Update.Return<Model, Message, R>): Store<Model, Message>;
export { CommitError, type Config, Crashed, Disposed, Inactive, type Program, Reentrant, type Store, StoreTypeId, boot, commit, make, takeWhen };
```

## dist/submodel.d.ts

```ts
import * as effect_Cause from 'effect/Cause';
import { Schema } from 'effect';
import React from 'react';
import { M as ModelHooks, L as Lift } from './public.implementation.js';
export { F as Field, O as OptionalLift, f as field, l as lift } from './public.implementation.js';
import { ModelSource } from './modelSource.js';
import './commitSource.js';
import 'foldkit/update';
import './store.js';
import 'foldkit/subscription';
type ProviderProps<Model, Message, ParentModel = never, ParentMessage = never> = {
  readonly children?: React.ReactNode;
} & ({
  readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel">;
  readonly lift: Lift<ParentModel, ParentMessage, Model, Message>;
  readonly source?: never;
} | {
  readonly source: ModelSource<Model, Message>;
  readonly from?: never;
  readonly lift?: never;
});
interface Submodel<Model, Message> extends ModelHooks<Model, Message> {
  readonly Provider: <ParentModel = never, ParentMessage = never>(props: ProviderProps<Model, Message, ParentModel, ParentMessage>) => React.ReactNode;
}
declare const ProviderError_base: Schema.Class<ProviderError, Schema.Struct<{
  readonly _tag: Schema.tag<"ProviderError">;
}>, effect_Cause.YieldableError>;
declare class ProviderError extends ProviderError_base {
  get message(): string;
}
declare function define<Model, Message>(): Submodel<Model, Message>;
export { Lift, ProviderError, type ProviderProps, type Submodel, define };
```

## dist/tanstack.d.ts

```ts
import * as effect_Cause from 'effect/Cause';
import { AnyRouter } from '@tanstack/react-router';
import { Schema, Option, Result } from 'effect';
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
interface DecodeFailure {
  readonly error: Schema.SchemaError;
  readonly matchId: string;
  readonly declarationName: Option.Option<string>;
}
interface MakeOptions<Message> {
  readonly onDecodeError?: (failure: DecodeFailure) => Message;
}
declare function make<const D extends ReadonlyArray<Declaration<unknown>>, FailureMessage = never>(router: AnyRouter, declarations: D, options?: MakeOptions<FailureMessage>): Result.Result<CommitSource<MessageOfDeclaration<D[number]> | FailureMessage, Schema.SchemaError>, RegistryError>;
export { type DecodeFailure, type MakeOptions, RegistryError, make };
```

## eslint/dist/index.d.ts

```ts
import { Linter } from 'eslint';
declare const recommendedConfig: Linter.Config[];
declare const strictConfig: Linter.Config[];
export { recommendedConfig as default, recommendedConfig, strictConfig };
```
