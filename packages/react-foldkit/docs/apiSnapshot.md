# Declaration snapshot

Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.

## dist/application.d.ts

```ts
export * from "./application/public";
```

## dist/application/providerSession.d.ts

```ts
import { Cause, Effect, Exit, Option } from "effect";
import type { ModelReader } from "../modelSource";
import type { ReactStore } from "./reactStore";
export interface Bootstrap<Model, Message> {
  readonly store: ReactStore<Model, Message>;
}
export interface Snapshot {
  readonly cause: Option.Option<Cause.Cause<unknown>>;
}
export interface ProviderSession extends ModelReader<Snapshot> {
  readonly start: Effect.Effect<void>;
  readonly stop: Effect.Effect<void>;
}
export declare function make<Model, Message>(bootstrap: Exit.Exit<Bootstrap<Model, Message>, unknown>, onError: (cause: Cause.Cause<unknown>) => Effect.Effect<void, unknown>): ProviderSession;
```

## dist/application/public.d.ts

```ts
export { define } from "./react";
export type { Application, CrashConfig, CrashContext, ModelHooks, Options, ProviderProps, ReactivationContext, Send, } from "./react";
```

## dist/application/react.d.ts

```ts
import { Cause, Effect, Option, Schema } from "effect";
import React from "react";
import type { ModelSource } from "../modelSource";
import type { OptionalProjection, Projection } from "../submodel/lift";
import type * as Update from "foldkit/update";
import type { DevToolsConfig } from "foldkit/runtime";
import type { Program } from "../program/program";
import * as ReactStore from "./reactStore";
import { type Send } from "./send";
export type { ReactivationContext } from "./reactStore";
export type { Send } from "./send";
export interface CrashContext<Model, Message> {
  readonly cause: Cause.Cause<unknown>;
  readonly model: Option.Option<Model>;
  readonly message: Option.Option<Message>;
}
export interface CrashConfig<Model, Message> {
  readonly view?: (context: CrashContext<Model, Message> & {
    readonly restart: () => void;
  }) => React.ReactNode;
  readonly report?: (context: CrashContext<Model, Message>) => Effect.Effect<void, unknown>;
}
export type Options<Model, Message, R = never> = Omit<ReactStore.Config<Model, Message, R>, "update" | "subscriptions" | "devTools"> & {
  readonly crash?: CrashConfig<Model, Message>;
  readonly validateInit?: boolean;
  readonly devTools?: DevToolsConfig;
};
type OptionsArgument<Model, Message, R> = [R] extends [never] ? [options?: Options<Model, Message, R>] : [options: Options<Model, Message, R>];
export type ProviderProps<Model, Message, R = never, HasInit extends boolean = false> = {
  readonly children?: React.ReactNode;
  readonly crash?: CrashConfig<Model, Message>;
} & (HasInit extends true ? {
  readonly init?: Init<Model, Message, R>;
} : {
  readonly init: Init<Model, Message, R>;
});
type Init<Model, Message, R> = Update.Return<Model, Message, R> | (() => Update.Return<Model, Message, R>);
export interface ModelHooks<Model, Message> {
  readonly useModel: {
    (): Model;
    <Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected;
  };
  readonly useDispatch: () => (message: Message) => void;
  readonly useSend: () => Send<Message>;
  readonly useOptionalModel: () => Option.Option<Model>;
  readonly useOptionalDispatch: () => Option.Option<(message: Message) => void>;
  readonly useInbound: <A>(value: A, toMessage: (value: A) => Message, isEqual?: (previous: A, next: A) => boolean) => void;
  readonly useSubmodel: <ChildModel, ChildMessage>(projection: Projection<Model, Message, ChildModel, ChildMessage>) => ModelSource<ChildModel, ChildMessage>;
  readonly useOptionalSubmodel: <ChildModel, ChildMessage>(projection: OptionalProjection<Model, Message, ChildModel, ChildMessage>) => Option.Option<ModelSource<ChildModel, ChildMessage>>;
}
export interface Application<Model, Message, R = never, HasInit extends boolean = false> extends ModelHooks<Model, Message> {
  readonly Provider: (props: ProviderProps<Model, Message, R, HasInit>) => React.ReactNode;
}
export type SourceContext<Model, Message> = React.Context<Option.Option<ModelSource<Model, Message>>>;
export declare const makeSourceContext: <Model, Message>() => SourceContext<Model, Message>;
export declare function modelHooks<Model, Message>(Context: SourceContext<Model, Message>, Message: Schema.Schema<Message>, missingProvider: () => Error): {
  useModel: {
    (): Model;
    <Selected>(selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected;
  };
  useDispatch: () => (message: Message) => void;
  useSend: () => Send<Message>;
  useOptionalModel: () => Option.Option<Model>;
  useOptionalDispatch: () => Option.Option<(message: Message) => void>;
  useInbound: <A>(value: A, toMessage: (value: A) => Message, isEqual?: (previous: A, next: A) => boolean) => void;
  useSubmodel: <Model_1, Message_1>({ read, toParentMessage, }: Projection<Model, Message, Model_1, Message_1>) => ModelSource<Model_1, Message_1>;
  useOptionalSubmodel: <Model_1, Message_1>({ read, toParentMessage, }: OptionalProjection<Model, Message, Model_1, Message_1>) => Option.Option<ModelSource<Model_1, Message_1>>;
};
export declare function define<Model, Message, R = never>(program: Program<Model, Message, never, R> & {
  readonly init: () => Update.Return<Model, Message, R>;
}, ...options: OptionsArgument<Model, Message, R>): Application<Model, Message, R, true>;
export declare function define<Model, Message, R = never>(program: Program<Model, Message, never, R>, ...options: OptionsArgument<Model, Message, R>): Application<Model, Message, R>;
```

