# Write for people

Every piece of prose in this repository follows this guide. That covers docs, READMEs, JSDoc, changesets, commit messages, pull request descriptions, review comments, and everything an agent writes to the maintainer during a coding session.

Write for someone who has never seen this code. They should understand each sentence the first time they read it.

## Say what changed and why it matters

Start with the point. For every change, finding, or feature, give two things:

1. **What.** What happens, or what changed, in plain words.
2. **Why.** Why a user, a caller, or the next maintainer should care.

Explain how it works only when the reader needs that to use it or review it.

```md
<!-- Not this -->
Refactored the recorder wiring to use a registry indirection.

<!-- This -->
Apps no longer ship DevTools code they don't use. The recorder now loads only when the
DevTools entry registers it, so a production bundle drops from 50 KB to 19 KB.
```

## Use plain words

- Use the word a developer would say out loud: "use", not "leverage". "Move", not "migrate over".
- Explain a term the first time you need it. "Hot reload, where Vite swaps in new code without reloading the page."
- Use the real name of a file, function, flag, or command, in code font: `Application.define`, `bun run check`.
- Call each thing by one name everywhere.
- Say who does what. "The Provider restores the Model", not "the Model is restored".
- Give numbers and behavior, not feelings. "A column rename fails the build", not "safer refactors".

## Keep sentences short

- One idea per sentence. Split a sentence that carries two.
- Mix short and longer sentences, so the text doesn't read like a list of fragments.
- Keep the small words that show structure: "the", "a", "that".
- Write whole sentences. No arrows, no dropped verbs, no symbol shorthand.

## Make it easy to scan

- Headings state the point and use sentence case: "Pin the Foldkit version", not "Versioning".
- Use a table to compare cases, and a numbered list for steps.
- Keep paragraphs to a few sentences.
- Put the common case first and the exceptions after.

## Show code where it helps

Code makes a claim concrete. Copy snippets from the real code, keep them short, and make sure they compile.

| Writing | Code snippets |
| --- | --- |
| Docs, READMEs, JSDoc examples | Yes, to show usage and behavior. |
| Pull request descriptions | Yes. Show the problem and the fix for each main change. |
| Review comments and findings | Yes. Show the code at fault and the fix. |
| Replies to the maintainer | Yes, when you explain a change or a finding. |
| Changesets | Inline code for names. A short block only for migration steps. |
| Commit messages | No. Name files and symbols in plain sentences. |

For a format this table doesn't list, add a snippet only when the reader would otherwise have to open the code to follow the point.

## Cut what sounds machine-written

These patterns make text harder to read. Remove them as you write.

- **Dashes.** No em dashes or en dashes as punctuation. End the sentence or use a comma.
- **Colons mid-sentence.** Use a colon only before a list, a table, or a code block.
- **Inflated words.** Delve, crucial, robust, seamless, leverage, utilize, facilitate, pivotal, landscape, showcase, underscore, ensure.
- **Fancy ways to say "is".** "Serves as", "stands as", "boasts". Say "is" or "has".
- **Filler.** "In order to" is "to". "It is important to note that" is nothing.
- **Hedging stacks.** "Could potentially possibly" is "may". State what you measured, inferred, or guessed.
- **Forced groups of three.** List the real number of things.
- **Metaphors for code.** "The plan holds it", "a north star", "scaffolding". Say what the code does.
- **Bold labels that repeat the line.** "**Speed:** speed improved" becomes a sentence.
- **Chat phrases.** "Great question", "I hope this helps", "Let me know if". Answer directly.
- **Decoration.** No emoji in headings or lists. Straight quotes only.

## Formats

### Commit messages

- A subject line in the imperative, under 72 characters: "Keep the Model when an application module hot reloads".
- A body that says what changed and why, in plain sentences wrapped at 72 characters.
- No code blocks, no logs, no lists of hashes.

### Pull request descriptions

A reviewer should get the point in under a minute.

1. One or two sentences on what the pull request does, or a short table of problem and fix.
2. One section per main change: the problem, the fix, and a snippet of each.
3. How you checked it: the commands you ran and the tests you added.

Link to long logs instead of pasting them.

### Replies to the maintainer

- Lead with the result.
- Keep it short, and keep the details the reader needs: choices you made, trade-offs, open questions.
- Back every claim with what you ran or read. Say when something is a guess.

### Docs

Pick one purpose per page: teach a first use, solve one task, describe an API, or explain a design. Don't mix them. The [JSDoc playbook](jsdocPlaybook.md) covers API comments.

## Sources

These rules adapt pstack's writing skills. Read them for the full lists:

- [unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md) removes machine-written patterns.
- [technical-writing](https://github.com/cursor/plugins/blob/main/pstack/skills/technical-writing/SKILL.md) sets the standard for docs, pull requests, and commit messages.
- [bro](https://github.com/cursor/plugins/blob/main/pstack/skills/bro/SKILL.md) restates text in plain language, with no jargon.
