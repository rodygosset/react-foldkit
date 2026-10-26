# Declaration snapshot

Generated from the build. Run docs:generate after an intentional API change and review this diff. Content hashes and JSDoc are omitted.

## dist/application.d.ts

```ts
export * from "./application/public";
```

## dist/application/hot.d.ts

```ts
export type Entry<Context, Provider, Instance> = {
  readonly Context: Context;
  readonly Provider: Provider;
  current: Readonly<{
    Instance: Instance;
    generation: number;
  }>;
};
export declare function defineKey(): string | undefined;
export declare const entry: <Context, Provider, Instance>(key: string) => Entry<Context, Provider, Instance> | undefined;
export declare function register<Context, Provider, Instance>(key: string, value: Entry<Context, Provider, Instance>): Entry<Context, Provider, Instance>;
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
export { define, SceneSourceTypeId } from "./react";
export type { Application, CrashConfig, CrashContext, ModelHooks, Options, ProviderProps, ReactivationContext, Send, } from "./react";
```

## dist/application/react.d.ts

```ts
import { Cause, Effect, Option, Schema } from "effect";
import type * as ManagedResource from "foldkit/managedResource";
import type { HostServices } from "../internal/managedResource";
import type * as Update from "foldkit/update";
import React from "react";
import type { ModelSource } from "../modelSource";
import type { Program } from "../program/program";
import type { OptionalProjection, Projection } from "../submodel/lift";
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
export type Options<Model, Message, R = never, MessageSchema extends Schema.Codec<Message, unknown> = Schema.Codec<Message>, Managed extends ManagedResource.ManagedResources<Model, Message> = {}> = Omit<ReactStore.Config<Model, Message, R, MessageSchema, Managed>, "update" | "subscriptions" | "managedResources" | "devTools"> & {
  readonly crash?: CrashConfig<Model, Message>;
  readonly validateInit?: boolean;
  readonly devTools?: ReactStore.Config<Model, Message, R, MessageSchema, Managed>["devTools"];
};
type OptionsArgument<Model, Message, R, MessageSchema extends Schema.Codec<Message, unknown>, Managed extends ManagedResource.ManagedResources<Model, Message>> = [HostServices<R, Managed>] extends [never] ? [options?: Options<Model, Message, R, MessageSchema, Managed>] : [options: Options<Model, Message, R, MessageSchema, Managed>];
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
export declare const SceneSourceTypeId: unique symbol;
export type SceneSourceTypeId = typeof SceneSourceTypeId;
export type SourceContext<Model, Message> = React.Context<Option.Option<ModelSource<Model, Message>>>;
export interface Application<Model, Message, R = never, HasInit extends boolean = false> extends ModelHooks<Model, Message> {
  readonly Provider: (props: ProviderProps<Model, Message, R, HasInit>) => React.ReactNode;
  readonly [SceneSourceTypeId]: SourceContext<Model, Message>;
}
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
type Tagged = {
  readonly _tag: string;
};
export declare function define<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Codec<Tagged, unknown>, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}>(program: Program<ModelSchema, MessageSchema, never, R, Managed> & {
  readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>;
}, ...options: OptionsArgument<ModelSchema["Type"], MessageSchema["Type"], R, MessageSchema, Managed>): Application<ModelSchema["Type"], MessageSchema["Type"], R, true>;
export declare function define<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Codec<Tagged, unknown>, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}>(program: Program<ModelSchema, MessageSchema, never, R, Managed>, ...options: OptionsArgument<ModelSchema["Type"], MessageSchema["Type"], R, MessageSchema, Managed>): Application<ModelSchema["Type"], MessageSchema["Type"], R>;
```

## dist/application/reactStore.d.ts