## dist/application/reactStore.d.ts

```ts
import { Cause, Duration, Effect, Option, Result, Scope } from "effect";
import * as Store from "../store/store";
import type * as Update from "foldkit/update";
import type { DevToolsConfig } from "foldkit/runtime";
import type { Schema } from "effect";
declare const ReactStoreTypeId: unique symbol;
export type ReactStoreTypeId = typeof ReactStoreTypeId;
export type ReactStore<Model, Message> = Readonly<{
  [ReactStoreTypeId]: ReactStoreTypeId;
  getModel: () => Model;
  getDisplayModel: () => Model;
  getServerModel: () => Model;
  getCrash: () => Option.Option<Cause.Cause<unknown>>;
  getCrashMessage: () => Option.Option<Message>;
  subscribeCrash: (listener: () => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  subscribeDisplay: (listener: () => void) => () => void;
  dispatch: (message: Message) => void;
  commit: (message: Message) => Result.Result<void, Store.CommitError>;
  activate: Effect.Effect<void, never, Scope.Scope>;
}>;
export interface ReactivationContext<Model, Message, R = never> {
  readonly model: Model;
  readonly interrupted: Update.Commands<Message, R>;
}
export type Config<Model, Message, R = never> = Store.Config<Model, Message, R> & {
  readonly onReactivate?: (context: ReactivationContext<Model, Message, R>) => Message;
  readonly retainInactive?: Duration.Input;
  readonly restartInterrupted?: boolean | ((command: Update.Commands<Message, R>[number]) => boolean);
  readonly freezeModel?: boolean;
  readonly devTools?: DevToolsConfig;
};
export declare function make<Model, Message, R = never>(config: Config<Model, Message, R>, init: Update.Return<Model, Message, R>, modelSchema?: Schema.Codec<Model, unknown, unknown, unknown>): ReactStore<Model, Message>;
export {};
```

## dist/application/send.d.ts

