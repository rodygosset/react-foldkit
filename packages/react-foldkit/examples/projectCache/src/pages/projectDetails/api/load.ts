import * as Project from "@/entities/project"

export const load = (projectId: string) =>
	Project.loader.loadQuery({ projectId })
