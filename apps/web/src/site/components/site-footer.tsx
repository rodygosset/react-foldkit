import { repositoryUrl, sourceUrl } from "../examples"

const linkClass = "transition-colors hover:text-foreground"

export function SiteFooter() {
	return (
		<footer className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 py-10 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
			<p>
				Built on{" "}
				<a
					href="https://foldkit.dev"
					className="text-foreground/80 hover:text-foreground"
				>
					Foldkit
				</a>
				, with React Foldkit.{" "}
				<a
					href={sourceUrl("apps/web")}
					className="text-foreground/80 hover:text-foreground"
				>
					Read the source
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
		</footer>
	)
}
