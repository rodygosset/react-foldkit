import * as Submodel from "react-foldkit/submodel"
import { Message, Model } from "./query"

export const { useModel, useDispatch, useSend, Provider } = Submodel.define({ Model, Message })
