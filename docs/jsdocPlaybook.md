# Write useful JSDoc

JSDoc helps a consumer choose an API and use it correctly without reading its implementation. Describe what the API is, why someone uses it, and the behavior the type cannot explain.

This package follows Effect's [declaration structure](../repos/effect/.agents/skills/jsdocs/declarations.md) and [example conventions](../repos/effect/.agents/skills/jsdocs/examples.md), with Foldkit's [plain prose style](../repos/foldkit/.agents/writing-prose.md).

## Decide what needs a comment

Document owned public exports. Let Foldkit reexports inherit their upstream comments. Do not copy those comments onto export specifiers or add JSDoc to internal helpers.

Document public members when their meaning, default, timing, or constraint needs explanation. That includes members inherited from an internal base type. Omit comments that repeat the member's name or type.

## Explain the contract

Read the implementation, tests, and a consumer call site before writing a guarantee.

Start functions with what they do, such as "Creates", "Decodes", or "Waits". Start data types with what they represent and what consumers use them for. A list of fields does not explain a Model.

Give the practical description first. Add only relevant facts.

- For Effects, distinguish construction from execution. Describe typed failures separately from defects, interruption, and synchronous throws. Explain required services and who releases resources.
- For React, explain the required Provider, initialization lifetime, selector equality, and optional-hook behavior where relevant. Say whether a Schema validates data or supplies inference.
- For Foldkit, explain Model transitions, Command execution, Subscription restarts, and cancellation when those affect callers.

Optional sections appear in this order. Omit a section that adds nothing.

1. `**When to use**` explains a use case or helps choose between related APIs.
2. `**Details**` explains defaults, ordering, timing, or ownership.
3. `**Gotchas**` states concrete constraints and failure modes.

Use Model, Message, Command, Subscription, and Submodel consistently. Describe public guarantees rather than private implementation details. Prefer "Commit returns before Commands finish" to "Commands execute asynchronously".

## Add metadata and links

Owned root declarations require `@category` and their introduction version in `@since`. Do not repeat those tags on members. Choose categories by purpose, using Effect's [category guidance](../repos/effect/.agents/skills/jsdocs/categories.md).

When applicable, tags follow this order.

| Tag           | Information                                            |
| ------------- | ------------------------------------------------------ |
| `@deprecated` | Replacement and migration condition                    |
| `@default`    | Verified member default, never a root or namespace tag |
| `@see`        | Related public API and why the relationship matters    |
| `@stability`  | Actual compatibility promise                           |
| `@category`   | Root declaration's purpose                             |
| `@since`      | Introduction version in this package                   |

Keep upstream release metadata in inherited docs. Do not add stability tags that the package has no policy to support. Effect's third-party exposure policy is not automatically this package's policy.

A `{@link Symbol}` must resolve to a public symbol. Use Markdown links for URLs. Omit automatic links to the containing module. Mention a symbol in backticks when navigation is unnecessary.

Do not repeat TypeScript types in JSDoc annotations. Parameter and return tags must add information beyond the signature. This package uses prose for typed failures and synchronous throws, following Effect's canonical declaration layout.

## Choose examples that teach usage

Examples are optional. Error classes have none. When useful, show error handling beside the operation that produces the error.

Use a titled `**Example** (Use case)` section with one TypeScript fence. Titles must be unique within a comment. Use public imports, simple local names, and only the setup needed to understand the call. Use `modifyFields` for Model field changes in updates. Each additional example must teach something different.

Stop once the example demonstrates the intended use. Do not add loading, decoding, or result inspection to a construction example. Omit unused declarations, inspection expressions, and comments that repeat inferred types. Keep explicit types only where inference needs them or they define the application's Model and Messages.

Use ordinary `ts` or `tsx` fences. Examples are illustrative, not automatically executed. If an illustration spans modules, name each file before its code and make each module valid independently. Avoid unexplained variables, ellipses, constructor-only demonstrations, and assertions that merely show a symbol exists.

For asynchronous Effects, use `Effect.runPromise` at the host boundary. Use `Effect.runSync` only for synchronous work. Finish cleanup. Coordinate concurrency with Effect rather than sleeps or mutable flags. Show data-first and data-last calls together only when that distinction is the lesson.

A short member needs no template.

```ts
/** Reads the current Model without dispatching a Message. */
getModel: () => Model
```

## Review and verify

Read the comment as an editor tooltip without its module. Remove repetition, generic praise, and sentences that could describe any library. Keep familiar words, complete sentences, and conditions beside the behavior they change.

Follow [the verification guide](verification.md#update-documentation-and-api-records) to build and regenerate docs. Check example imports against the built package and verify any claimed outcome. Markdown fences need separate verification.

`check:docs` checks owned metadata, tag and section order, example titles, error-class examples, public symbol links, and copied upstream comments. It checks local documentation links. It does not judge prose quality or prove examples work.
