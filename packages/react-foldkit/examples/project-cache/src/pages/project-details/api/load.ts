import * as Project from "@/entities/project"

export const load = (projectId: string) =>
	Project.Loader.loadQuery({ projectId })
