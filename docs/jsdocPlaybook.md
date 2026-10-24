# Write useful JSDoc

A JSDoc comment helps someone pick an API and use it correctly without reading its code. Say what the API is, why someone would use it, and what it does that the type can't show. The prose follows [the writing guide](writing.md).

The structure follows Effect's [declaration layout](../repos/effect/.agents/skills/jsdocs/declarations.md) and [example conventions](../repos/effect/.agents/skills/jsdocs/examples.md), and Foldkit's [prose style](../repos/foldkit/.agents/writing-prose.md).

## Choose what to document

- Document every public export this package owns.
- Don't reexport Foldkit APIs, and don't document internal helpers.
- Document a public member when its meaning, default, timing, or limits need explaining. That includes members inherited from an internal base type.
- Skip a comment that only repeats the member's name or type.

## Explain the contract

Read the code, its tests, and a real call site before you promise anything.

- Start a function's comment with what it does: "Creates", "Decodes", "Waits".
- Start a type's comment with what it represents and what callers use it for. A list of fields doesn't explain a Model.
- Give the practical description first, then only the facts that matter.

Some facts matter for each library:

| Library | Explain |
| --- | --- |
| Effect | When the Effect is built versus when it runs. Typed failures, kept apart from defects, interruption, and thrown errors. The services it needs, and who releases its resources. |
| React | Which Provider a hook needs, how long initialization lives, how selectors compare values, and what optional hooks return. Whether a Schema checks data or only supplies types. |
| Foldkit | How the Model changes, when Commands run, when Subscriptions restart, and what cancellation does to callers. |

Add these sections only when they say something, in this order:

1. `**When to use**` gives a use case or helps choose between related APIs.
2. `**Details**` covers defaults, ordering, timing, or ownership.
3. `**Gotchas**` states real limits and ways the call can fail.

Use the words Model, Message, Command, Subscription, and Submodel the same way everywhere. Describe what callers can rely on, not private internals. Write "Commit returns before Commands finish", not "Commands execute asynchronously".

## Add tags and links

Every exported declaration needs `@category` and `@since`, with the version that introduced it. Members don't repeat them. Pick a category by purpose, using Effect's [category guide](../repos/effect/.agents/skills/jsdocs/categories.md).

Tags go in this order when a comment has them:

| Tag | What it holds |
| --- | --- |
| `@deprecated` | The replacement, and when to switch |
| `@default` | A member's checked default value. Never on a root declaration or namespace |
| `@see` | A related public API, and why it is related |
| `@stability` | A compatibility promise the package actually makes |
| `@category` | What the declaration is for |
| `@since` | The package version that introduced it |

- Keep Foldkit's and Effect's release tags on comments inherited from them. Don't add stability tags the package has no policy for.
- A `{@link Symbol}` must point to a public symbol. Use Markdown links for URLs. Write a symbol in backticks when the reader doesn't need to jump to it.
- Don't repeat types in JSDoc. A `@param` or `@returns` tag must add something the signature doesn't say. Describe typed failures and thrown errors in prose.

## Write examples that teach

Examples are optional, and error classes never have one. When an operation can fail, show the error handling next to it.

- Use a titled `**Example** (Use case)` section with one `ts` or `tsx` fence. Each title is unique within the comment.
- Use public imports, short local names, and only the setup the call needs. Use `modifyFields` to change Model fields in an update.
- Stop once the example shows the use. Don't add loading, decoding, or result checks to an example about construction.
- Leave out unused declarations, comments that repeat inferred types, and `...` placeholders. Keep explicit types only where inference needs them, or where they define the app's Model and Messages.
- If an example spans files, name each file before its code, and make each file valid on its own.
- Run asynchronous Effects with `Effect.runPromise` at the edge of the app. Use `Effect.runSync` only for synchronous work. Coordinate concurrency with Effect, not sleeps or mutable flags.
- Each extra example must teach something new.

A short member needs no template:

```ts
/** Reads the current Model without dispatching a Message. */
getModel: () => Model
```

## Check the result

Read each comment as an editor tooltip, without the rest of the file. Cut repetition, praise, and any sentence that could describe another library.

Then build and regenerate the docs, as [verification](verification.md#update-the-api-docs) describes. Compile the examples' imports against the built package, and check any outcome an example claims.

`check:docs` checks tags and their order, section order, example titles, error-class examples, links to public symbols, comments copied from upstream, and local doc links. It doesn't judge the prose or run the examples.
