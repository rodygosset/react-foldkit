export type * from "foldkit/update"
export { combine, foldChild, foldChildStep, refresh, withOutMessage } from "foldkit/update"
import type { Return } from "foldkit/update"

export const identity = <Model>(model: Model): Return<Model, never> => ({ model })
