import { Schema } from "effect"
import * as CommitSource from "react-foldkit/commitSource"
import { query } from "../model/query"

export const Load = Schema.Struct({
  projectId: Schema.String,
  result: query.Model.fields.slots.value.fields.data,
})

export const Loader = CommitSource.define({
  name: "Project",
  data: Load,
  key: ({ projectId }) => projectId,
})
