import { defineSubmodel } from "react-foldkit/react"
import type { Model, Message } from "../model/query"

export const { useModel, useDispatch, Provider } =
  defineSubmodel<Model, Message>()
