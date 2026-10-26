import { repositoryUrl, sourceUrl } from "../examples"

const linkClass = "text-foreground underline-offset-4 hover:underline"

export function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
				<p>
					Built on{" "}
					<a
						href="https://foldkit.dev"
						className={linkClass}
					>
						Foldkit
					</a>
					. This site is built with React Foldkit.{" "}
					<a
						href={sourceUrl("apps/web")}
						className={linkClass}
					>
						Read its source
					</a>
					.
				</p>
				<div className="flex gap-5">
					<a
						href={repositoryUrl}
						className={linkClass}
					>
						GitHub
					</a>
					<a
						href="https://www.npmjs.com/package/react-foldkit"
						className={linkClass}
					>
						npm
					</a>
				</div>
			</div>
		</footer>
	)
}
