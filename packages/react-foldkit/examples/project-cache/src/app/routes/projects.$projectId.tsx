import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import * as ProjectDetails from "@/pages/project-details"
import * as Application from "../model/application"

export const Route = createFileRoute("/projects/$projectId")({
  loader: ({ params, abortController }) =>
    Effect.runPromise(ProjectDetails.load(params.projectId), {
      signal: abortController.signal,
    }),
  component: View,
})

function View() {
  const { projectId } = Route.useParams()
  const dispatch = Application.useDispatch()
  return (
    <ProjectDetails.View
      projectId={projectId}
      onRefresh={() => dispatch(Application.Message.ClickedRefreshProject({ projectId }))}
    />
  )
}
