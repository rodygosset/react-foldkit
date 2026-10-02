import { Option } from "effect"
import { defineMessageUnion } from "react-foldkit/message"
import { defineApplication, defineSubmodelProjection } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import type * as Update from "react-foldkit/update"
import * as Notice from "@/entities/notice"

export const Model = Notice.Model
export type Model = Notice.Model

export const Message = defineMessageUnion({
	CompletedLoadNotice: { notice: Notice.Notice },
})
export type Message = typeof Message.Type

export const update = function (model: Model, message: Message): Update.Return<Model, Message> {
	return Message.match(message, {
		CompletedLoadNotice: function ({ notice }) {
			return {
				model: modifyFields(model, {
					notice: function () {
						return Option.some(notice)
					},
				}),
			}
		},
	})
}

export const init = (): Update.Return<Model, Message> => ({
	model: Notice.empty(),
})

export const noticeProjection = defineSubmodelProjection({
	read: function (model: Model) {
		return model
	},
	toParentMessage: function (message: never): Message {
		return message
	},
})

export const { Provider, useModel, useDispatch, SubmodelProvider } = defineApplication({ Model, update })
