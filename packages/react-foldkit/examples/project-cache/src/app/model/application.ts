import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodelProjection } from "react-foldkit/react"
import type * as Update from "react-foldkit/update"
import * as Project from "@/entities/project"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	CompletedLoadProject: { load: Project.Load },
	ClickedRefreshProject: { projectId: Schema.String },
})
export type Message = typeof Message.Type

const toProjectMessage = function (message: Project.Message) {
	return Message.GotProjectMessage({ message })
}

const projects = Project.query.lift<Model, Message>({
	field: "projects",
	toParentMessage: toProjectMessage,
})

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message }) => projects.fold(model, message),
		CompletedLoadProject: ({ load }) =>
			projects.settleIf(model, { projectId: load.projectId }, load.result, {
				fresher: function (incoming, current) {
					return incoming.revision > current.revision
				},
			}),
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init("projects") },
})

export const projectsProjection = defineSubmodelProjection({
	read: function (model: Model) {
		return model.projects
	},
	toParentMessage: toProjectMessage,
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
