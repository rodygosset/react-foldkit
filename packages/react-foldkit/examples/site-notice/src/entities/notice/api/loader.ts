import * as Loader from "react-foldkit/loader"
import { Notice } from "../model/notice"

export const loader = Loader.define({
	name: "SiteNotice",
	data: Notice,
	key: (notice) => notice.id,
})
