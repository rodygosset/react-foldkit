import { Schema } from "effect"
import { defineMessageUnion } from "foldkit/message"

export const ValueMessage = defineMessageUnion({ SetValue: { value: Schema.Finite } })
export type ValueMessage = typeof ValueMessage.Type
export const setValue = (value: number): ValueMessage => ValueMessage.SetValue({ value })

export const TextMessage = defineMessageUnion({ SetText: { value: Schema.String } })
export type TextMessage = typeof TextMessage.Type
export const setText = (value: string): TextMessage => TextMessage.SetText({ value })
