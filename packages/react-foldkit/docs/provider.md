# How the Provider runs a Program

A Provider is where React and a Foldkit Program meet. The Program decides what happens. The Provider decides when it runs, following React's lifecycle. This guide covers that lifecycle: when work starts and stops, how values reach the Program from React, and what happens when it fails.

The examples use the counter from [Get started](../README.md#run-a-program-in-react), plus a Command that increments it after one second. [Foldkit's Commands guide](https://foldkit.dev/core/commands) explains Commands themselves.

```ts
const WaitToIncrement = Command.define("WaitToIncrement", {
  messages: [Message.CompletedDelay],
  execute: Effect.sleep("1 second").pipe(Effect.as(Message.CompletedDelay())),
})
```

## Rendering runs nothing

During render, including server rendering, the Provider only computes the first Model from `init`. No Command, Subscription, or Managed Resource starts.

React may render a Provider more than once, or throw a render away. Keep `init` and `update` pure, so a repeated or abandoned render has no effect.

## The Provider runs work while it is mounted

- When React mounts the Provider in the browser, the Provider starts the Program's Managed Resources, then its init Commands and Subscriptions.
- When React unmounts the Provider, it stops all of that work. A Command still waiting, such as `WaitToIncrement`, never sends its Message.
- Each mounted Provider has its own Model. Two Providers of the same application don't share state.

## Choose what happens when React Activity hides the Provider

`<Activity mode="hidden">` hides a Provider without unmounting it. The Provider stops its work but keeps its Model. When Activity shows it again, the Provider starts from that Model.

Init Commands that were stopped start again, and init Commands that had finished don't run twice. For Commands that `update` returned, choose one of these options in `Application.define`:

| Option               | What happens to a stopped Command                                     | Use it for                                   |
| -------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `restartInterrupted` | It starts again                                                       | Work that is safe to repeat, such as a fetch |
| `onReactivate`       | The Provider passes it to you, and you return a Message for `update`  | Work you shouldn't repeat, such as a write   |
| `retainInactive`     | Nothing stops while the Provider stays hidden for less than this time | Quick hides, such as switching tabs          |

```ts
const Counter = Application.define(counter, {
  restartInterrupted: (command) => command.name === "WaitToIncrement",
})
```

Without any option, a stopped `WaitToIncrement` is dropped, and `update` never receives `CompletedDelay`.

## Send changing values with `useInbound`

The Provider reads `init` once, when it mounts. When a value from React keeps changing, such as a prop or a route parameter, send each change to `update` as a Message:

```tsx
function SyncStep({ step }: { readonly step: number }) {
  Counter.useInbound(step, (step) => Message.ChangedStep({ step }))
  return null
}
```

Render `SyncStep` inside the Provider, and put the first value in `init`. `useInbound` skips the first value and sends a Message only when the value changes.

Don't remount the Provider to pass a new value. Remounting throws away the Model and stops its Commands. [Use a router](routing.md) applies this to URLs.

## Give Commands their services

When Commands need a service, such as an API client, pass a Layer as `resources`:

```ts
const Cart = Application.define(cart, { resources: CartApi.layer })
```

The Layer must be complete: it can't require other services or fail. Services that the Program's [Managed Resources](managedResources.md) supply need no Layer.

Effect code that runs a Program without React can use `Store.make` from `react-foldkit/store` instead. It takes services from the surrounding Effect.

## Show something when the Program fails

When `update` or a Command fails, the Provider stops the Program and renders `crash.view` in place of its children. The view receives the failure, the Model at that moment, the Message that caused it, and `restart`, which mounts the Provider again from `init`.

```tsx
const Counter = Application.define(counter, {
  crash: {
    view: ({ cause, restart }) => (
      <div role="alert">
        <pre>{Cause.pretty(cause)}</pre>
        <button onClick={restart}>Start again</button>
      </div>
    ),
    report: ({ cause, message }) => Effect.logError("Counter crashed", message, cause),
  },
})
```

`report` runs in the background, for example to send the failure to a logging service. A Provider's own `crash` prop replaces either callback for that Provider. These options mirror [Foldkit's crash view](https://foldkit.dev/core/crash-view).
