import * as Project from "@/entities/project"
import { Array, HashMap, Schema } from "effect"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import * as Loader from "react-foldkit/loader"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import * as Submodel from "react-foldkit/submodel"
import * as Update from "react-foldkit/update"

export const Model = Schema.Struct({ projects: Project.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
	GotProjectMessage: { message: Project.Message },
	CompletedLoadProject: { load: Project.loader.Load },
	ResumedApplication: {},
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
		ResumedApplication: () =>
			Update.combine(
				model,
				Array.map(
					Array.filter(Array.fromIterable(HashMap.values(model.projects.entries)), (entry) =>
						AsyncData.isPending(entry.data)
					),
					({ args }) =>
						(current: Model) =>
							project.replace(current, args)
				)
			),
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

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({
	Model,
	update,
	onReactivate: () => Message.ResumedApplication(),
})
