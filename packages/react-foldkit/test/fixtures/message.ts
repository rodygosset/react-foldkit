import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

export const Message = defineMessageUnion({ SetValue: { value: Schema.Finite } })
export type Message = typeof Message.Type
