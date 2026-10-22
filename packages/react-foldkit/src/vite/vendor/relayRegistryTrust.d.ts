import { Effect, FileSystem, Option } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
export type RelayRegistryInspection = Readonly<{
    directory: string;
    maybeRefusal: Option.Option<string>;
}>;
export type RelayRegistryTrust = Readonly<{
    inspect: (directory: string) => Effect.Effect<RelayRegistryInspection, never, ChildProcessSpawner.ChildProcessSpawner>;
}>;
type DirectoryInfo = Pick<FileSystem.File.Info, 'mode' | 'uid'>;
export declare const relayRegistryDirectoryRefusal: (info: DirectoryInfo, maybeCurrentUid: Option.Option<number>) => Option.Option<string>;
export declare const windowsDirectoryRefusal: (sddl: string, currentUserSid: string) => Option.Option<string>;
export declare const windowsDirectoryChainRefusal: (descriptors: ReadonlyArray<string>, currentUserSid: string) => Option.Option<string>;
export declare const powershellPath: (systemRoot: string) => string;
export declare const windowsTempRootRefusal: (directory: string, tempRoot: string) => Option.Option<string>;
export declare const probeWindowsDirectory: (maybeExecutable: Option.Option<string>, directory: string) => Effect.Effect<Option.Option<string>, never, ChildProcessSpawner.ChildProcessSpawner>;
export declare const relayRegistryTrust: RelayRegistryTrust;
export {};
//# sourceMappingURL=relayRegistryTrust.d.ts.map