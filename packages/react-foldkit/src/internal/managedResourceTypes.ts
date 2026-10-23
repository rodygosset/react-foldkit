import type * as ManagedResource from "foldkit/managedResource"

export type ManagedRegistration<Managed> = {
	/**
	 * Resources whose lifetime follows the Model. Declare them with Foldkit's `ManagedResource.make`.
	 * A record supplies its services when it is present and its keys are known. A missing record, a
	 * record that may be absent, or a string-keyed dictionary does not. The host supplies those
	 * remaining services and releases registered resources on shutdown. Each activation owns separate
	 * live values. Lift a child's resources with `ManagedResource.lift`.
	 */
	readonly managedResources?: Managed
} & ({} extends Managed ? {} : { readonly managedResources: Managed })

// NoInfer keeps this check from becoming a second inference site for Managed.
export type RequireManagedRecord<Managed> =
	{} extends NoInfer<Managed> ? {} : { readonly managedResources: NoInfer<Managed> }

// `Omit` drops the conditional required field, so public inputs intersect this after `Omit`.
export type WithManagedResources<Shape, Managed> = Omit<Shape, "managedResources"> & ManagedRegistration<Managed>

// Drop a service only when this record is guaranteed to register it.
// A string index or an unknown service identity describes a record that may register nothing.
export type RemainingServices<Requirements, Managed> = string extends keyof Managed
	? Requirements
	: unknown extends ManagedResource.ServicesOf<Managed>
		? Requirements
		: Exclude<Requirements, ManagedResource.ServicesOf<Managed>>