```ts
import { type Schema } from "effect";
type Fields<Message> = {
  readonly [Key in keyof Message as Key extends "_tag" ? never : Key]: Message[Key];
};
type SendVariant<Message> = keyof Fields<Message> extends never ? () => void : (fields: Fields<Message>) => void;
export type Send<Message> = ((message: Message) => void) & {
  readonly [Variant in Message as Variant extends {
    readonly _tag: infer Tag extends string;
  } ? Tag : never]: SendVariant<Variant>;
};
export declare function sendFor<Message>(union: Schema.Schema<Message>): (dispatch: (message: Message) => void) => Send<Message>;
export {};
```

## dist/application/useModel.d.ts

```ts
import { Option } from "effect";
import type { ModelReader } from "../modelSource/modelSource";
export declare function useModel<Model>(source: ModelReader<Model>): Model;
export declare function useModel<Model, Selected>(source: ModelReader<Model>, selector: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Selected;
export declare function useModel<Model, Selected>(source: ModelReader<Model>, selector?: (model: Model) => Selected, isEqual?: (a: Selected, b: Selected) => boolean): Model | Selected;
export declare function useOptionalModel<Model>(source: Option.Option<ModelReader<Model>>): Option.Option<Model>;
```

## dist/devToolsIntegration.d.ts

```ts
import { Effect, Schema } from "effect";
import type { DevToolsConfig } from "foldkit/runtime";
import type * as Store from "./store/store";
export type Display<Model> = Readonly<{
  get: () => Model;
  subscribe: (listener: () => void) => () => void;
  set: (model: Model) => void;
}>;
export declare function makeDisplay<Model>(initial: Model): Display<Model>;
export declare function makeObserver<Model, Message, R>(options: {
  readonly config: DevToolsConfig | undefined;
  readonly update: (model: Model, message: Message) => {
    readonly model: Model;
  };
  readonly modelSchema: Schema.Codec<Model, unknown, unknown, unknown>;
  readonly display: Display<Model>;
  readonly freeze: (model: Model) => Model;
  readonly readLive: () => Model;
  readonly dispatch: (message: Message) => void;
}): Readonly<{
  readonly observer: Store.RuntimeObserver<Model, Message, R>;
  readonly install: Effect.Effect<void, never, import("effect").Scope.Scope>;
  readonly isPaused: () => boolean;
}>;
```

## dist/devtools.d.ts

```ts
export { __configure } from "./devtoolsOverlay";
```

## dist/devtoolsOverlay.d.ts

```ts
import { Effect, Option, Scope } from "effect";
import type { DevToolsOverlay } from "foldkit/devtools-host";
import type { DevToolsMode, DevToolsPosition } from "foldkit/runtime";
import type { DevToolsStore } from "./devtoolsVendor/devTools/store.js";
export type Hot = Readonly<{
  send: (event: string, data?: unknown) => void;
  on: (event: string, listener: (data: never) => void) => void;
  off: (event: string, listener: (data: never) => void) => void;
  dispose: (callback: (data: unknown) => void) => void;
}>;
export declare function __configure(overlayFactory: DevToolsOverlay, devServerHot: Hot | undefined): () => void;
export declare const getHot: () => Hot | undefined;
export declare const register: (store: DevToolsStore, position: DevToolsPosition, mode: DevToolsMode, banner: Option.Option<string>) => Effect.Effect<void, never, Scope.Scope>;
```

## dist/index.d.ts

```ts
export * as Application from "./application";
export * as Store from "./store";
export * as Submodel from "./submodel";
export * as ModelSource from "./modelSource";
export * as Program from "./program";
```

## dist/internal/deepFreeze.d.ts

```ts
export declare const isDevelopment: boolean;
export declare function deepFreeze<T>(value: T): T;
```

## dist/internal/initCommand.d.ts

