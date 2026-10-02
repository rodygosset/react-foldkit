import { define } from "react-foldkit/loader"
import { Notice } from "../model/notice"

export const Loader = define({
	name: "SiteNotice",
	data: Notice,
	key: function (notice) {
		return notice.id
	},
})
