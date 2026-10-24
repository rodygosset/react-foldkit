---
name: babysit
description: Review a React Foldkit pull request against the Effect and Foldkit quality bar, fix what the review finds, and repeat until a fresh review finds nothing worth addressing. Use when asked to babysit, review and fix, or get a pull request ready.
---

# Babysit a pull request

Review the whole pull request, fix what is worth fixing, and repeat until a fresh review of the whole diff finds nothing left. Then post one summary comment.

## Know the pull request

Find these before you start, from the request or from GitHub:

- The pull request number and URL.
- The head branch and the base branch, usually `main`.

Stay on the head branch. Commit and push there. Don't open another pull request. Don't merge.

## Read before you review or edit

Fetch each skill and follow it. Don't guess what a skill says from its name.

| Skill | Use it for |
| --- | --- |
| [Thermo-nuclear code quality review](https://raw.githubusercontent.com/cursor/plugins/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review/SKILL.md) | The review rubric |
| [Poteto mode](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/poteto-mode/SKILL.md) | How to work and verify |
| [Unslop](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/unslop/SKILL.md) | Every comment, commit, and reply |
| [Bro](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/bro/SKILL.md) | Plain language |
| [Technical writing](https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/technical-writing/SKILL.md) | Docs, pull request text, and commit messages |
| [Deslop](https://raw.githubusercontent.com/cursor/plugins/main/cursor-team-kit/skills/deslop/SKILL.md) | A cleanup pass before each commit |

When poteto mode points to another skill, principle, or playbook, fetch it from `https://raw.githubusercontent.com/cursor/plugins/main/pstack/skills/<name>/SKILL.md` and read it before you apply it. [The pstack index](https://github.com/cursor/plugins/blob/main/pstack/README.md) lists them all.

Then read the repository rules:

- [`AGENTS.md`](../../../AGENTS.md), including [the writing guide](../../../docs/writing.md).
- [`docs/verification.md`](../../../docs/verification.md).
- [`packages/react-foldkit/docs/architecture.md`](../../../packages/react-foldkit/docs/architecture.md).

If you use subagents, run them on the current model or a cheaper one included in the maintainer's plan. Never use fast mode.

## Hold the quality bar

Apply the thermo-nuclear rubric to the whole pull request diff, not to your last commit. Be critical. Judge the diff against:

- **Effect.** Effect-native APIs and patterns, such as Scope for ownership, Layer for services, Schema at boundaries, and typed errors.
- **Foldkit.** The quality of Foldkit's own source. Reuse Foldkit's APIs and vocabulary instead of reinventing them.
- **Implementation.** The direct, obvious way to write the code. No wrappers, casts, or branches that don't earn their place.
- **Types.** Types that state the rule, with no optional fields or `unknown` hiding an invariant.
- **Tests.** Each test checks behavior a user of the package can observe, and fails if that behavior breaks.
- **Names.** File names follow the repository conventions. Runtime code and types say what they are.
- **Prose.** Docs, JSDoc, changesets, and commit messages follow [the writing guide](../../../docs/writing.md).

## Filter hard

Drop a finding when it:

- doesn't protect a real capability,
- only restyles working code,
- tests an external library instead of this package,
- or needs a made-up case to seem useful.

Keep a finding when:

- a caller can hit the bad behavior,
- a name says something false,
- a type hides the rule,
- or a test would still pass if the behavior it covers broke.

## Loop

Repeat until a fresh review of the whole diff finds nothing worth addressing.

1. Review `git diff origin/<base>...HEAD` with the rubric and the quality bar above.
2. Write your findings down for yourself first. For each one, say what is wrong, why a caller or the next reader should care, and the smallest fix. Use accurate snippets. If the list is empty, stop.
3. Fix the findings you still believe after you try the smaller form. If the smaller form fails a real test, keep the form that passes and note why. Don't keep retrying a simplification the tests reject.
4. Run the checks from `docs/verification.md` that cover what you changed. A typecheck alone is not enough when the change has runtime behavior. Run the deslop pass, then commit and push.
5. Review the whole pull request again from scratch. Don't review only the last commit, and don't treat your earlier notes as proof.

Stop when a fresh review finds nothing worth addressing. Also stop when the same finding comes back after two honest attempts and the tests reject the cleaner form. Say so plainly in the final report.

## Report once

When the loop ends, post one comment on the pull request. Don't comment on every pass. The comment and your reply to the maintainer follow [the writing guide](../../../docs/writing.md), so someone reading the pull request for the first time understands it.

- For each finding you fixed, say what was wrong and why, with the snippet you changed.
- If something is left, say what it is and which test rejected the cleaner form.
- If nothing is left, say that the pull request meets the Effect and Foldkit bar, and name the checks you ran.

Don't merge.
