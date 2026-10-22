import type { Effect } from 'effect'
import type { RelayRecord } from 'foldkit/devtools-protocol'

export declare const publishRelayRecord: (
  record: RelayRecord,
  trust: typeof import('./relayRegistryTrust.js').relayRegistryTrust,
) => Effect.Effect<string, Error>

export declare const retireRelayRecord: (
  id: string,
  directory: string,
) => Effect.Effect<void, Error>
