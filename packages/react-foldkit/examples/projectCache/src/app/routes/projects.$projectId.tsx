import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import * as ProjectDetails from "@/pages/projectDetails"
import * as Application from "../application"

export const Route = createFileRoute("/projects/$projectId")({
	component: View,
})

function View() {
	const { projectId } = Route.useParams()
	const dispatch = Application.useDispatch()
	React.useEffect(
		function openProject() {
			dispatch(Application.Message.OpenedProject({ projectId }))
		},
		[dispatch, projectId]
	)
	return (
		<ProjectDetails.View
			projectId={projectId}
			onRefresh={() => dispatch(Application.Message.ClickedRefreshProject({ projectId }))}
		/>
	)
}
