import { Effect, HashMap, HashSet, Option, SubscriptionRef } from 'effect';
export declare const INIT_INDEX = -1;
export type DiffResult = Readonly<{
    changedPaths: HashSet.HashSet<string>;
    affectedPaths: HashSet.HashSet<string>;
}>;
export declare const emptyDiff: DiffResult;
export declare const computeDiff: (previous: unknown, current: unknown) => DiffResult;
export type CommandRecord = Readonly<{
    id: number;
    name: string;
    args?: Record<string, unknown>;
    maybeSubmodelPath: Option.Option<ReadonlyArray<string>>;
}>;
export type MountRecord = Readonly<{
    name: string;
    args?: Record<string, unknown>;
}>;
export type HistoryEntry = Readonly<{
    tag: string;
    message: unknown;
    commands: ReadonlyArray<CommandRecord>;
    mountStarts: ReadonlyArray<MountRecord>;
    mountEnds: ReadonlyArray<MountRecord>;
    timestamp: number;
    isModelChanged: boolean;
    diff: DiffResult;
}>;
export type StoreState = Readonly<{
    entries: ReadonlyArray<HistoryEntry>;
    keyframes: HashMap.HashMap<number, unknown>;
    maybeInitModel: Option.Option<unknown>;
    initCommands: ReadonlyArray<CommandRecord>;
    initMountStarts: ReadonlyArray<MountRecord>;
    startIndex: number;
    isPaused: boolean;
    pausedAtIndex: number;
    maybeLatestModel: Option.Option<unknown>;
}>;
export type Bridge = Readonly<{
    replay: (model: unknown, message: unknown) => unknown;
    render: (model: unknown) => Effect.Effect<void>;
    markRenderPending: Effect.Effect<void>;
}>;
/**
 * The absolute index of the most recently recorded entry, or `INIT_INDEX`
 * when no Messages have been recorded yet.
 */
export declare const latestEntryIndex: (state: StoreState) => number;
/**
 * The absolute index the next recorded entry will land at. `recordMessage`
 * assigns indices from this formula, so dispatch predictions derived from it
 * match where entries are actually recorded.
 */
export declare const nextEntryIndex: (state: StoreState) => number;
/**
 * Options for `createDevToolsStore`.
 *
 * - `maxEntries`: Maximum number of history entries to retain before evicting the oldest segment. Defaults to 100.
 * - `keyframeInterval`: Number of recorded entries between full model snapshots. Smaller values use more memory but make time-travel a constant-time lookup instead of a replay. Set to `1` to snapshot every entry, which keeps time-travel correct under exclusion-from-history (since excluded Messages are never replayed). Defaults to 31.
 */
export type CreateDevToolsStoreOptions = Readonly<{
    maxEntries?: number;
    keyframeInterval?: number;
}>;
export declare const createDevToolsStore: (bridge: Bridge, options?: CreateDevToolsStoreOptions) => Effect.Effect<DevToolsStore>;
export type DevToolsStore = Readonly<{
    recordInit: (model: unknown, commands: ReadonlyArray<CommandRecord>, mountStarts?: ReadonlyArray<MountRecord>) => Effect.Effect<void>;
    recordMessage: (message: Readonly<{
        _tag: string;
    }>, modelBeforeUpdate: unknown, modelAfterUpdate: unknown, commands: ReadonlyArray<CommandRecord>, isModelChanged: boolean) => Effect.Effect<void>;
    recordResolvedCommand: (id: number, submodelPath: ReadonlyArray<string>) => Effect.Effect<void>;
    updateLatestModel: (model: unknown) => Effect.Effect<void>;
    attachRenderedMounts: (mountStarts: ReadonlyArray<MountRecord>, mountEnds: ReadonlyArray<MountRecord>) => Effect.Effect<void>;
    getModelAtIndex: (index: number) => Effect.Effect<unknown>;
    getMessageAtIndex: (index: number) => Effect.Effect<Option.Option<unknown>>;
    getDiffAtIndex: (index: number) => Effect.Effect<DiffResult>;
    jumpTo: (index: number) => Effect.Effect<unknown>;
    resume: Effect.Effect<void>;
    clear: Effect.Effect<void>;
    stateRef: SubscriptionRef.SubscriptionRef<StoreState>;
}>;
//# sourceMappingURL=store.d.ts.map