```ts
export declare const CompletionTypeId: unique symbol;
export declare const track: <Command extends object>(command: Command, onComplete: () => void) => Command;
export declare function complete(command: object): void;
export declare const isTracked: (command: object) => boolean;
```

## dist/internal/interrupt.d.ts

```ts
import { Context, Effect, Fiber } from "effect";
import { Interruptible } from "foldkit/command";
type InterruptOutcome = Interruptible.Outcome;
export type InterruptRegistry = Readonly<{
  lookup: (key: string) => ReadonlyArray<Fiber.Fiber<unknown, unknown>>;
  register: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void;
  release: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void;
  interrupt: (key: string) => Effect.Effect<InterruptOutcome>;
}>;
export declare function makeInterruptRegistry(): InterruptRegistry;
export declare const CurrentInterruptRegistry: Context.Reference<Readonly<{
  lookup: (key: string) => ReadonlyArray<Fiber.Fiber<unknown, unknown>>;
  register: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void;
  release: (key: string, fiber: Fiber.Fiber<unknown, unknown>) => void;
  interrupt: (key: string) => Effect.Effect<InterruptOutcome>;
}>>;
export {};
```

## dist/modelSource.d.ts

```ts
export * from "./modelSource/public";
```

## dist/modelSource/modelSource.d.ts

```ts
export interface ModelReader<Model> {
  readonly getSnapshot: () => Model;
  readonly getServerSnapshot: () => Model;
  readonly subscribe: (notify: () => void) => () => void;
}
export interface ModelSource<Model, Message> extends ModelReader<Model> {
  readonly dispatch: (message: Message) => void;
}
export declare function stabilize<Model, Wrapped>(wrap: (model: Model) => Wrapped, read: () => Model): () => Wrapped;
```

## dist/modelSource/public.d.ts

```ts
export type { ModelReader, ModelSource } from "./modelSource";
```

## dist/program.d.ts

```ts
export * from "./program/public";
```

## dist/program/program.d.ts

```ts
import type { Schema } from "effect";
import type * as Subscription from "foldkit/subscription";
import type * as Update from "foldkit/update";
export interface Program<Model, Message, OutMessage = never, R = never> {
  readonly Model: Schema.Codec<Model, unknown, unknown, unknown>;
  readonly Message: Schema.Schema<Message>;
  readonly OutMessage?: Schema.Schema<OutMessage>;
  readonly init?: () => Update.Return<Model, Message, R>;
  readonly update: (model: Model, message: Message) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>;
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, R>;
}
type ApplicationProgram<Model, Message, R> = Omit<Program<Model, Message, never, R>, "OutMessage" | "update"> & {
  readonly OutMessage?: undefined;
  readonly update: (model: Model, message: Message) => Update.Return<Model, Message, R>;
};
export declare function make<Model, Message, OutMessage, R = never>(program: Program<Model, Message, OutMessage, R> & {
  readonly OutMessage: Schema.Schema<OutMessage>;
}): Program<Model, Message, OutMessage, R>;
export declare function make<Model, Message, R = never>(program: ApplicationProgram<Model, Message, R> & {
  readonly init: () => Update.Return<Model, Message, R>;
}): Program<Model, Message, never, R> & {
  readonly init: () => Update.Return<Model, Message, R>;
};
export declare function make<Model, Message, R = never>(program: ApplicationProgram<Model, Message, R>): Program<Model, Message, never, R>;
export {};
```

## dist/program/public.d.ts

```ts
export { make } from "./program";
export type { Program } from "./program";
```

## dist/store.d.ts

```ts
export * from "./store/public";
```

## dist/store/public.d.ts

```ts
export { StoreTypeId, Disposed, Crashed, Inactive, Reentrant, CommitError, commit, takeWhen, make, boot } from "./store";
export type { Config, Program, Store } from "./store";
```

## dist/store/scheduler.d.ts

```ts
import { Scheduler } from "effect";
export declare const browserScheduler: Scheduler.MixedScheduler;
```

