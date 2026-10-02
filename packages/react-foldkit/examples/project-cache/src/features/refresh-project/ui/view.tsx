import * as AsyncData from "react-foldkit/asyncData"
import * as Project from "@/entities/project"

export function View({ projectId, onRefresh }: {
  projectId: string
  onRefresh: () => void
}) {
  const result = Project.useModel(model => Project.query.read(model, { projectId }))
  return (
    <button disabled={AsyncData.isPending(result)} onClick={onRefresh}>
      Refresh project
    </button>
  )
}
