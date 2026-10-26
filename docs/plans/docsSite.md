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

| URL               | Page                               |
| ----------------- | ---------------------------------- |
| `/`               | Home                               |
| `/docs`           | Redirects to the first guide       |
| `/docs/$slug`     | One guide, such as `/docs/routing` |
| `/examples`       | The examples index                 |
| `/examples/$demo` | One demo, such as `/examples/todo` |

The old `/counter`-style URLs go away with no redirects, because nothing is public yet.

## Build the home page as five scenes

The home page reads like a product page and tells one story with one feature, a store's cart. Each scene is one heading, one sentence, and one visual. Text sits left aligned on a 1120px rail, and hairlines separate the scenes.

1. **Hero.** On the left: "v0.1 · experimental" as a quiet link to the changelog, the headline "Leave React one feature at a time.", one sentence, a "Get started" button, a "GitHub" link, and `npm install react-foldkit` with a copy button that copies the full command. On the right, one code window with three tabs: `program.ts` (the cart's Program), `cart.tsx` (its React view), and `view.ts` (its Foldkit view). A footer line under each tab says what that file is for.
2. **"Your logic moves first."** A sticky stage shows the store's features. As the reader scrolls, Cart turns into a Foldkit Program first, then Checkout, Search, and Profile, with one caption per step.
3. **"Then the view."** The cart's React view next to its Foldkit view.
4. **"Tested the same way."** The import lines of the cart's real Scene test, with the one line that changes when the cart moves to Foldkit.
5. **"Start with one feature."** The install command, "Get started", a link to the Move to Foldkit guide, and the three imports a team uses while it moves, each linked to its guide.

The examples live on `/examples`, linked from the nav.

## Render the guides from the package

The site renders the Markdown files in `packages/react-foldkit/docs` at build time, so they stay the only copy. The sidebar lists them in this order:

| Slug                | Title                               | Source                                                          |
| ------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `get-started`       | Get started                         | The package README, from "What React Foldkit is" to "Read next" |
| `provider`          | How the Provider runs a Program     | `provider.md`                                                   |
| `submodels`         | Give child Programs their own hooks | `submodels.md`                                                  |
| `move-to-foldkit`   | Move to Foldkit                     | `moveToFoldkit.md`                                              |
| `routing`           | Use a router                        | `routing.md`                                                    |
| `managed-resources` | Managed Resources                   | `managedResources.md`                                           |
| `scene`             | Test views with Scene               | `scene.md`                                                      |
| `devtools`          | Debug with Foldkit DevTools         | `devtools.md`                                                   |
| `limitations`       | Limitations                         | `limitations.md`                                                |

- Links between these guides become site links.
- Links to other files, such as `reference.md` and `architecture.md`, point to GitHub.
- Each guide ends with previous and next links.
- The new "Move to Foldkit" guide ships in the package. It shows which parts move unchanged (the Program, Messages, Commands, Scene tests) and which part changes (the view).

## Keep shown code real

- Every code panel on the home page comes from a real `.ts` or `.tsx` file in the site, imported as text and type-checked. The one exception is the import lines in scene four, which repeat the start of the cart's Scene test.
- Shiki highlights code at build time. Dark mode uses Shiki's `vesper` theme. Light mode uses `foldkit-light`, built from Foldkit's colors. The browser gets no highlighter.
- Each code block has a copy button in its top-right corner.

## Use React Foldkit for site state

- A site Program at the root owns the theme (light, dark, or system), the phone menu, copy-button feedback, and the hero's selected file.
- Saving the theme and copying to the clipboard are Commands.
- The live counter is its own Program.
- Routing follows `packages/react-foldkit/docs/routing.md`. Views never call `navigate`.
- Scene tests cover the site Program.

## Look minimal and crisp

| Element    | Choice                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fonts      | Geist and Geist Mono, self-hosted. The hero headline is about 54px and scene headings about 36px, weight 600, with tight tracking. Body text is 16 to 17px                                                                                       |
| Surfaces   | Neutral and flat: white or near-black backgrounds, cards one step off, 1px hairline borders, a 12px radius, and no shadows, glows, or textures                                                                                                   |
| Color      | Color appears where it means something: syntax highlighting, the diff, and the moved features in scene two. The hues are Foldkit's: View blue, Message violet, `update` amber, Model teal, Command coral, defined as `--c-view` to `--c-command` |
| Code       | Vesper in dark mode, and `foldkit-light` built from Foldkit's colors in light mode                                                                                                                                                               |
| Navigation | A floating glass pill, the only floating element. The theme button cycles system, light, and dark                                                                                                                                                |
| Motion     | Scenes rise in as they enter, and scene two runs on CSS scroll-driven animations. All motion stops under `prefers-reduced-motion`                                                                                                                |

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
3. Scene tests cover the theme button, the phone menu, copy feedback, and the cart.
4. The site works at 375px wide and in both themes.
5. Screenshots of home, a guide, and the examples page, in light and dark, at desktop and phone sizes.

The agent works on a branch, opens one pull request, and runs [the babysit skill](../../.claude/skills/babysit/SKILL.md) before handing it over.
