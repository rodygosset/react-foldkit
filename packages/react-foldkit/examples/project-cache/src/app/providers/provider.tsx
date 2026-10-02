import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import * as CommitSource from "react-foldkit/commitSource"
import * as TanStackSource from "react-foldkit/tanstack"
import * as Project from "@/entities/project"
import * as Application from "../model/application"

export function Provider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [source] = React.useState(() =>
    TanStackSource.make(router, [
      Project.Loader.pipe(
        CommitSource.mapMessages(load =>
          Application.Message.CompletedLoadProject({ load }),
        ),
      ),
    ]),
  )

  return (
    <Application.Provider init={Application.init()} commitSource={source}>
      <Application.SubmodelProvider
        projection={Application.projectsProjection}
        render={({ source }) => (
          <Project.Provider source={source}>{children}</Project.Provider>
        )}
      />
    </Application.Provider>
  )
}
