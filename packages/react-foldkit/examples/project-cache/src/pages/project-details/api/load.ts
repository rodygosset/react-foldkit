import * as Loader from "react-foldkit/loader"
import * as Project from "@/entities/project"

export const load = (projectId: string) =>
	Loader.loadQuery(Project.ProjectLoader, Project.query, { projectId })
