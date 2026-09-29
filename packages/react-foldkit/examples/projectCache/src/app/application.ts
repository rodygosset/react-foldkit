import * as Project from "@/entities/project"
import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import type * as Submodel from "react-foldkit/submodel"
import type * as Update from "foldkit/update"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	OpenedProject: { projectId: Schema.String },
	ClickedRefreshProject: { projectId: Schema.String },
})
export type Message = typeof Message.Type

const toProjectMessage = (message: Project.Message) => Message.GotProjectMessage({ message })

const projects = Project.query.lift<Model, Message>({
	parentField: "projects",
	toParentMessage: toProjectMessage,
})

/** Reads the project Query for the project Submodel Provider. */
export const projectsProjection: Submodel.Projection<Model, Message, Project.Model, Project.Message> = {
	read: (model) => model.projects,
	toParentMessage: toProjectMessage,
}

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message: projectMessage }) => projects.fold(model, projectMessage),
		OpenedProject: ({ projectId }) => projects.loadIfMissing(model, { projectId }),
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init() },
})

export const Application = defineApplication({
	Model,
	update,
	// Query fetches are idempotent reads, so retry any that React Activity interrupted.
	restartInterrupted: true,
})
export const { Provider, useModel, useDispatch } = Application
