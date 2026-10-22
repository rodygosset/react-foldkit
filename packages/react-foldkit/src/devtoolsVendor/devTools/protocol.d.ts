import { Schema } from 'effect';
/** A serialized Command produced during a Message dispatch (or `init`). `args` is `Some` when the Command declared an args record. `maybeSubmodelPath` is `None` until the result Message resolves, `Some([])` for a top-level result, and `Some(tags)` for a Submodel-routed result. */
export declare const SerializedCommand: Schema.Struct<{
    readonly name: Schema.String;
    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
    readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
}>;
/** A serialized Command suitable for transmission over the WS protocol. */
export type SerializedCommand = typeof SerializedCommand.Type;
/** A serialized Mount lifecycle event (start or end). `args` is `Some` when the Mount's definition declared an args record, and carries the runtime values used to construct the MountAction instance. */
export declare const SerializedMount: Schema.Struct<{
    readonly name: Schema.String;
    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
}>;
/** A serialized Mount lifecycle event suitable for transmission over the WS protocol. */
export type SerializedMount = typeof SerializedMount.Type;
/** A serialized history entry as it appears on the wire. `submodelPath` lists `Got<Child>Message` wrapper tags from outer to inner when the entry came up through a Submodel chain; `maybeLeafTag` is `Some` with the innermost child Message tag when one exists. `mountStarts` lists Mounts that fired during the render after this Message; `mountEnds` lists Mounts whose elements were unmounted during that render. The Messages dispatched by mount Effects appear as their own entries elsewhere in history. */
export declare const SerializedEntry: Schema.Struct<{
    readonly index: Schema.Number;
    readonly tag: Schema.String;
    readonly message: Schema.Unknown;
    readonly commands: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
        readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
    }>>;
    readonly mountStarts: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
    }>>;
    readonly mountEnds: Schema.$Array<Schema.Struct<{
        readonly name: Schema.String;
        readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
    }>>;
    readonly timestamp: Schema.Number;
    readonly isModelChanged: Schema.Boolean;
    readonly changedPaths: Schema.$Array<Schema.String>;
    readonly affectedPaths: Schema.$Array<Schema.String>;
    readonly submodelPath: Schema.$Array<Schema.String>;
    readonly maybeLeafTag: Schema.OptionFromNullOr<Schema.String>;
}>;
/** A serialized history entry suitable for transmission over the WS protocol. */
export type SerializedEntry = typeof SerializedEntry.Type;
/** Metadata about a single keyframe. The index identifies the point in history where the runtime can replay back to. */
export declare const KeyframeInfo: Schema.Struct<{
    readonly index: Schema.Number;
}>;
/** Metadata about a single keyframe. */
export type KeyframeInfo = typeof KeyframeInfo.Type;
/** Metadata about a connected browser runtime. */
export declare const RuntimeInfo: Schema.Struct<{
    readonly connectionId: Schema.String;
    readonly url: Schema.String;
    readonly title: Schema.String;
}>;
/** Metadata about a connected browser runtime. */
export type RuntimeInfo = typeof RuntimeInfo.Type;
/** The largest batch `RequestDispatchMessages` accepts. Matches the DevTools store's default history size, so a batch cannot evict its own earliest entries before the caller reads them back. The runtime rejects a larger batch with `ResponseError`, and MCP clients reject it earlier still, at their own input boundary. */
export declare const MAX_DISPATCH_BATCH_SIZE = 100;
/** A request from the MCP server. The Vite plugin handles
 * `Request.RequestListRuntimes`; it forwards every other request to a browser
 * runtime. */