```ts
import type { Schema } from "effect";
import { Cause, Duration, Effect, Option, Result, Scope } from "effect";
import type * as ManagedResource from "foldkit/managedResource";
import type * as Update from "foldkit/update";
import type * as DevTools from "../devToolsIntegration";
import * as Store from "../store/store";
declare const ReactStoreTypeId: unique symbol;
export type ReactStoreTypeId = typeof ReactStoreTypeId;
export type ReactStore<Model, Message> = Readonly<{
  [ReactStoreTypeId]: ReactStoreTypeId;
  getModel: () => Model;
  readView: () => Model;
  getServerModel: () => Model;
  getCrash: () => Option.Option<Cause.Cause<unknown>>;
  getCrashMessage: () => Option.Option<Message>;
  subscribeCrash: (listener: () => void) => () => void;
  subscribe: (listener: () => void) => () => void;
  dispatch: (message: Message) => void;
  commit: (message: Message) => Result.Result<void, Store.CommitError>;
  activate: Effect.Effect<void, never, Scope.Scope>;
}>;
export interface ReactivationContext<Model, Message, R = never> {
  readonly model: Model;
  readonly interrupted: Update.Commands<Message, R>;
}
export type Config<Model, Message, R = never, MessageSchema extends Schema.Codec<Message, unknown> = Schema.Codec<Message>, Managed extends ManagedResource.ManagedResources<Model, Message> = {}> = Store.Config<Model, Message, R, Managed> & {
  readonly onReactivate?: (context: ReactivationContext<Model, Message, R>) => Message;
  readonly retainInactive?: Duration.Input;
  readonly restartInterrupted?: boolean | ((command: Update.Commands<Message, R>[number]) => boolean);
  readonly freezeModel?: boolean;
  readonly devTools?: DevTools.Config<MessageSchema>;
};
export declare function make<Model, Message extends {
  readonly _tag: string;
}, ModelSchema extends Schema.Codec<unknown, unknown> & {
  readonly Type: Model;
} = Schema.Codec<Model>, MessageSchema extends Schema.Codec<Message, unknown> = Schema.Codec<Message>, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(config: Config<Model, Message, R, MessageSchema, Managed>, init: Update.Return<Model, Message, R>, Model?: ModelSchema): ReactStore<Model, Message>;
export {};
```

## dist/application/selectionEquals.d.ts

```ts
import { Equivalence } from "effect";
export declare const selectionEquals: Equivalence.Equivalence<unknown>;
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
export type Config<MessageSchema extends Schema.Codec<unknown, unknown>> = false | (Omit<Exclude<DevToolsConfig, false>, "Message"> & {
  readonly Message?: MessageSchema;
});
export declare function makeObserver<ModelSchema extends Schema.Codec<unknown, unknown>, MessageSchema extends Schema.Codec<unknown, unknown>, R>(options: {
  readonly config: Exclude<Config<MessageSchema>, false>;
  readonly update: (model: ModelSchema["Type"], message: MessageSchema["Type"]) => {
    readonly model: ModelSchema["Type"];
  };
  readonly Model: ModelSchema;
  readonly freeze: (model: ModelSchema["Type"]) => ModelSchema["Type"];
  readonly readLive: () => ModelSchema["Type"];
  readonly dispatch: (message: MessageSchema["Type"]) => void;
}): Readonly<{
  readonly observer: Store.RuntimeObserver<ModelSchema["Type"], MessageSchema["Type"], R>;
  readonly install: Effect.Effect<void, never, import("effect").Scope.Scope>;
  readonly isPaused: () => boolean;
  readonly pausedModel: () => ModelSchema["Type"] | undefined;
  readonly subscribePause: (listener: () => void) => () => void;
}>;
```

## dist/devtools.d.ts

```ts
import type { DevToolsOverlay } from "foldkit/devtools-host";
import { type Hot } from "./devtoolsOverlay";
export declare function __configure(overlay: DevToolsOverlay, hot: Hot | undefined): () => void;
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
export declare function configure(overlayFactory: DevToolsOverlay, devServerHot: Hot | undefined): () => void;
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

## dist/internal/devToolsHost.d.ts

```ts
import type { makeObserver } from "../devToolsIntegration";
type MakeObserver = typeof makeObserver;
export declare function register(recorder: MakeObserver): () => void;
export declare const recorder: () => MakeObserver | undefined;
export {};
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

## dist/internal/managedResource.d.ts

