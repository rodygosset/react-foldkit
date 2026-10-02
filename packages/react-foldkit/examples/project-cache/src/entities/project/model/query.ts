import { Effect, Schema } from "effect"
import { Query } from "react-foldkit"
import { Project } from "./project"

export const query = Query.define({
  name: "Project",
  args: { projectId: Schema.String },
  data: Project,
  error: Schema.String,
  execute: ({ projectId }) =>
    Effect.succeed(Project.make({
      id: projectId,
      revision: 1,
      name: "Website redesign",
      description: "Replace the company website before launch.",
    })),
})

export const Model = query.Model
export type Model = typeof Model.Type
export const Message = query.Message
export type Message = typeof Message.Type
