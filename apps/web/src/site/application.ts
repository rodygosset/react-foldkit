import { Effect, Layer } from "effect"
import * as Application from "react-foldkit/application"
import { getRouter } from "../router"
import { SiteNavigation, site } from "./program"

const navigation = Layer.succeed(SiteNavigation)({
	navigate: (href) => Effect.promise(() => getRouter().navigate({ href })),
})

/** The site Provider wraps every page. Its hooks read the theme and the menu. */
export const Site = Application.define(site, { resources: navigation })