```ts
import type * as ManagedResource from "foldkit/managedResource";
export type ManagedRegistration<Managed> = {
  readonly managedResources?: Managed;
} & ({} extends Managed ? {} : {
  readonly managedResources: Managed;
});
export type ManagedResourceRecord<Model, Message, Managed extends ManagedResource.ManagedResources<Model, Message>> = Managed & ManagedResource.ManagedResources<Model, Message>;
export type RequireManagedRecord<Managed> = {} extends NoInfer<Managed> ? {} : {
  readonly managedResources: NoInfer<Managed>;
};
export type WithManagedResources<Shape, Managed> = Omit<Shape, "managedResources"> & ManagedRegistration<Managed>;
type KeysRegisteringService<Requirement, Managed> = {
  [Key in keyof Managed]-?: Key extends string | number ? [Managed[Key]] extends [{
    readonly resource: infer Resource;
  }] ? [ManagedResource.ServiceOf<Resource>] extends [Requirement] ? Key : never : never : never;
}[keyof Managed];
type ServicesNotAlwaysRegistered<Requirements, Managed> = unknown extends Requirements ? Requirements : Managed extends unknown ? string extends keyof Managed ? Requirements : Requirements extends unknown ? [KeysRegisteringService<Requirements, Managed>] extends [never] ? Requirements : never : never : never;
type PossibleServices<Managed> = Managed extends unknown ? ManagedResource.ServicesOf<Managed> : never;
export type GuaranteedManagedServices<Managed> = Exclude<PossibleServices<Managed>, ServicesNotAlwaysRegistered<PossibleServices<Managed>, Managed>>;
export type HostServices<Requirements, Managed> = Exclude<Requirements, GuaranteedManagedServices<Managed>>;
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
import type * as ManagedResource from "foldkit/managedResource";
import type * as Subscription from "foldkit/subscription";
import type * as Update from "foldkit/update";
import type { ManagedRegistration, WithManagedResources } from "../internal/managedResource";
type Tagged = {
  readonly _tag: string;
};
interface ProgramFields<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, OutMessage = never, R = never> {
  readonly Model: ModelSchema;
  readonly Message: MessageSchema;
  readonly OutMessage?: Schema.Schema<OutMessage>;
  readonly init?: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>;
  readonly update: (model: ModelSchema["Type"], message: MessageSchema["Type"]) => Update.ReturnWithOutMessage<ModelSchema["Type"], MessageSchema["Type"], OutMessage, R>;
  readonly subscriptions?: Subscription.Subscriptions<ModelSchema["Type"], MessageSchema["Type"], R>;
}
export type Program<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, OutMessage = never, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}> = ProgramFields<ModelSchema, MessageSchema, OutMessage, R> & ManagedRegistration<Managed>;
type ApplicationProgram<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, R, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]>> = WithManagedResources<Omit<ProgramFields<ModelSchema, MessageSchema, never, R>, "OutMessage" | "update">, Managed> & {
  readonly OutMessage?: undefined;
  readonly update: (model: ModelSchema["Type"], message: MessageSchema["Type"]) => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>;
};
export declare function make<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, OutMessage, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}>(program: WithManagedResources<ProgramFields<ModelSchema, MessageSchema, OutMessage, R>, Managed> & {
  readonly OutMessage: Schema.Schema<OutMessage>;
}): Program<ModelSchema, MessageSchema, OutMessage, R, Managed>;
export declare function make<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}>(program: ApplicationProgram<ModelSchema, MessageSchema, R, Managed> & {
  readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>;
}): Program<ModelSchema, MessageSchema, never, R, Managed> & {
  readonly init: () => Update.Return<ModelSchema["Type"], MessageSchema["Type"], R>;
};
export declare function make<ModelSchema extends Schema.Constraint, MessageSchema extends Schema.Schema<Tagged>, R = never, Managed extends ManagedResource.ManagedResources<ModelSchema["Type"], MessageSchema["Type"]> = {}>(program: ApplicationProgram<ModelSchema, MessageSchema, R, Managed>): Program<ModelSchema, MessageSchema, never, R, Managed>;
export {};
```

