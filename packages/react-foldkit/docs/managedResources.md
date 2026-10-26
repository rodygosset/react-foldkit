# Managed Resources under a Provider

A Managed Resource is a Foldkit feature. It is a resource, such as a Worker, a camera stream, or a socket, that exists only while the Model asks for it. [Foldkit's Managed Resources guide](https://foldkit.dev/core/managed-resources) explains how to declare one, and how it starts, stops, and reaches Commands.

React Foldkit runs Managed Resources as Foldkit defines them. This guide covers what a React Provider adds. It shows where to declare them, when they start and stop, and which services they supply.

## Declare them on the Program

Import `ManagedResource` from `foldkit`, declare the record as Foldkit's guide shows, and pass it to `Program.make`:

```ts
import * as Application from "react-foldkit/application"
import * as Program from "react-foldkit/program"

const program = Program.make({ Model, Message, init, update, managedResources })

export const App = Application.define(program)
```

The same Program then runs its resources in React Foldkit, in Foldkit's runtime, and in a `Store`.

## When resources start and stop

- Server rendering and React renders that get thrown away start nothing.
- When the Provider mounts in the browser, it reads the current Model and starts resources before it starts init Commands.
- When the Provider unmounts or React Activity hides it, the Provider stops Commands and Subscriptions first, then managed resources, then the services from its `resources` Layer.
- When Activity shows the Provider again, it starts fresh resources from the kept Model. With `retainInactive`, a short hide stops nothing.
- Each Provider holds its own resources, even when two Providers declare the same tag.

After a Provider stops, it drops the start and stop Messages of that activation, so they can't change a kept or disposed Model.

## Which services a record supplies

A registered resource supplies its service to Commands and Subscriptions, so the `resources` Layer doesn't have to. That holds only when TypeScript can see the record's keys:

| `managedResources` is                   | Supplies its services              |
| --------------------------------------- | ---------------------------------- |
| A record with known keys                | Yes                                |
| A value that may be `undefined`         | No                                 |
| A record typed as `Record<string, ...>` | No                                 |
| A choice between records or tags        | Only the services every choice has |

Build the Program with `Program.make`, so its type keeps the registered tags. Any other service goes in the `resources` Layer, which must be complete, as [How the Provider runs a Program](provider.md#give-commands-their-services) explains.

## Resources of child Programs

Register a child's resources on the parent Program with Foldkit's `ManagedResource.lift`, or combine records with `ManagedResource.aggregate`. A Submodel Provider owns no resources of its own. Unmounting a child's React view doesn't stop a resource while the child is still in the parent's Model.