## dist/store/store.d.ts

```ts
import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema, Scope } from "effect";
import type * as Subscription from "foldkit/subscription";
import type * as Update from "foldkit/update";
export type Program<Model, Message, R = never> = {
  update: (model: Model, message: Message) => Update.Return<Model, Message, R>;
  subscriptions?: Subscription.Subscriptions<Model, Message, R>;
  onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void;
};
export type Config<Model, Message, R = never> = [R] extends [never] ? Program<Model, Message, R> & {
  resources?: Layer.Layer<never, never, never>;
} : Program<Model, Message, R> & {
  resources: Layer.Layer<NoInfer<R>, never, never>;
};
export declare const StoreTypeId: unique symbol;
export type StoreTypeId = typeof StoreTypeId;
export type Store<Model, Message> = Readonly<{
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
export declare class Disposed extends Disposed_base {
}
declare const Crashed_base: Schema.Class<Crashed, Schema.Struct<{
  readonly _tag: Schema.tag<"Crashed">;
  readonly cause: Schema.declare<Cause.Cause<unknown>, Cause.Cause<unknown>>;
}>, Cause.YieldableError>;
export declare class Crashed extends Crashed_base {
}
declare const Inactive_base: Schema.Class<Inactive, Schema.Struct<{
  readonly _tag: Schema.tag<"Inactive">;
}>, Cause.YieldableError>;
export declare class Inactive extends Inactive_base {
}
declare const Reentrant_base: Schema.Class<Reentrant, Schema.Struct<{
  readonly _tag: Schema.tag<"Reentrant">;
}>, Cause.YieldableError>;
export declare class Reentrant extends Reentrant_base {
}
declare const CommitError_base: Schema.Class<CommitError, Schema.Struct<{
  readonly _tag: Schema.tag<"CommitError">;
  readonly reason: Schema.Union<readonly [typeof Inactive, typeof Reentrant, typeof Disposed, typeof Crashed]>;
}>, Cause.YieldableError>;
export declare class CommitError extends CommitError_base {
  get message(): string;
}
export declare const commit: {
  <Message>(message: Message): <Model>(self: Store<Model, Message>) => Effect.Effect<void, CommitError>;
  <Model, Message>(self: Store<Model, Message>, message: NoInfer<Message>): Effect.Effect<void, CommitError>;
};
export declare const takeWhen: {
  <Model, A>(pick: (model: Model) => Option.Option<A>): <Message>(self: Store<Model, Message>) => Effect.Effect<A, Disposed | Crashed>;
  <Model, Message, A>(self: Store<Model, Message>, pick: (model: Model) => Option.Option<A>): Effect.Effect<A, Disposed | Crashed>;
};
export interface ActivateOptions<Message, R> {
  readonly context: Context.Context<never>;
  readonly commands: Update.Commands<Message, R>;
  readonly commandIds?: ReadonlyArray<number | undefined>;
  readonly firstMessage: Option.Option<Message>;
}
export type Runtime<Model, Message, R> = Omit<Store<Model, Message>, "getRunningCommands" | "dispose"> & {
  readonly activate: (options: ActivateOptions<Message, R>) => Effect.Effect<void, never, Scope.Scope>;
  readonly getCrashMessage: () => Option.Option<Message>;
  readonly getRunningCommands: () => Update.Commands<Message, R>;
  readonly getRunningCommandInvocations: () => ReadonlyArray<RuntimeCommand<Message, R>>;
  readonly dispose: (exit?: Exit.Exit<unknown, unknown>) => Effect.Effect<void>;
};
export type RuntimeCommand<Message, R> = Readonly<{
  readonly id: number | undefined;
  readonly command: Update.Commands<Message, R>[number];
}>;
export interface RuntimeObserver<Model, Message, R> {
  readonly recordInit: (model: Model, commands: Update.Commands<Message, R>) => ReadonlyArray<number>;
  readonly recordMessage: (message: Message, modelBeforeUpdate: Model, modelAfterUpdate: Model, commands: Update.Commands<Message, R>) => ReadonlyArray<number>;
  readonly recordCommandResult: (id: number, message: Message) => void;
}
export declare function makeRuntime<Model, Message, R>(program: Config<Model, Message, R>, initialModel: Model, observer?: RuntimeObserver<Model, Message, R>): Runtime<Model, Message, R>;
export declare function makeRuntime<Model, Message, R>(program: Program<Model, Message, R> & {
  readonly resources?: Layer.Layer<NoInfer<R>, never, never>;
}, initialModel: Model, observer?: RuntimeObserver<Model, Message, R>): Runtime<Model, Message, R>;
export declare function make<Model, Message, R = never>(config: Config<Model, Message, R>, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, Scope.Scope>;
export declare function make<Model, Message, R = never>(config: Program<Model, Message, R> & {
  readonly resources?: never;
}, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, R | Scope.Scope>;
export declare function boot<Model, Message, R = never>(config: Config<Model, Message, R>, init: Update.Return<Model, Message, R>): Store<Model, Message>;
export {};
```