## dist/program/public.d.ts

```ts
export { make } from "./program";
export type { Program } from "./program";
```

## dist/scene.d.ts

```ts
export * from "foldkit/scene";
export { scene, inside, getByRole, getAllByRole, role, all, click, doubleClick, contextMenu, pointerDown, pointerUp, hover, focus, blur, focusEnter, focusLeave, submit, change, changeFiles, dropFiles, type, typeContentEditable, beforeInput, keydown, } from "./scene/index";
```

## dist/scene/index.d.ts

```ts
import * as FoldkitScene from "foldkit/scene";
export * from "foldkit/scene";
export { getByRole, getAllByRole, role, all } from "./sceneQueries";
export declare const scene: typeof FoldkitScene.scene;
export declare const inside: typeof FoldkitScene.inside;
export { click, doubleClick, contextMenu, pointerDown, pointerUp, hover, focus, blur, focusEnter, focusLeave, submit, change, changeFiles, dropFiles, type, typeContentEditable, beforeInput, keydown, } from "./sceneInteractions";
```

## dist/scene/react.d.ts

```ts
import type { Application } from "../application/react";
import type { SceneView } from "./sceneView";
export declare const bindSceneView: <Model, Message, R, HasInit extends boolean>(application: Application<Model, Message, R, HasInit>, Component: React.ComponentType) => SceneView<Model, Message>;
```

## dist/scene/sceneBinding.d.ts

```ts
import React from "react";
import Reconciler from "react-reconciler";
import type { Scene as SceneNamespace } from "foldkit/test";
import { SceneSourceTypeId } from "../application/react";
import type { SourceContext } from "../application/react";
import type { ModelSource } from "../modelSource";
import type { HostContainer, HostElement, HostText } from "./sceneHost";
import type { SceneView } from "./sceneView";
type VNode = SceneNamespace.SceneSimulation<unknown, unknown>["html"];
export declare const BoundSceneViewTypeId: unique symbol;
export declare function bindSceneView<Model, Message>(application: {
  readonly [SceneSourceTypeId]: SourceContext<Model, Message>;
}, Component: React.ComponentType): SceneView<Model, Message>;
declare const renderer: Reconciler.Reconciler<HostContainer | HostElement, HostContainer | HostElement, HostText, HostElement | HostText, unknown, HostElement | HostText>;
type Renderer = typeof renderer;
export declare function runSceneInteraction<A>(callback: () => A): A;
interface RenderState {
  readonly container: HostContainer;
  readonly root: ReturnType<Renderer["createContainer"]>;
  readonly source: ModelSource<unknown, unknown>;
  element?: React.ReactElement;
  setInput: (model: unknown, dispatch: (message: unknown) => void) => void;
}
export interface SceneRenderSession {
  state?: RenderState;
}
export declare const createSceneRenderSession: () => SceneRenderSession;
export declare const isBoundSceneView: (view: unknown) => view is SceneView<unknown, unknown>;
export declare const isBoundSceneSimulation: (simulation: unknown) => boolean;
export declare function renderBoundSceneView<Model, Message>(view: Function, model: Model, dispatch: (message: Message) => void, session: SceneRenderSession): VNode | undefined;
export declare function disposeSceneRenderSession(session: SceneRenderSession): void;
type EventHandler = (event?: unknown) => void;
export declare function getSceneEventHandler(element: {
  readonly elm?: unknown;
}, eventName: string): EventHandler | undefined;
export {};
```

## dist/scene/sceneEvent.d.ts