export declare const Request: import("../schema/index.js").TaggedUnion<{
    readonly RequestGetModel: {
        maybePath: Schema.OptionFromNullOr<Schema.String>;
        expand: Schema.Boolean;
    };
    readonly RequestGetModelAt: {
        index: Schema.Number;
        maybePath: Schema.OptionFromNullOr<Schema.String>;
        expand: Schema.Boolean;
    };
    readonly RequestListMessages: {
        limit: Schema.Number;
        maybeSinceIndex: Schema.OptionFromNullOr<Schema.Number>;
        maybeChangedPathsMatch: Schema.withDecodingDefault<Schema.OptionFromNullOr<Schema.$Array<Schema.String>>, never>;
        fromEnd: Schema.withDecodingDefault<Schema.Boolean, never>;
    };
    readonly RequestCountMessagesByTag: {
        maybeSinceIndex: Schema.OptionFromNullOr<Schema.Number>;
        maybeChangedPathsMatch: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
    };
    readonly RequestDiffModels: {
        fromIndex: Schema.Number;
        toIndex: Schema.Number;
        maybeChangedPathsMatch: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
    };
    readonly RequestGetMessage: {
        index: Schema.Number;
    };
    readonly RequestListKeyframes: {};
    readonly RequestReplayToKeyframe: {
        keyframeIndex: Schema.Number;
    };
    readonly RequestResume: {};
    readonly RequestDispatchMessage: {
        message: Schema.Unknown;
    };
    readonly RequestDispatchMessages: {
        messages: Schema.$Array<Schema.Unknown>;
    };
    readonly RequestListRuntimes: {};
    readonly RequestGetInit: {};
    readonly RequestGetRuntimeState: {};
    readonly RequestGetMessageSchema: {
        maybeVariantTag: Schema.OptionFromNullOr<Schema.String>;
    };
}>;
/** A request from the MCP server. */
export type Request = typeof Request.Type;
/** One row of a Message-tag histogram. */
export declare const MessageTagCount: Schema.Struct<{
    readonly tag: Schema.String;
    readonly count: Schema.Number;
}>;
/** One row of a Message-tag histogram. */
export type MessageTagCount = typeof MessageTagCount.Type;
/** The value on one side of a Model diff. `DiffValue.Present` carries the
 * value. `DiffValue.Absent` means the path does not exist on that side, which
 * keeps a missing path distinct from a path whose value is `null`. */
export declare const DiffValue: import("../schema/index.js").TaggedUnion<{
    readonly Absent: {};
    readonly Present: {
        value: Schema.Unknown;
    };
}>;
/** The value on one side of a Model diff path. */
export type DiffValue = typeof DiffValue.Type;
/** One changed path in a Model diff. `before` is the value at `fromIndex`, `after` the value at `toIndex`. */
export declare const ModelDiffChange: Schema.Struct<{
    readonly path: Schema.String;
    readonly before: import("../schema/index.js").TaggedUnion<{
        readonly Absent: {};
        readonly Present: {
            value: Schema.Unknown;
        };
    }>;
    readonly after: import("../schema/index.js").TaggedUnion<{
        readonly Absent: {};
        readonly Present: {
            value: Schema.Unknown;
        };
    }>;
}>;
/** One changed path in a Model diff. */
export type ModelDiffChange = typeof ModelDiffChange.Type;
/** One variant entry in a `MessageSchemaIndex`. `payloadFields` lists the variant's payload property names (excluding `_tag`); `unionFields` lists the subset of those properties whose schemas are themselves `_tag`-discriminated unions. A Submodel-wrapper variant always shows up with `unionFields: ['message']`, but the same flag also catches plain tagged-union value types like `UrlRequest = Internal | External`. Either way, the agent will need to pick a variant when filling these fields. */
export declare const MessageSchemaIndexEntry: Schema.Struct<{
    readonly tag: Schema.String;
    readonly payloadFields: Schema.$Array<Schema.String>;
    readonly unionFields: Schema.$Array<Schema.String>;
}>;
/** One variant entry in a `MessageSchemaIndex`. */
export type MessageSchemaIndexEntry = typeof MessageSchemaIndexEntry.Type;
/** A flat directory of every top-level Message variant the runtime accepts, designed to fit in an agent context regardless of Message-union size. Use the tag names to make a follow-up `RequestGetMessageSchema` with `maybeVariantTag` set to fetch the full JSON Schema for one variant. */
export declare const MessageSchemaIndex: Schema.Struct<{
    readonly variants: Schema.$Array<Schema.Struct<{
        readonly tag: Schema.String;
        readonly payloadFields: Schema.$Array<Schema.String>;
        readonly unionFields: Schema.$Array<Schema.String>;
    }>>;
}>;
/** A flat directory of every top-level Message variant. */
export type MessageSchemaIndex = typeof MessageSchemaIndex.Type;
/** The result of requesting the app's Message Schema. It is either a compact
 * index of Message variants or the JSON Schema document for one variant. */
