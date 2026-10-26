# Build the docs site

This plan turns `apps/web` into a small docs site for React Foldkit. The maintainer settled every decision below in an interview. An agent can build v1 from this page without asking questions.

## Say what React Foldkit is for

The site speaks to React developers who want to move to Foldkit step by step. React Foldkit is a bridge to Foldkit, not a place to stay. A team stuck on React moves its state and side effects into Foldkit Programs now, and swaps the React views out later.

## Keep the site in `apps/web`

- `apps/web` becomes the site. It stays a TanStack Start app, prerendered to static HTML.
- The site is built with React Foldkit all the way through, so its source is a reference app.
- The existing demos keep their code and move under `/examples/*`.
- Deployment is out of scope for v1.

## Use these URLs

| URL | Page |
| --- | --- |
| `/` | Home |
| `/docs` | Redirects to the first guide |
| `/docs/$slug` | One guide, such as `/docs/routing` |
| `/examples` | The examples index |
| `/examples/$demo` | One demo, such as `/examples/todo` |

The old `/counter`-style URLs go away with no redirects, because nothing is public yet.

## Build the home page in five sections

1. **Hero.** The headline "Move your React app to Foldkit, one feature at a time." The subhead "React Foldkit runs Foldkit programs inside React. Move your state and side effects into Foldkit now, then swap React out when you're ready." A "Get started" button to the first guide and a "GitHub" button. The install command with a copy button. The experimental warning as one quiet line. On the right, a live counter and its source in two tabs, "Program" and "View".
2. **The migration path.** Three steps, each with a snippet:
   1. Wrap one feature in a Program.
   2. Move its logic out of components and into `update` and Commands.
   3. Swap the React view for a Foldkit view. The Program and its tests don't change.
3. **The four ideas.** Model, Message, `update`, and Commands as four cards that link to foldkit.dev.
4. **Examples.** A grid of the six demos.
5. **Footer.** "Built on Foldkit", GitHub, npm, and a note that the site is built with React Foldkit, with a link to its source.

The hero counter has a "+1" button and a "+1 in a second" button. The second one returns a Command, and the button shows a pending state while it waits.

## Render the guides from the package

The site renders the Markdown files in `packages/react-foldkit/docs` at build time, so they stay the only copy. The sidebar lists them in this order:

| Slug | Title | Source |
| --- | --- | --- |
| `get-started` | Get started | The package README, from "Install" to "Import Foldkit from Foldkit" |
| `tutorial` | Build a counter with Commands | `examples.md` |
| `move-to-foldkit` | Move to Foldkit | `moveToFoldkit.md`, a new guide |
| `routing` | Use a router | `routing.md` |
| `managed-resources` | Managed Resources | `managedResources.md` |
| `scene` | Test views with Scene | `scene.md` |
| `devtools` | Debug with Foldkit DevTools | `devtools.md` |

- Links between these guides become site links.
- Links to other files, such as `reference.md` and `architecture.md`, point to GitHub.
- Each guide ends with previous and next links.
- The new "Move to Foldkit" guide ships in the package. It shows which parts move unchanged (the Program, Messages, Commands, Scene tests) and which part changes (the view).

## Keep shown code real

- Every code panel on the home page comes from a real `.ts` or `.tsx` file in the site, imported as text and type-checked.
- Shiki highlights code at build time with the `github-light` and `github-dark` themes. The browser gets no highlighter.
- Each code block has a copy button in its top-right corner.

## Use React Foldkit for site state

- A site Program at the root owns the theme (light, dark, or system), the mobile menu, and copy-button feedback.
- Saving the theme and copying to the clipboard are Commands.
- The live counter is its own Program.
- Routing follows `packages/react-foldkit/docs/routing.md`. Views never call `navigate`.
- Scene tests cover the site Program.

## Look quiet and typographic

| Element | Choice |
| --- | --- |
| Fonts | Geist and Geist Mono, self-hosted from the `geist` package |
| Accent | Teal, `oklch(0.6 0.12 185)`, for links, the primary button, the active sidebar item, and focus rings |
| Surfaces | Flat white and near-black. 1px neutral borders, 6px radius, no shadows. `site-atmosphere` is removed |
| Motion | Color fades on hover only |
| Theme | Follows the system, with a light, dark, or system toggle in the header |

## Lay out the pages

- **Header.** Sticky, 56px tall. The wordmark "react-foldkit" in Geist Mono on the left. Docs, Examples, and GitHub links on the right, then the theme toggle.
- **Home.** Content up to 1120px wide.
- **Docs.** A 240px sidebar and a text column up to 720px. No "On this page" panel.
- **Phone, under 768px.** The sidebar becomes a menu opened from the header. The site Program owns whether it is open.
- **Titles.** Each page has a `<title>` such as "Routing · react-foldkit" and a meta description.

## Leave these out of v1

Search, versioned docs, a blog, a logo, analytics, social preview images, and deployment.

## Finish when all checks pass

1. `bun run check` passes from the repository root.
2. `bun run --filter=web build` prerenders every route to static HTML.
3. Scene tests cover the theme toggle, the mobile menu, and copy feedback.
4. The site works at 375px wide and in both themes.
5. Screenshots of home, a guide, and the examples page, in light and dark, at desktop and phone sizes.

The agent works on a branch, opens one pull request, and runs [the babysit skill](../../.claude/skills/babysit/SKILL.md) before handing it over.
