import { Schema } from "effect"
import { Project } from "../model/project"
import * as Loader from "react-foldkit/loader"
import { query } from "../model/query"

export const loader = Loader.fromQuery(query, {
	name: "Project",
	args: { projectId: Schema.String },
	data: Project,
	error: Schema.String,
	key: ({ projectId }) => projectId,
})
export type Load = typeof loader.Load.Type
