import * as Notice from "@/entities/notice"
import { Option } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"

export const Model = Notice.Model
export type Model = Notice.Model

export const Message = defineMessageUnion({
	CompletedLoadNotice: { notice: Notice.Notice },
})
export type Message = typeof Message.Type

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
	Message.match(message, {
		CompletedLoadNotice: ({ notice }) => ({
			model: modifyFields(model, {
				notice: () => Option.some(notice),
			}),
		}),
	})

export const init = (): Update.Return<Model, Message> => ({
	model: Notice.empty(),
})

export const { Provider, useModel, useDispatch } = defineApplication({ Model, update })
