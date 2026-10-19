# Declaration snapshot

Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.

## dist/index.d.ts

```ts
import { A as Application, C as Config, a as CrashConfig, b as CrashContext, M as ModelHooks, P as ProviderProps, R as ReactivationContext, d as defineApplication, F as Field, L as Lift, O as OptionalLift, f as field, l as lift } from './public.implementation.js';
import { CommitError, Config as Config$1, Crashed, Disposed, Inactive, Program, Reentrant, Store, StoreTypeId, boot, commit, make, takeWhen } from './store.js';
import { ProviderError, ProviderProps as ProviderProps$1, Submodel, define } from './submodel.js';
import { ModelReader, ModelSource } from './modelSource.js';
import 'effect';
import 'react';
import 'foldkit/update';
import 'foldkit/subscription';
import 'effect/Cause';
declare const modelSource_ModelReader: typeof ModelReader;
declare const modelSource_ModelSource: typeof ModelSource;
declare namespace modelSource {
  export { modelSource_ModelReader as ModelReader, modelSource_ModelSource as ModelSource };
}
declare const react_Application: typeof Application;
declare const react_Config: typeof Config;
declare const react_CrashConfig: typeof CrashConfig;
declare const react_CrashContext: typeof CrashContext;
declare const react_ModelHooks: typeof ModelHooks;
declare const react_ProviderProps: typeof ProviderProps;
declare const react_ReactivationContext: typeof ReactivationContext;
declare const react_defineApplication: typeof defineApplication;
declare namespace react {
  export { react_Application as Application, react_Config as Config, react_CrashConfig as CrashConfig, react_CrashContext as CrashContext, react_ModelHooks as ModelHooks, react_ProviderProps as ProviderProps, react_ReactivationContext as ReactivationContext, react_defineApplication as defineApplication };
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
  export { store_CommitError as CommitError, Config$1 as Config, store_Crashed as Crashed, store_Disposed as Disposed, store_Inactive as Inactive, store_Program as Program, store_Reentrant as Reentrant, store_Store as Store, store_StoreTypeId as StoreTypeId, store_boot as boot, store_commit as commit, store_make as make, store_takeWhen as takeWhen };
}
declare const submodel_Field: typeof Field;
declare const submodel_Lift: typeof Lift;
declare const submodel_OptionalLift: typeof OptionalLift;
declare const submodel_ProviderError: typeof ProviderError;
declare const submodel_Submodel: typeof Submodel;
declare const submodel_define: typeof define;
declare const submodel_field: typeof field;
declare const submodel_lift: typeof lift;
declare namespace submodel {
  export { submodel_Field as Field, submodel_Lift as Lift, submodel_OptionalLift as OptionalLift, submodel_ProviderError as ProviderError, ProviderProps$1 as ProviderProps, submodel_Submodel as Submodel, submodel_define as define, submodel_field as field, submodel_lift as lift };
}
export { modelSource as ModelSource, react as ReactFoldkit, store as Store, submodel as Submodel };
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
import { Option, Duration, Cause, Effect, Schema } from 'effect';
import React from 'react';
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
type ProviderProps<Model, Message, R = never> = {
  readonly init: Update.Return<Model, Message, R> | (() => Update.Return<Model, Message, R>);
  readonly children?: React.ReactNode;
  readonly crash?: CrashConfig<Model, Message>;
};
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
  readonly Provider: (props: ProviderProps<Model, Message, R>) => React.ReactNode;
}
declare function defineApplication<ModelSchema extends ModelCodec, Message, R = never>(config: Config<ModelSchema, Message, R>): Application<Type<ModelSchema>, Message, R>;
export { type Application as A, type Config as C, type Field as F, type Lift as L, type ModelHooks as M, type OptionalLift as O, type ProviderProps as P, type ReactivationContext as R, type CrashConfig as a, type CrashContext as b, defineApplication as d, field as f, lift as l };
```

## dist/react.d.ts

```ts
export { A as Application, C as Config, a as CrashConfig, b as CrashContext, M as ModelHooks, P as ProviderProps, R as ReactivationContext, d as defineApplication } from './public.implementation.js';
import 'effect';
import 'react';
import './modelSource.js';
import 'foldkit/update';
import './store.js';
import 'foldkit/subscription';
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

## eslint/dist/index.d.ts

```ts
import { Linter } from 'eslint';
declare const recommendedConfig: Linter.Config[];
declare const strictConfig: Linter.Config[];
export { recommendedConfig as default, recommendedConfig, strictConfig };
```
