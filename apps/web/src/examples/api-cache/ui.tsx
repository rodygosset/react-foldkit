import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Array, DateTime, Option, Schema } from "effect"
import * as AsyncData from "foldkit/asyncData"
import type { ReactNode } from "react"
import { ExampleShell } from "../../components/example-shell"
import type { Post, PostDetail, Stats } from "./data"

export const Tab = Schema.Literals(["Posts", "Stats"])
export type Tab = typeof Tab.Type

const formatFetchedAt = (fetchedAt: number): string =>
	DateTime.formatLocal(DateTime.makeUnsafe(fetchedAt), { timeStyle: "medium" })

function ErrorPanel(props: { error: string; onRetry: () => void }) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
			<p className="text-sm">{props.error}</p>
			<Button
				variant="destructive"
				size="sm"
				onClick={props.onRetry}
			>
				Retry
			</Button>
		</div>
	)
}

/** Renders a loading panel, a retryable error, or the data with any stale error above it. */
export function AsyncDataPanel<TData, TError>(props: {
	data: AsyncData.AsyncData<TData, TError>
	loadingText: string
	onRetry: () => void
	children: (data: TData) => ReactNode
}) {
	return AsyncData.matchData(props.data, {
		onEmpty: () => (
			<div className="rounded-lg bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
				{props.loadingText}
			</div>
		),
		onFailure: (error) => (
			<ErrorPanel
				error={String(error)}
				onRetry={props.onRetry}
			/>
		),
		onData: (data) => (
			<div className="flex flex-col gap-4">
				{Option.match(AsyncData.getError(props.data), {
					onNone: () => null,
					onSome: (error) => (
						<ErrorPanel
							error={String(error)}
							onRetry={props.onRetry}
						/>
					),
				})}
				{props.children(data)}
			</div>
		),
	})
}

export function SectionHeader(props: {
	title: string
	actionLabel: string
	isActionDisabled: boolean
	onAction: () => void
	children: ReactNode
}) {
	return (
		<>
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold tracking-tight">{props.title}</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={props.isActionDisabled}
					onClick={props.onAction}
				>
					{props.actionLabel}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">{props.children}</p>
		</>
	)
}

export function PostListItems(props: {
	posts: ReadonlyArray<Post>
	isCached: (postId: string) => boolean
	onSelect: (postId: string) => void
}) {
	return (
		<ul className="flex flex-col gap-2">
			{Array.map(props.posts, (post) => (
				<li key={post.id}>
					<button
						type="button"
						className="flex w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/60"
						onClick={() => props.onSelect(post.id)}
					>
						<div className="min-w-0">
							<p className="font-medium tracking-tight">{post.title}</p>
							<p className="text-sm text-muted-foreground">{post.excerpt}</p>
						</div>
						{props.isCached(post.id) ? <Badge variant="secondary">Cached</Badge> : null}
					</button>
				</li>
			))}
		</ul>
	)
}

export function BackButton(props: { onClick: () => void }) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className="self-start"
			onClick={props.onClick}
		>
			Back to posts
		</Button>
	)
}

export function PostDetailCard(props: { detail: PostDetail; fetchedAt: number; note: string }) {
	return (
		<article className="flex flex-col gap-3 rounded-lg bg-muted/60 px-5 py-5">
			<h2 className="text-2xl font-semibold tracking-tight">{props.detail.title}</h2>
			<p className="text-sm text-muted-foreground">By {props.detail.author}</p>
			<p className="leading-relaxed text-foreground/90">{props.detail.body}</p>
			<p className="text-xs text-muted-foreground">
				Fetched at {formatFetchedAt(props.fetchedAt)}. {props.note}
			</p>
		</article>
	)
}

function StatCard(props: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-4 py-3">
			<p className="text-sm text-muted-foreground">{props.label}</p>
			<p className="text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
		</div>
	)
}

export function StatsCards(props: { stats: Stats; fetchedAt: number; isRefreshing: boolean }) {
	return (
		<div className="flex flex-col gap-3">
			<div className="grid grid-cols-3 gap-3">
				<StatCard
					label="Active users"
					value={`${props.stats.activeUsers}`}
				/>
				<StatCard
					label="Requests per second"
					value={`${props.stats.requestsPerSecond}`}
				/>
				<StatCard
					label="Cache hit rate"
					value={`${props.stats.cacheHitRatePercent}%`}
				/>
			</div>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span>Updated at {formatFetchedAt(props.fetchedAt)}</span>
				{props.isRefreshing ? <Badge variant="secondary">Refreshing</Badge> : null}
			</div>
		</div>
	)
}

function TabList(props: { activeTab: Tab; onSelect: (tab: Tab) => void }) {
	return (
		<nav
			className="flex gap-2"
			aria-label="API cache sections"
		>
			{Array.map(Tab.literals, function (tab) {
				const isActive = props.activeTab === tab
				return (
					<Button
						key={tab}
						variant={isActive ? "default" : "ghost"}
						size="sm"
						aria-current={isActive ? "page" : undefined}
						onClick={() => props.onSelect(tab)}
					>
						{tab}
					</Button>
				)
			})}
		</nav>
	)
}

/** Lays out an API cache example: the shell, the tab list, and the active tab's panel. */
export function ApiCacheLayout(props: {
	title: string
	description: string
	activeTab: Tab
	onSelectTab: (tab: Tab) => void
	children: ReactNode
}) {
	return (
		<ExampleShell
			title={props.title}
			description={props.description}
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 pt-8 pb-16">
				<TabList
					activeTab={props.activeTab}
					onSelect={props.onSelectTab}
				/>
				<Separator />
				{props.children}
			</div>
		</ExampleShell>
	)
}
