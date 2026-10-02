import { fromQuery } from "react-foldkit/loader"
import { query } from "../model/query"

export const Loader = fromQuery(query)
export const Load = Loader.Load
export type Load = typeof Load.Type
