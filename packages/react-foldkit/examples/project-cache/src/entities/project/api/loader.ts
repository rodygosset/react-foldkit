import * as Loader from "react-foldkit/loader"
import { query } from "../model/query"

export const loader = Loader.fromQuery(query)
export type Load = typeof loader.Load.Type
