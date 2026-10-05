import * as Project from "@/entities/project"
import { Schema } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodelProjection } from "react-foldkit/react"
import type * as Update from "react-foldkit/update"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	CompletedLoadProject: { load: Project.loader.Load },
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
		CompletedLoadProject: function ({ load }) {
			const { result, ...args } = load
			return projects.settleIf(model, args, result, {
				fresher: function (incoming, current) {
					return incoming.revision > current.revision
				},
			})
		},
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init("projects") },
})

export const projectsProjection = defineSubmodelProjection({
	read: (model: Model) => model.projects,
	toParentMessage: toProjectMessage,
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
