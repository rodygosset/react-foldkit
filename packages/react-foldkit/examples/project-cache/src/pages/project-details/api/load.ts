import { Effect } from "effect"
import * as Project from "@/entities/project"

export const load = (projectId: string) =>
  Project.query.run({ projectId }).pipe(
    Effect.map(result => ({ projectId, result })),
    Project.Loader.load,
  )
