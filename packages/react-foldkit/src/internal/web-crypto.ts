import { Crypto, Effect, PlatformError } from "effect"

export const webCrypto = Crypto.make({
	randomBytes(size) {
		const bytes = new Uint8Array(size)
		for (let offset = 0; offset < size; offset += 65_536) {
			crypto.getRandomValues(bytes.subarray(offset, offset + 65_536))
		}
		return bytes
	},
	digest: (algorithm, data) =>
		Effect.map(
			Effect.tryPromise({
				try: () => crypto.subtle.digest(algorithm, new Uint8Array(data)),
				catch: (cause) =>
					PlatformError.systemError({
						module: "Crypto",
						method: "digest",
						_tag: "Unknown",
						description: "Could not compute digest",
						cause,
					}),
			}),
			(buffer) => new Uint8Array(buffer)
		),
})
