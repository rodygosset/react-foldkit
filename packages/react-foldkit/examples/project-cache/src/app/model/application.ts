import { Option, Schema } from "effect"
import * as AsyncData from "react-foldkit/asyncData"
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

const projects = Project.query.lift<Model, Message>({
	field: "projects",
	toParentMessage: (message) => Message.GotProjectMessage({ message }),
})

const acceptProjectLoad = (model: Model, load: typeof Project.Load.Type): Update.Return<Model, Message> => {
	const current = Project.query.read(model.projects, {
		projectId: load.projectId,
	})

	if (AsyncData.isFailure(load.result)) {
		if (AsyncData.hasData(current) || AsyncData.isPending(current)) {
			return { model }
		}
		return projects.settle(model, { projectId: load.projectId }, load.result)
	}

	if (!AsyncData.isSuccess(load.result)) return { model }

	const maybeCurrent = AsyncData.getData(current)
	if (Option.isSome(maybeCurrent) && load.result.data.revision <= maybeCurrent.value.revision) {
		return { model }
	}

	return projects.settle(model, { projectId: load.projectId }, load.result)
}

export const update = (model: Model, message: Message) =>
	Message.match<Update.Return<Model, Message>>(message, {
		GotProjectMessage: ({ message }) => projects.fold(model, message),
		CompletedLoadProject: ({ load }) => acceptProjectLoad(model, load),
		ClickedRefreshProject: ({ projectId }) => projects.revalidateOrLoad(model, { projectId }),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: { projects: Project.query.init("projects") },
})

export const projectsProjection = defineSubmodelProjection({
	read: (model: Model) => model.projects,
	toParentMessage: (message: Project.Message) => Message.GotProjectMessage({ message }),
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
