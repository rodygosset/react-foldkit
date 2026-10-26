import { BrowserKeyValueStore } from "@effect/platform-browser"
import { Effect, Layer } from "effect"
import { KeyValueStore } from "effect/persistence"
import * as Application from "react-foldkit/application"
import { getRouter } from "../router"
import { SiteNavigation, site } from "./program"

/**
 * `layerLocalStorage` reads `localStorage` while it builds, and that throws when the browser blocks
 * storage. The memory store keeps the theme button working until the page reloads.
 */
const themeStorage = BrowserKeyValueStore.layerLocalStorage.pipe(Layer.catchCause(() => KeyValueStore.layerMemory))

const navigation = Layer.succeed(SiteNavigation)({
	navigate: (href) => Effect.promise(() => getRouter().navigate({ href })),
})

/** The site Provider wraps every page. Its hooks read the theme and the menu. */
export const Site = Application.define(site, { resources: Layer.mergeAll(themeStorage, navigation) })