export declare const MessageSchemaResult: import("../schema/index.js").TaggedUnion<{
    readonly MessageSchemaIndexResult: {
        index: Schema.Struct<{
            readonly variants: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly payloadFields: Schema.$Array<Schema.String>;
                readonly unionFields: Schema.$Array<Schema.String>;
            }>>;
        }>;
    };
    readonly MessageSchemaDocumentResult: {
        document: Schema.Unknown;
    };
}>;
/** The result of requesting the app's Message Schema. */
export type MessageSchemaResult = typeof MessageSchemaResult.Type;
/** A response replying to a Request. */
export declare const Response: import("../schema/index.js").TaggedUnion<{
    readonly ResponseModel: {
        value: Schema.Unknown;
        atPath: Schema.String;
        summarized: Schema.Boolean;
    };
    readonly ResponseMessages: {
        entries: Schema.$Array<Schema.Struct<{
            readonly index: Schema.Number;
            readonly tag: Schema.String;
            readonly message: Schema.Unknown;
            readonly commands: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
            }>>;
            readonly mountStarts: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            }>>;
            readonly mountEnds: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            }>>;
            readonly timestamp: Schema.Number;
            readonly isModelChanged: Schema.Boolean;
            readonly changedPaths: Schema.$Array<Schema.String>;
            readonly affectedPaths: Schema.$Array<Schema.String>;
            readonly submodelPath: Schema.$Array<Schema.String>;
            readonly maybeLeafTag: Schema.OptionFromNullOr<Schema.String>;
        }>>;
        maybeNextIndex: Schema.OptionFromNullOr<Schema.Number>;
    };
    readonly ResponseMessage: {
        entry: Schema.Struct<{
            readonly index: Schema.Number;
            readonly tag: Schema.String;
            readonly message: Schema.Unknown;
            readonly commands: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
            }>>;
            readonly mountStarts: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            }>>;
            readonly mountEnds: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            }>>;
            readonly timestamp: Schema.Number;
            readonly isModelChanged: Schema.Boolean;
            readonly changedPaths: Schema.$Array<Schema.String>;
            readonly affectedPaths: Schema.$Array<Schema.String>;
            readonly submodelPath: Schema.$Array<Schema.String>;
            readonly maybeLeafTag: Schema.OptionFromNullOr<Schema.String>;
        }>;
    };
    readonly ResponseMessageCounts: {
        counts: Schema.$Array<Schema.Struct<{
            readonly tag: Schema.String;
            readonly count: Schema.Number;
        }>>;
        totalCount: Schema.Number;
        scannedFromIndex: Schema.Number;
        scannedToIndex: Schema.Number;
    };
    readonly ResponseModelDiff: {
        fromIndex: Schema.Number;
        toIndex: Schema.Number;
        changes: Schema.$Array<Schema.Struct<{
            readonly path: Schema.String;
            readonly before: import("../schema/index.js").TaggedUnion<{
                readonly Absent: {};
                readonly Present: {
                    value: Schema.Unknown;
                };
            }>;
            readonly after: import("../schema/index.js").TaggedUnion<{
                readonly Absent: {};
                readonly Present: {
                    value: Schema.Unknown;
                };
            }>;
        }>>;
    };
    readonly ResponseKeyframes: {
        keyframes: Schema.$Array<Schema.Struct<{
            readonly index: Schema.Number;
        }>>;
    };
    readonly ResponseReplayed: {
        model: Schema.Unknown;
    };
    readonly ResponseResumed: {};
    readonly ResponseDispatched: {
        acceptedAtIndex: Schema.Number;
    };
    readonly ResponseDispatchedBatch: {
        acceptedAtIndices: Schema.$Array<Schema.Number>;
    };
    readonly ResponseRuntimes: {
        runtimes: Schema.$Array<Schema.Struct<{
            readonly connectionId: Schema.String;
            readonly url: Schema.String;
            readonly title: Schema.String;
        }>>;
    };
    readonly ResponseInit: {
        maybeModel: Schema.OptionFromNullOr<Schema.Unknown>;
        commands: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
        }>>;
        mountStarts: Schema.$Array<Schema.Struct<{
            readonly name: Schema.String;
            readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
        }>>;
    };
    readonly ResponseRuntimeState: {
        currentIndex: Schema.Number;
        startIndex: Schema.Number;
        totalEntries: Schema.Number;
        isPaused: Schema.Boolean;
        maybePausedAtIndex: Schema.OptionFromNullOr<Schema.Number>;
        hasInitModel: Schema.Boolean;
    };
    readonly ResponseMessageSchema: {
        maybeResult: Schema.OptionFromNullOr<import("../schema/index.js").TaggedUnion<{
            readonly MessageSchemaIndexResult: {
                index: Schema.Struct<{
                    readonly variants: Schema.$Array<Schema.Struct<{
                        readonly tag: Schema.String;
                        readonly payloadFields: Schema.$Array<Schema.String>;
                        readonly unionFields: Schema.$Array<Schema.String>;
                    }>>;
                }>;
            };
            readonly MessageSchemaDocumentResult: {
                document: Schema.Unknown;
            };
        }>>;
    };
    readonly ResponseError: {
        reason: Schema.String;
    };
}>;
/** A response replying to a Request. */
export type Response = typeof Response.Type;
/** A runtime lifecycle event used by the Vite plugin to track which browser tabs are connected. Not forwarded to MCP clients. */
export declare const Event: import("../schema/index.js").TaggedUnion<{
    readonly EventConnected: {
        runtime: Schema.Struct<{
            readonly connectionId: Schema.String;
            readonly url: Schema.String;
            readonly title: Schema.String;
        }>;
    };
    readonly EventDisconnected: {
        connectionId: Schema.String;
    };
}>;
/** A runtime lifecycle event. */
export type Event = typeof Event.Type;
/** A wire frame carrying a Request from the MCP server. The id is opaque, used only by the MCP server to correlate the matching Response. The maybeConnectionId routes the request to a specific runtime when present. */
export declare const RequestFrame: Schema.Struct<{
    readonly id: Schema.String;
    readonly maybeConnectionId: Schema.OptionFromNullOr<Schema.String>;
    readonly request: import("../schema/index.js").TaggedUnion<{
        readonly RequestGetModel: {
            maybePath: Schema.OptionFromNullOr<Schema.String>;
            expand: Schema.Boolean;
        };
        readonly RequestGetModelAt: {
            index: Schema.Number;
            maybePath: Schema.OptionFromNullOr<Schema.String>;
            expand: Schema.Boolean;
        };
        readonly RequestListMessages: {
            limit: Schema.Number;
            maybeSinceIndex: Schema.OptionFromNullOr<Schema.Number>;
            maybeChangedPathsMatch: Schema.withDecodingDefault<Schema.OptionFromNullOr<Schema.$Array<Schema.String>>, never>;
            fromEnd: Schema.withDecodingDefault<Schema.Boolean, never>;
        };
        readonly RequestCountMessagesByTag: {
            maybeSinceIndex: Schema.OptionFromNullOr<Schema.Number>;
            maybeChangedPathsMatch: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
        };
        readonly RequestDiffModels: {
            fromIndex: Schema.Number;
            toIndex: Schema.Number;
            maybeChangedPathsMatch: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
        };
        readonly RequestGetMessage: {
            index: Schema.Number;
        };
        readonly RequestListKeyframes: {};
        readonly RequestReplayToKeyframe: {
            keyframeIndex: Schema.Number;
        };
        readonly RequestResume: {};
        readonly RequestDispatchMessage: {
            message: Schema.Unknown;
        };
        readonly RequestDispatchMessages: {
            messages: Schema.$Array<Schema.Unknown>;
        };
        readonly RequestListRuntimes: {};
        readonly RequestGetInit: {};
        readonly RequestGetRuntimeState: {};
        readonly RequestGetMessageSchema: {
            maybeVariantTag: Schema.OptionFromNullOr<Schema.String>;
        };
    }>;
}>;
/** A wire frame carrying a Request from the MCP server. */
export type RequestFrame = typeof RequestFrame.Type;
/** A wire frame carrying a Response, correlated to a Request by id. */
export declare const ResponseFrame: Schema.Struct<{
    readonly id: Schema.String;
    readonly response: import("../schema/index.js").TaggedUnion<{
        readonly ResponseModel: {
            value: Schema.Unknown;
            atPath: Schema.String;
            summarized: Schema.Boolean;
        };
        readonly ResponseMessages: {
            entries: Schema.$Array<Schema.Struct<{
                readonly index: Schema.Number;
                readonly tag: Schema.String;
                readonly message: Schema.Unknown;
                readonly commands: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                    readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
                }>>;
                readonly mountStarts: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                }>>;
                readonly mountEnds: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                }>>;
                readonly timestamp: Schema.Number;
                readonly isModelChanged: Schema.Boolean;
                readonly changedPaths: Schema.$Array<Schema.String>;
                readonly affectedPaths: Schema.$Array<Schema.String>;
                readonly submodelPath: Schema.$Array<Schema.String>;
                readonly maybeLeafTag: Schema.OptionFromNullOr<Schema.String>;
            }>>;
            maybeNextIndex: Schema.OptionFromNullOr<Schema.Number>;
        };
        readonly ResponseMessage: {
            entry: Schema.Struct<{
                readonly index: Schema.Number;
                readonly tag: Schema.String;
                readonly message: Schema.Unknown;
                readonly commands: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                    readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
                }>>;
                readonly mountStarts: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                }>>;
                readonly mountEnds: Schema.$Array<Schema.Struct<{
                    readonly name: Schema.String;
                    readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                }>>;
                readonly timestamp: Schema.Number;
                readonly isModelChanged: Schema.Boolean;
                readonly changedPaths: Schema.$Array<Schema.String>;
                readonly affectedPaths: Schema.$Array<Schema.String>;
                readonly submodelPath: Schema.$Array<Schema.String>;
                readonly maybeLeafTag: Schema.OptionFromNullOr<Schema.String>;
            }>;
        };
        readonly ResponseMessageCounts: {
            counts: Schema.$Array<Schema.Struct<{
                readonly tag: Schema.String;
                readonly count: Schema.Number;
            }>>;
            totalCount: Schema.Number;
            scannedFromIndex: Schema.Number;
            scannedToIndex: Schema.Number;
        };
        readonly ResponseModelDiff: {
            fromIndex: Schema.Number;
            toIndex: Schema.Number;
            changes: Schema.$Array<Schema.Struct<{
                readonly path: Schema.String;
                readonly before: import("../schema/index.js").TaggedUnion<{
                    readonly Absent: {};
                    readonly Present: {
                        value: Schema.Unknown;
                    };
                }>;
                readonly after: import("../schema/index.js").TaggedUnion<{
                    readonly Absent: {};
                    readonly Present: {
                        value: Schema.Unknown;
                    };
                }>;
            }>>;
        };
        readonly ResponseKeyframes: {
            keyframes: Schema.$Array<Schema.Struct<{
                readonly index: Schema.Number;
            }>>;
        };
        readonly ResponseReplayed: {
            model: Schema.Unknown;
        };
        readonly ResponseResumed: {};
        readonly ResponseDispatched: {
            acceptedAtIndex: Schema.Number;
        };
        readonly ResponseDispatchedBatch: {
            acceptedAtIndices: Schema.$Array<Schema.Number>;
        };
        readonly ResponseRuntimes: {
            runtimes: Schema.$Array<Schema.Struct<{
                readonly connectionId: Schema.String;
                readonly url: Schema.String;
                readonly title: Schema.String;
            }>>;
        };
        readonly ResponseInit: {
            maybeModel: Schema.OptionFromNullOr<Schema.Unknown>;
            commands: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
                readonly maybeSubmodelPath: Schema.OptionFromNullOr<Schema.$Array<Schema.String>>;
            }>>;
            mountStarts: Schema.$Array<Schema.Struct<{
                readonly name: Schema.String;
                readonly args: Schema.OptionFromNullOr<Schema.$Record<Schema.String, Schema.Unknown>>;
            }>>;
        };
        readonly ResponseRuntimeState: {
            currentIndex: Schema.Number;
            startIndex: Schema.Number;
            totalEntries: Schema.Number;
            isPaused: Schema.Boolean;
            maybePausedAtIndex: Schema.OptionFromNullOr<Schema.Number>;
            hasInitModel: Schema.Boolean;
        };
        readonly ResponseMessageSchema: {
            maybeResult: Schema.OptionFromNullOr<import("../schema/index.js").TaggedUnion<{
                readonly MessageSchemaIndexResult: {
                    index: Schema.Struct<{
                        readonly variants: Schema.$Array<Schema.Struct<{
                            readonly tag: Schema.String;
                            readonly payloadFields: Schema.$Array<Schema.String>;
                            readonly unionFields: Schema.$Array<Schema.String>;
                        }>>;
                    }>;
                };
                readonly MessageSchemaDocumentResult: {
                    document: Schema.Unknown;
                };
            }>>;
        };
        readonly ResponseError: {
            reason: Schema.String;
        };
    }>;
}>;
/** A wire frame carrying a Response, correlated to a Request by id. */
export type ResponseFrame = typeof ResponseFrame.Type;
/** A wire frame carrying a runtime lifecycle event from the bridge to the Vite plugin. */
export declare const EventFrame: Schema.Struct<{
    readonly maybeConnectionId: Schema.OptionFromNullOr<Schema.String>;
    readonly event: import("../schema/index.js").TaggedUnion<{
        readonly EventConnected: {
            runtime: Schema.Struct<{
                readonly connectionId: Schema.String;
                readonly url: Schema.String;
                readonly title: Schema.String;
            }>;
        };
        readonly EventDisconnected: {
            connectionId: Schema.String;
        };
    }>;
}>;
/** A wire frame carrying a runtime lifecycle event. */
export type EventFrame = typeof EventFrame.Type;
/** Increment when the relay record's wire format changes. */
export declare const RELAY_RECORD_VERSION = 1;
/** Directory name under `XDG_RUNTIME_DIR` or the system temporary directory. */
export declare const RELAY_REGISTRY_DIRECTORY_NAME = "foldkit-devtools-relays";
/** Environment variable that sets the relay registry directory. */
export declare const RELAY_REGISTRY_DIRECTORY_VARIABLE = "FOLDKIT_DEVTOOLS_RELAY_DIRECTORY";
/**
 * Record published while a Vite relay listens. `root` selects the project;
 * `id` distinguishes a restarted relay from the one it replaced.
 */
export declare const RelayRecord: Schema.Struct<{
    readonly version: Schema.Literal<1>;
    readonly id: Schema.String;
    readonly root: Schema.String;
    readonly url: Schema.String;
    readonly pid: Schema.Number;
    readonly startedAt: Schema.Number;
}>;
/** Decoded record for a running DevTools MCP relay. */
export type RelayRecord = typeof RelayRecord.Type;
//# sourceMappingURL=protocol.d.ts.map