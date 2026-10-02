import { fromQuery } from "react-foldkit/loader"
import { query } from "../model/query"

export const Loader = fromQuery(query)
export type Load = typeof Loader.Load.Type
