import { Effect, FileSystem, Path, type PlatformError } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';
import { RelayRecord } from 'foldkit/devtools-protocol';
import { type RelayRegistryTrust } from './relayRegistryTrust.js';
type RelayRegistryServices = FileSystem.FileSystem | Path.Path;
export type RelayPublisherServices = RelayRegistryServices | ChildProcessSpawner.ChildProcessSpawner;
declare const RelayRegistryDirectoryRefused_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "RelayRegistryDirectoryRefused";
} & Readonly<A>;
export declare class RelayRegistryDirectoryRefused extends RelayRegistryDirectoryRefused_base<{
    readonly directory: string;
    readonly reason: string;
}> {
}
export declare const publishRelayRecord: (record: RelayRecord, trust: RelayRegistryTrust) => Effect.Effect<string, PlatformError.PlatformError | RelayRegistryDirectoryRefused, RelayPublisherServices>;
export declare const readRelayRecords: Effect.Effect<ReadonlyArray<RelayRecord>, never, RelayRegistryServices>;
export declare const retireRelayRecord: (id: string, directory: string) => Effect.Effect<void, PlatformError.PlatformError, RelayRegistryServices>;
export {};
//# sourceMappingURL=relayRegistry.d.ts.map