```ts
import type React from "react";
import type { HostElement } from "./sceneHost";
export interface HostEvent extends Pick<React.SyntheticEvent, "type" | "defaultPrevented" | "preventDefault" | "stopPropagation" | "isDefaultPrevented" | "isPropagationStopped"> {
  readonly target: HostElement;
  currentTarget: HostElement;
}
export declare function sceneListeners(node: HostElement): Record<string, (event: HostEvent) => void>;
export declare function sceneEventNames(eventName: string, target: HostElement): ReadonlyArray<string>;
export declare function hostPath(target: HostElement): ReadonlyArray<HostElement>;
export declare function hasSceneListener(target: HostElement, eventName: string): boolean;
export type HostUpdate = {
  readonly _tag: "Value";
  readonly value: string;
} | {
  readonly _tag: "Files";
  readonly files: unknown;
} | {
  readonly _tag: "Text";
  readonly text: string;
};
export declare function dispatchSceneEvent(target: HostElement, eventName: string, fields: Readonly<Record<string, unknown>>, additionalEvents?: ReadonlyArray<string>): boolean;
export declare function hostFromElm(elm: unknown): HostElement | undefined;
```

## dist/scene/sceneHost.d.ts

```ts
import { Option } from "effect";
import type React from "react";
export interface HostProps extends Record<string, unknown> {
  readonly children?: React.ReactNode;
}
export interface HostText {
  text: string;
}
export type HostNamespace = "html" | "svg";
export interface HostElement {
  readonly namespace: HostNamespace;
  tag: string;
  readonly type: string;
  readonly name: string;
  readonly id: string;
  readonly dataset: Readonly<Record<string, string>>;
  props: HostProps;
  attributes: Record<string, string | null>;
  children: Array<HostElement | HostText>;
  parent?: HostElement;
  readonly tagName: string;
  value?: string;
  files?: unknown;
  checked?: boolean;
  selected?: boolean;
  selectSnapshot?: ReadonlyArray<HostElement>;
  textContent?: string;
  innerText?: string;
  focus: () => void;
  blur: () => void;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  closest: (selector: string) => HostElement | null;
  contains: (node: unknown) => boolean;
}
export interface HostContainer {
  children: Array<HostElement | HostText>;
}
export declare function hostString(value: unknown): string;
export declare const eventProps: Readonly<Record<string, string>>;
export declare const isTextInput: (node: HostElement) => boolean;
export declare const htmlAttributeName: (name: string, namespace?: HostNamespace) => string;
export type HostProp = {
  readonly _tag: "ClassList";
  readonly value: unknown;
} | {
  readonly _tag: "Style";
  readonly value: {
    readonly [key: string]: unknown;
  };
} | {
  readonly _tag: "Attribute";
  readonly reactName: string;
  readonly name: string;
  readonly value: string;
};
export declare function hostProp(name: string, value: unknown, namespace?: HostNamespace): Option.Option<HostProp>;
export declare function styleDeclarations(value: {
  readonly [key: string]: unknown;
}): Record<string, string>;
export declare function hostAttributes(node: HostElement): Record<string, string>;
```

## dist/scene/sceneInput.d.ts

```ts
import type { HostElement, HostText } from "./sceneHost";
export type Checkable = {
  readonly _tag: "Checkbox";
  readonly target: HostElement;
} | {
  readonly _tag: "Radio";
  readonly target: HostElement;
  readonly group: ReadonlyArray<HostElement>;
};
export type CheckedSnapshot = ReadonlyArray<readonly [HostElement, boolean]>;
export declare function snapshotChecked(checkable: Checkable): CheckedSnapshot;
export declare function assignChecked(checkable: Checkable): void;
export declare function revertChecked(snapshot: CheckedSnapshot): void;
export declare function syncSelect(node: HostElement, selection: unknown, fallback: boolean): void;
export declare function syncControlledFields(children: ReadonlyArray<HostElement | HostText>): void;
```

## dist/scene/sceneInteractions.d.ts

```ts
import * as FoldkitScene from "foldkit/scene";
export declare const click: typeof FoldkitScene.click;
export declare const doubleClick: typeof FoldkitScene.doubleClick;
export declare const contextMenu: typeof FoldkitScene.contextMenu;
export declare const pointerDown: typeof FoldkitScene.pointerDown;
export declare const pointerUp: typeof FoldkitScene.pointerUp;
export declare const hover: typeof FoldkitScene.hover;
export declare const focus: typeof FoldkitScene.focus;
export declare const blur: typeof FoldkitScene.blur;
export declare const focusEnter: typeof FoldkitScene.focusEnter;
export declare const focusLeave: typeof FoldkitScene.focusLeave;
export declare const submit: typeof FoldkitScene.submit;
export declare const change: typeof FoldkitScene.change;
export declare const changeFiles: typeof FoldkitScene.changeFiles;
export declare const dropFiles: typeof FoldkitScene.dropFiles;
export declare const type: typeof FoldkitScene.type;
export declare const typeContentEditable: typeof FoldkitScene.typeContentEditable;
export declare const beforeInput: typeof FoldkitScene.beforeInput;
export declare const keydown: typeof FoldkitScene.keydown;
```

