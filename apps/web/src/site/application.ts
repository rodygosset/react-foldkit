import * as Application from "react-foldkit/application"
import { site } from "./program"

/** The site Provider wraps every page. Its hooks read the theme, the menu, and copy feedback. */
export const Site = Application.define(site)
