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

## Build the home page as five scenes

The home page reads like a product page. Each scene has one headline, one sentence, and one thing to look at. Text sits left aligned on a 1120px rail, and visuals run full width under it.

1. **Hero.** A split layout. On the left, left aligned: the headline "Leave React one feature at a time.", one sentence, a "Get started" pill, a "GitHub" link, and `npm install react-foldkit` in a glass pill that copies the full command. On the right, a live card shows the Foldkit loop as a ring. The count in the center is the View, and Message, `update`, and Model sit on the ring. Each Message sends one teal dot clockwise around the ring, lighting each node as it passes. The delayed increment branches to a Command that shows it is running. "View the code" opens the counter's source in a sheet.
2. **"Your logic moves first."** A sticky stage shows an app as four features. As the reader scrolls, each feature turns from React state into a Foldkit Program, with one caption per step.
3. **"Then the view."** The same cart Program with a React view and a Foldkit view, side by side.
4. **"Tested the same way."** One large diff that changes `react-foldkit/scene` to `foldkit/scene`.
5. **"Start with one feature."** The install command, "Get started", and a link to the Move to Foldkit guide.

The examples live on `/examples`, linked from the nav. The diagram's labels link Message, `update`, Model, and Command to foldkit.dev.

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

- Every code panel on the home page comes from a real `.ts` or `.tsx` file in the site, imported as text and type-checked. The one exception is the single import line in scene four.
- Shiki highlights code at build time with the `github-light` and `github-dark` themes. The browser gets no highlighter.
- Each code block has a copy button in its top-right corner.

## Use React Foldkit for site state

- A site Program at the root owns the theme (light, dark, or system), the phone menu, the code sheet, and copy-button feedback.
- Saving the theme and copying to the clipboard are Commands.
- The live counter is its own Program.
- Routing follows `packages/react-foldkit/docs/routing.md`. Views never call `navigate`.
- Scene tests cover the site Program.

## Look like a product page

| Element | Choice |
| --- | --- |
| Fonts | Geist and Geist Mono, self-hosted. Headlines at 80 to 100px, weight 600, tracking -0.045em |
| Color | Dark first, near-black background, lit by neutral light only: a soft top-left light and a faint grid behind the hero card. Teal, `oklch(0.6 0.12 185)`, appears only where it means something: the diagram's dot and pulses, the running Command, and status dots |
| Surfaces | Large surfaces have a 20 to 32px radius, a 1px border at 10% foreground, and a faint inner highlight. Buttons are pills |
| Navigation | A floating glass pill. The theme button cycles system, light, and dark |
| Motion | Scenes rise in as they enter. Scene two runs on CSS scroll-driven animations. All motion stops under `prefers-reduced-motion` |
| Theme | Follows the system until the reader picks one |

## Lay out the pages

- **Nav.** A floating pill 16px from the top. On phones it keeps the wordmark, the theme button, and a menu that opens as a glass card.
- **Home.** Content up to 1120px wide, with generous space between scenes.
- **Docs.** A 240px sidebar and a text column up to 720px. No "On this page" panel.
- **Titles.** Each page has a `<title>` such as "Routing · react-foldkit" and a meta description.

## Leave these out of v1

Search, versioned docs, a blog, a logo, analytics, social preview images, and deployment.

## Finish when all checks pass

1. `bun run check` passes from the repository root.
2. `bun run --filter=web build` prerenders every route to static HTML.
3. Scene tests cover the theme button, the phone menu, the code sheet, and copy feedback.
4. The site works at 375px wide and in both themes.
5. Screenshots of home, a guide, and the examples page, in light and dark, at desktop and phone sizes.

The agent works on a branch, opens one pull request, and runs [the babysit skill](../../.claude/skills/babysit/SKILL.md) before handing it over.
