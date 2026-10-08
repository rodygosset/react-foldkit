import * as AsyncData from "react-foldkit/asyncData"
import * as Project from "@/entities/project"
import * as RefreshProject from "@/features/refreshProject"

export function View({ projectId, onRefresh }: {
  projectId: string
  onRefresh: () => void
}) {
  const result = Project.useModel(model => Project.query.read(model, { projectId }))
  return (
    <main>
      {AsyncData.matchData(result, {
        onEmpty: () => <p>Loading project…</p>,
        onFailure: error => <p role="alert">{error}</p>,
        onData: project => (
          <section><h1>{project.name}</h1><p>{project.description}</p></section>
        ),
      })}
      <RefreshProject.View projectId={projectId} onRefresh={onRefresh} />
    </main>
  )
}
