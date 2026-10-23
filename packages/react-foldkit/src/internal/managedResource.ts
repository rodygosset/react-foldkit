import type * as ManagedResource from "foldkit/managedResource"

export type ManagedRegistration<Managed> = {
	/**
	 * Resources whose lifetime follows the Model. Declare them with Foldkit's `ManagedResource.make`.
	 * A record supplies a service when its known entries guarantee that tag in every possible
	 * registration. A missing record, a record that may be absent, or a string-keyed dictionary does
	 * not. The host supplies remaining services and releases registered resources on shutdown.
	 * Each activation owns separate live values. Lift a child's resources with `ManagedResource.lift`.
	 */
	readonly managedResources?: Managed
} & ({} extends Managed ? {} : { readonly managedResources: Managed })

// Repeated once so Store.boot can infer Message from the record, and so the docs print one name.
export type ManagedResourceRecord<
	Model,
	Message,
	Managed extends ManagedResource.ManagedResources<Model, Message>,
> = Managed & ManagedResource.ManagedResources<Model, Message>

// NoInfer keeps this check from becoming a second inference site for Managed.
export type RequireManagedRecord<Managed> =
	{} extends NoInfer<Managed> ? {} : { readonly managedResources: NoInfer<Managed> }

// `Omit` drops the conditional required field, so public inputs intersect this after `Omit`.
export type WithManagedResources<Shape, Managed> = Omit<Shape, "managedResources"> & ManagedRegistration<Managed>

type KeysRegisteringService<Requirement, Managed> = {
	[Key in keyof Managed]-?: Key extends string | number
		? [Managed[Key]] extends [{ readonly resource: infer Resource }]
			? [ManagedResource.ServiceOf<Resource>] extends [Requirement]
				? Key
				: never
			: never
		: never
}[keyof Managed]

type ServicesNotAlwaysRegistered<Requirements, Managed> = unknown extends Requirements
	? Requirements
	: Managed extends unknown
		? string extends keyof Managed
			? Requirements
			: Requirements extends unknown
				? [KeysRegisteringService<Requirements, Managed>] extends [never]
					? Requirements
					: never
				: never
		: never

type PossibleServices<Managed> = Managed extends unknown ? ManagedResource.ServicesOf<Managed> : never

export type GuaranteedManagedServices<Managed> = Exclude<
	PossibleServices<Managed>,
	ServicesNotAlwaysRegistered<PossibleServices<Managed>, Managed>
>

export type HostServices<Requirements, Managed> = Exclude<Requirements, GuaranteedManagedServices<Managed>>
