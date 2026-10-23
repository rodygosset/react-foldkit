import type * as ManagedResource from "foldkit/managedResource"

// A widened record has unknown service identities. It cannot prove that any requirement is supplied.
export type RemainingServices<Requirements, Managed> =
	unknown extends ManagedResource.ServicesOf<Managed>
		? Requirements
		: Exclude<Requirements, ManagedResource.ServicesOf<Managed>>
