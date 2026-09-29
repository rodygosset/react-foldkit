import * as Submodel from "react-foldkit/submodel"
import type { Model, Message } from "./query"

export const { useModel, useDispatch, Provider } = Submodel.define<Model, Message>()