## dist/scene/sceneQueries.d.ts

```ts
import * as FoldkitScene from "foldkit/scene";
export declare const getByRole: typeof FoldkitScene.getByRole;
export declare const getAllByRole: typeof FoldkitScene.getAllByRole;
export declare const role: typeof FoldkitScene.role;
export declare const all: typeof FoldkitScene.all;
```

## dist/scene/sceneSettle.d.ts

```ts
export declare const SceneRenderLimit = 100;
export declare function settleSimulation<Simulation>(simulation: Simulation, render: (simulation: Simulation) => readonly [Simulation, ReadonlyArray<unknown>], applyEffectMessage: (simulation: Simulation, message: unknown) => Simulation): Simulation;
```

## dist/scene/sceneView.d.ts

```ts
import type { Html, HtmlBuilder } from "foldkit/html";
export type SceneView<Model, Message> = (model: Model, html: HtmlBuilder<Message>) => Html;
```

## dist/scene/vendor/sceneCompat.d.ts

```ts
import { Option } from "effect";
export declare const FOLDKIT_MOUNT_KEY = "foldkitMount";
export declare const FileHandlerSymbol: unique symbol;
export declare const kebabToPascal: (input: string) => string;
export declare const tagNameFromSelector: (selector: string) => string;
export declare const serializedStylePropertyName: (name: string) => string;
export declare const StringExt: {
  stripPrefix: (prefix: string) => (input: string) => Option.None<string> | Option.Some<string>;
};
```

## dist/store.d.ts

```ts
export * from "./store/public";
```

## dist/store/managedResources.d.ts

```ts
import { type Cause, Context, Effect, Option, type PubSub, Ref, type Scope } from "effect";
import type * as ManagedResource from "foldkit/managedResource";
import type { GuaranteedManagedServices } from "../internal/managedResource";
export interface ManagedResourceRef<Model, Message> {
  readonly config: ManagedResource.ManagedResourceConfig<Model, Message>;
  readonly ref: Ref.Ref<Option.Option<unknown>>;
}
interface Host<Model, Message> {
  readonly initialModel: Model;
  readonly modelPubSub: PubSub.PubSub<Model>;
  readonly scope: Scope.Scope;
  readonly deliver: (message: Message) => void;
  readonly crash: (cause: Cause.Cause<unknown>, message: Option.Option<Message>) => void;
}
export declare const makeManagedResources: <Model, Message, Managed extends ManagedResource.ManagedResources<Model, Message>>(resources: Managed | undefined) => Effect.Effect<{
  context: Context.Context<GuaranteedManagedServices<Managed>>;
  start: (host: Host<Model, Message>) => Effect.Effect<void>;
}, never, never>;
export {};
```

## dist/store/public.d.ts

```ts
export { StoreTypeId, Disposed, Crashed, Inactive, Reentrant, CommitError, commit, takeWhen, make, boot } from "./store";
export type { Config, RuntimeProgram, Store } from "./store";
```

## dist/store/scheduler.d.ts

```ts
import { Scheduler } from "effect";
export declare const browserScheduler: Scheduler.MixedScheduler;
```

## dist/store/store.d.ts

