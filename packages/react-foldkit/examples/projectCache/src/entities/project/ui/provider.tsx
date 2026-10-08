import * as Submodel from "react-foldkit/submodel"
import type { Model, Message } from "../model/query"

export const { useModel, useDispatch, Provider } =
  Submodel.define<Model, Message>()
