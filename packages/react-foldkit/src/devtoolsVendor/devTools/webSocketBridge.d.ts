import { Effect, Option, Schema, Scope } from 'effect';
import { Request, Response } from './protocol.js';
import { type DevToolsStore } from './store.js';
type Hot = NonNullable<ImportMeta['hot']>;
/** HMR channel the bridge announces connection lifecycle events on. */
export declare const EVENT_CHANNEL = "foldkit:devTools:event";
/**
 * Start the browser-side WebSocket bridge that exposes a Foldkit runtime's
 * DevToolsStore to an external MCP server (via the Vite plugin relay).
 *
 * Emits `EventConnected` on startup so the relay tracks this runtime, and
 * again when the page is restored from the back/forward cache, whose freeze
 * closed the socket the relay was tracking it on. Listens on the request
 * channel for `RequestFrame`s targeted at this connection's id and replies
 * with the matching `ResponseFrame`. Emits `EventDisconnected` when the
 * runtime is disposed or its HMR module is replaced, so the relay can remove
 * this runtime from its connected set. A page that goes away for good takes
 * its socket with it, and the relay prunes on that close.
 *
 * `dispatch` delivers a Message to the runtime; the bridge
 * uses it to fulfill `RequestDispatchMessage` after decoding the payload
 * against a JSON-canonical derivation of `maybeMessageSchema` (via
 * `Schema.toCodecJson`). The derivation reconstructs runtime values like
 * `Option`, `Date`, `Map`, and `Set` from their JSON-tagged shapes, so
 * application Message Schemas using stdlib types Just Work over dispatch
 * without author-side changes. When `maybeMessageSchema` is `None`, dispatch
 * requests are rejected with an informative error.
 *
 * The bridge also derives a JSON Schema document from `maybeMessageSchema`
 * once at boot (via `Schema.toJsonSchemaDocument`) to fulfill
 * `RequestGetMessageSchema`, so MCP clients can discover the exact Message
 * shapes the runtime accepts without reading the application source. A few
 * AST nodes (symbol-keyed structs, symbol-indexed records, tuples with
 * post-rest elements) cause `Schema.toJsonSchemaDocument` to throw; the
 * derivation is guarded so a failure logs a warning and the schema-discovery
 * tool returns `None` rather than crashing the bridge.
 *
 * Production-safe: callers must check `import.meta.hot` is defined before
 * invoking this. The function assumes a live HMR connection.
 */
export declare const startWebSocketBridge: (store: DevToolsStore, hot: Hot, dispatch: (message: unknown) => Effect.Effect<void>, maybeMessageSchema: Option.Option<Schema.Codec<any, any>>) => Effect.Effect<void, never, Scope.Scope>;
/**
 * Fulfill one bridge Request against the DevTools store. `startWebSocketBridge`
 * wires this to the HMR request channel; exported so tests can drive request
 * handling without a live HMR connection.
 */
export declare const dispatchRequest: (store: DevToolsStore, dispatch: (message: unknown) => Effect.Effect<void>, maybeDispatchSchema: Option.Option<Schema.Codec<any, any>>, maybeJsonSchemaDocument: Option.Option<unknown>, request: Request) => Effect.Effect<Response>;
export {};
//# sourceMappingURL=webSocketBridge.d.ts.map