import * as Project from "@/entities/project"
import { Schema } from "effect"
import * as Command from "foldkit/command"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import * as Update from "foldkit/update"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	CompletedLoadProject: { load: Project.loader.Load },
	ClickedRefreshProject: { projectId: Schema.String },
})
export type Message = typeof Message.Type

const toProjectMessage = (message: Project.Message) => Message.GotProjectMessage({ message })

const project = Project.query.lift<Model, Message>({
	parentField: "projects",
	toParentMessage: toProjectMessage,
})

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message }) => project.fold(model, message),
		CompletedLoadProject({ load }) {
			const { args, result } = load
			const settled = Loader.settleQueryIf(Project.query, model.projects, args, result, {
				fresher: (incoming, current) => incoming.revision > current.revision,
			})
			return {
				model: modifyFields(model, { projects: () => settled.model }),
				commands: Command.mapMessages(settled.commands, toProjectMessage),
			}
		},
		ClickedRefreshProject: ({ projectId }) => project.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init() },
})

export const projects = Submodel.lift({
	read: (model: Model) => model.projects,
	toParentMessage: toProjectMessage,
})

export const Application = defineApplication({
	Model,
	update,
	// Query fetches are idempotent reads, so retry any that React Activity interrupted.
	restartInterrupted: true,
})
export const { Provider, useModel, useDispatch } = Application