## dist/store/subscriptions.d.ts

```ts
import { type Cause, Effect, Option, PubSub, Scope } from "effect";
import type * as Subscription from "foldkit/subscription";
interface SubscriptionHost<Model, Message, R> {
  readonly initialModel: Model;
  readonly modelPubSub: PubSub.PubSub<Model>;
  readonly fiberScope: Scope.Scope;
  readonly provideServices: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;
  readonly deliver: (message: Message) => void;
  readonly crash: (cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void;
}
export declare const forkSubscriptionFibers: <Model, Message, R>(subscriptions: Subscription.Subscriptions<Model, Message, R> | undefined, host: SubscriptionHost<Model, Message, R>) => Effect.Effect<void>;
export {};
```

## dist/submodel.d.ts

```ts
export * from "./submodel/public";
```

## dist/submodel/lift.d.ts

```ts
import { Option } from "effect";
import * as Update from "foldkit/update";
import { type ModelReader, type ModelSource } from "../modelSource/modelSource";
export interface Projection<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Model;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
export interface Lift<ParentModel, ParentMessage, Model, Message, FoldResult> extends Projection<ParentModel, ParentMessage, Model, Message> {
  readonly field: string;
  readonly write: (model: ParentModel, child: Model) => ParentModel;
  readonly fold: FoldResult;
}
type LiftUpdate<Model, Message, R> = (model: Model, message: Message) => Update.Return<Model, Message, R>;
type LiftUpdateWithOutMessage<Model, Message, OutMessage, R> = (model: Model, message: Message) => Update.ReturnWithOutMessage<Model, Message, OutMessage, R>;
export declare function lift<ParentModel>(): {
  <K extends keyof ParentModel & string, ParentMessage, Message, OutMessage, R = never, StepR = R, StepMessage = ParentMessage>(options: {
    readonly field: K;
    readonly update: LiftUpdateWithOutMessage<ParentModel[K], Message, OutMessage, R>;
    readonly toParentMessage: (message: Message) => ParentMessage;
    readonly foldOutMessage: (outMessage: OutMessage, context: Update.FoldContext<Message, ParentMessage>) => Update.Step<NoInfer<ParentModel>, StepMessage, StepR>;
  }): Lift<ParentModel, ParentMessage, ParentModel[K], Message, Update.Fold<ParentModel, ParentMessage | StepMessage, Message, R | StepR>>;
  <K extends keyof ParentModel & string, ParentMessage, Message, R = never>(options: {
    readonly field: K;
    readonly update: LiftUpdate<ParentModel[K], Message, R>;
    readonly toParentMessage: (message: Message) => ParentMessage;
  }): Lift<ParentModel, ParentMessage, ParentModel[K], Message, Update.Fold<ParentModel, ParentMessage, Message, R>>;
};
export interface OptionalProjection<ParentModel, ParentMessage, Model, Message> {
  readonly read: (model: ParentModel) => Option.Option<Model>;
  readonly toParentMessage: (message: Message) => ParentMessage;
}
export declare const project: <ParentModel, ParentMessage, Model, Message>(parent: ModelSource<ParentModel, ParentMessage>, { read, toParentMessage }: Projection<ParentModel, ParentMessage, Model, Message>) => ModelSource<Model, Message>;
export interface OptionalProjectionResult<Model, Message> {
  readonly source: () => Option.Option<ModelSource<Model, Message>>;
  readonly presence: ModelReader<boolean>;
}
export declare function projectOptional<ParentModel, ParentMessage, Model, Message>(parent: ModelSource<ParentModel, ParentMessage>, { read, toParentMessage }: OptionalProjection<ParentModel, ParentMessage, Model, Message>): OptionalProjectionResult<Model, Message>;
export {};
```

