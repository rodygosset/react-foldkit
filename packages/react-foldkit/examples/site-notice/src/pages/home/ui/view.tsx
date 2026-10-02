import { Option } from "effect"
import * as Notice from "@/entities/notice"

export function View() {
	const model = Notice.useModel()
	return (
		<main>
			{Option.match(model.notice, {
				onNone: function () {
					return <p>No notice.</p>
				},
				onSome: function (notice) {
					return (
						<section>
							<h1>{notice.headline}</h1>
							<p>{notice.body}</p>
						</section>
					)
				},
			})}
		</main>
	)
}
