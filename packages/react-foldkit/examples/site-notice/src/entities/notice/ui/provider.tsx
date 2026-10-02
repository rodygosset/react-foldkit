import { defineSubmodel } from "react-foldkit/react"
import type { Model } from "../model/notice"

/** Notice entity has no local Messages; bindings type Message as never. */
export const { useModel, useDispatch, Provider } = defineSubmodel<Model, never>()
