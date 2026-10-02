import { Option } from "effect"
import * as Application from "@/app/model/application"

export function View() {
	const model = Application.useModel()
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
