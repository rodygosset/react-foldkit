import type { Effect, Option } from 'effect'

export declare const relayRegistryTrust: {
  readonly inspect: (
    directory: string,
  ) => Effect.Effect<
    {
      readonly directory: string
      readonly maybeRefusal: Option.Option<string>
    },
    Error
  >
}
