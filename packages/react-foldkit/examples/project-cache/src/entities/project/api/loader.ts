import * as Loader from "react-foldkit/loader"
import { query } from "../model/query"

export const ProjectLoader = Loader.defineFromQuery(query)
export const Load = ProjectLoader.Load
export type Load = typeof Load.Type
