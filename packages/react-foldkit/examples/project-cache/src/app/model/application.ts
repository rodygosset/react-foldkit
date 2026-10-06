import * as Project from "@/entities/project"
import * as Loader from "react-foldkit/loader"
import * as Command from "react-foldkit/command"
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

const toProjectMessage = (message: Project.Message) => Message.GotProjectMessage({ message })

const projects = Project.query.lift<Model, Message>({
	parentField: "projects",
	toParentMessage: toProjectMessage,
})

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message }) => projects.fold(model, message),
		CompletedLoadProject({ load }) {
			const { args, result } = load
			const settled = Loader.settleQueryIf(Project.query, model.projects, args, result, {
				fresher: (incoming, current) => incoming.revision > current.revision,
			})
			return {
				model: { ...model, projects: settled.model },
				commands: Command.mapMessages(settled.commands, toProjectMessage),
			}
		},
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init() },
})

export const projectsProjection = defineSubmodelProjection({
	read: (model: Model) => model.projects,
	toParentMessage: toProjectMessage,
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