```ts
import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema, Scope } from "effect";
import type * as ManagedResource from "foldkit/managedResource";
import type { ManagedResourceRecord, HostServices, RequireManagedRecord } from "../internal/managedResource";
import type * as Subscription from "foldkit/subscription";
import type * as Update from "foldkit/update";
export type RuntimeProgram<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}> = {
  update: (model: Model, message: Message) => Update.Return<Model, Message, R>;
  subscriptions?: Subscription.Subscriptions<Model, Message, R>;
  onCrash?: (cause: Cause.Cause<unknown>, triggeringMessage: Option.Option<Message>) => void;
  managedResources?: ManagedResourceRecord<Model, Message, Managed>;
} & RequireManagedRecord<ManagedResourceRecord<Model, Message, Managed>>;
export type Config<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}> = [
  HostServices<R, Managed>
] extends [never] ? RuntimeProgram<Model, Message, R, Managed> & {
  resources?: Layer.Layer<never, never, never>;
} : RuntimeProgram<Model, Message, R, Managed> & {
  resources: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>;
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
  readonly firstMessage: Option.Option<Message>;
}
export type Runtime<Model, Message, R> = Omit<Store<Model, Message>, "getRunningCommands" | "dispose"> & {
  readonly activate: (options: ActivateOptions<Message, R>) => Effect.Effect<void, never, Scope.Scope>;
  readonly getCrashMessage: () => Option.Option<Message>;
  readonly getRunningCommands: () => Update.Commands<Message, R>;
  readonly dispose: (exit?: Exit.Exit<unknown, unknown>) => Effect.Effect<void>;
};
export interface RuntimeObserver<Model, Message, R> {
  readonly recordInit: (model: Model, commands: Update.Commands<Message, R>) => void;
  readonly recordMessage: (message: Message, modelBeforeUpdate: Model, modelAfterUpdate: Model, commands: Update.Commands<Message, R>) => void;
  readonly adoptCommand: (command: Update.Commands<Message, R>[number]) => Update.Commands<Message, R>[number];
}
export declare function makeRuntime<Model, Message, R, Managed extends ManagedResource.ManagedResources<Model, Message>>(program: Config<Model, Message, R, Managed>, initialModel: Model, observer?: RuntimeObserver<Model, Message, R>): Runtime<Model, Message, R>;
export declare function makeRuntime<Model, Message, R, Managed extends ManagedResource.ManagedResources<Model, Message>>(program: RuntimeProgram<Model, Message, R, Managed> & {
  readonly resources?: Layer.Layer<NoInfer<HostServices<R, Managed>>, never, never>;
}, initialModel: Model, observer?: RuntimeObserver<Model, Message, R>): Runtime<Model, Message, R>;
export declare function make<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(config: Config<Model, Message, R, Managed>, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, Scope.Scope>;
export declare function make<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(config: RuntimeProgram<Model, Message, R, Managed> & {
  readonly resources?: never;
}, init: Update.Return<Model, Message, R>): Effect.Effect<Store<Model, Message>, never, HostServices<R, Managed> | Scope.Scope>;
export declare function boot<Model, Message, R = never, Managed extends ManagedResource.ManagedResources<Model, Message> = {}>(config: Config<Model, Message, R, Managed>, init: Update.Return<Model, Message, R>): Store<Model, Message>;
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
type Tagged = {
  readonly _tag: string;
};
export interface Config<ModelSchema extends Schema.Codec<unknown, unknown>, MessageSchema extends Schema.Schema<Tagged>> {
  readonly Model: ModelSchema;
  readonly Message: MessageSchema;
}
export declare function define<ModelSchema extends Schema.Codec<unknown, unknown>, MessageSchema extends Schema.Codec<Tagged, unknown>>(config: Config<ModelSchema, MessageSchema>): Submodel<ModelSchema["Type"], MessageSchema["Type"]>;
export {};
```

## dist/vite.d.ts

```ts
import type { PluginOption } from "vite";
export declare const devTools: () => PluginOption;
export declare const preserveModel: () => PluginOption;
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

## dist/vite/preserveModelPlugin.d.ts

```ts
import type { Plugin } from "vite";
export declare const preserveModelPlugin: () => Plugin;
```

## eslint/dist/index.d.ts

```ts
import { Linter } from 'eslint';
declare const recommendedConfig: Linter.Config[];
declare const strictConfig: Linter.Config[];
export { recommendedConfig as default, recommendedConfig, strictConfig };
```