## dist/submodel/public.d.ts

```ts
export { define, ProviderError } from "./submodel";
export type { Config, ProviderProps, Submodel } from "./submodel";
export { lift } from "./lift";
export type { Lift, OptionalProjection, Projection } from "./lift";
```

## dist/submodel/submodel.d.ts

```ts
import { Schema } from "effect";
import React from "react";
import { type ModelHooks } from "../application/react";
import type { ModelSource } from "../modelSource";
import type { OptionalProjection, Projection } from "./lift";
export type ProviderProps<Model, Message, ParentModel = never, ParentMessage = never> = {
  readonly children?: React.ReactNode;
} & ({
  readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useSubmodel">;
  readonly lift: Projection<ParentModel, ParentMessage, Model, Message>;
  readonly optionalLift?: never;
  readonly fallback?: never;
  readonly source?: never;
} | {
  readonly from: Pick<ModelHooks<ParentModel, ParentMessage>, "useOptionalSubmodel">;
  readonly optionalLift: OptionalProjection<ParentModel, ParentMessage, Model, Message>;
  readonly fallback?: React.ReactNode;
  readonly lift?: never;
  readonly source?: never;
} | {
  readonly source: ModelSource<Model, Message>;
  readonly from?: never;
  readonly lift?: never;
  readonly optionalLift?: never;
  readonly fallback?: never;
});
export interface Submodel<Model, Message> extends ModelHooks<Model, Message> {
  readonly Provider: <ParentModel = never, ParentMessage = never>(props: ProviderProps<Model, Message, ParentModel, ParentMessage>) => React.ReactNode;
}
declare const ProviderError_base: Schema.Class<ProviderError, Schema.Struct<{
  readonly _tag: Schema.tag<"ProviderError">;
}>, import("effect/Cause").YieldableError>;
export declare class ProviderError extends ProviderError_base {
  get message(): string;
}
export interface Config<Model, Message> {
  readonly Model: Schema.Codec<Model, unknown, unknown, unknown>;
  readonly Message: Schema.Schema<Message>;
}
export declare function define<Model, Message>(config: Config<Model, Message>): Submodel<Model, Message>;
export {};
```

## dist/vite.d.ts

```ts
import type { PluginOption } from "vite";
export declare const devTools: () => PluginOption;
```

## dist/vite/devToolsPlugin.d.ts

```ts
import type { PluginOption } from "vite";
export declare const devToolsPlugin: () => PluginOption;
```

## dist/vite/devToolsRelay.d.ts

```ts
import type { Plugin } from "vite";
export declare const devToolsRelayPlugin: () => Plugin;
```

## eslint/dist/index.d.ts

```ts
import { Linter } from 'eslint';
declare const recommendedConfig: Linter.Config[];
declare const strictConfig: Linter.Config[];
export { recommendedConfig as default, recommendedConfig, strictConfig };
```
