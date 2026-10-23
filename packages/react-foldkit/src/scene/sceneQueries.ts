import * as FoldkitScene from "foldkit/scene"
import { hostFromElm } from "./sceneEvent"
import * as ReactQuery from "./vendor/query.js"

/**
 * Finds a role using React's rendered boolean attributes for bound views.
 * Foldkit views keep Foldkit's own query behavior.
 * @category testing
 * @since 0.2.0
 */
export const getByRole: typeof FoldkitScene.getByRole = function (roleValue, options) {
	const native = FoldkitScene.getByRole(roleValue, options)
	const bound = ReactQuery.getByRole(roleValue, options)
	return (html) => (hostFromElm(html.elm) === undefined ? native : bound)(html)
}

/**
 * Finds every matching role using React's rendered boolean attributes for bound views.
 * @category testing
 * @since 0.2.0
 */
export const getAllByRole: typeof FoldkitScene.getAllByRole = function (roleValue, options) {
	const native = FoldkitScene.getAllByRole(roleValue, options)
	const bound = ReactQuery.getAllByRole(roleValue, options)
	return (html) => (hostFromElm(html.elm) === undefined ? native : bound)(html)
}

/**
 * Locates a role with React boolean-attribute handling in bound views.
 * @category testing
 * @since 0.2.0
 */
export const role: typeof FoldkitScene.role = (roleValue, options) =>
	Object.assign(getByRole(roleValue, options), { description: FoldkitScene.role(roleValue, options).description })

/**
 * Creates Foldkit collection locators, with React boolean-attribute handling for `role`.
 * @category testing
 * @since 0.2.0
 */
export const all: typeof FoldkitScene.all = {
	...FoldkitScene.all,
	role: (roleValue, options) =>
		Object.assign(getAllByRole(roleValue, options), {
			description: FoldkitScene.all.role(roleValue, options).description,
		}),
}
