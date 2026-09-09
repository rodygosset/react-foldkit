import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
	Array,
	Clock,
	Duration,
	Effect,
	HashMap,
	Match,
	Option,
	Schema,
	Stream,
	pipe,
} from "effect"
import { ReactFoldkit } from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import * as Command from "react-foldkit/command"
import { defineMessageUnion } from "react-foldkit/message"
import { evo } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import type * as Update from "react-foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import {
	Post,
	PostDetail,
	Stats,
	fetchPostDetail,
	fetchPosts,
	fetchStats,
} from "./data"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

// MODEL

const FetchedPosts = Schema.Struct({ posts: Schema.Array(Post), fetchedAt: Schema.Number })
const FetchedPostDetail = Schema.Struct({
	detail: PostDetail,
	fetchedAt: Schema.Number,
})
const FetchedStats = Schema.Struct({ stats: Stats, fetchedAt: Schema.Number })

const PostsData = AsyncData.Schema(FetchedPosts, Schema.String)
const PostDetailData = AsyncData.Schema(FetchedPostDetail, Schema.String)
const StatsData = AsyncData.Schema(FetchedStats, Schema.String)

type PostsData = typeof PostsData.schema.Type
type PostDetailData = typeof PostDetailData.schema.Type
type StatsData = typeof StatsData.schema.Type

const Tab = Schema.Literals(["Posts", "Stats"])
type Tab = typeof Tab.Type

const tabValues: ReadonlyArray<Tab> = Tab.literals

const Model = Schema.Struct({
	activeTab: Tab,
	posts: PostsData.schema,
	postDetailById: Schema.HashMap(Schema.String, PostDetailData.schema),
	maybeSelectedPostId: Schema.Option(Schema.String),
	stats: StatsData.schema,
})
type Model = typeof Model.Type

// MESSAGE

const Message = defineMessageUnion({
	ClickedTab: { tab: Tab },
	ClickedPost: { postId: Schema.String },
	ClickedBackToPosts: {},
	ClickedInvalidatePosts: {},
	ClickedRetryPosts: {},
	ClickedRetryPostDetail: {
		postId: Schema.String,
	},
	ClickedRefreshStats: {},
	ClickedRetryStats: {},
	TickedRevalidateStats: {},
	SettledFetchPosts: {
		result: Schema.Result(FetchedPosts, Schema.String),
	},
	SettledFetchPostDetail: {
		postId: Schema.String,
		result: Schema.Result(FetchedPostDetail, Schema.String),
	},
	SettledFetchStats: {
		result: Schema.Result(FetchedStats, Schema.String),
	},
})
type Message = typeof Message.Type

const {
	ClickedTab,
	ClickedPost,
	ClickedBackToPosts,
	ClickedInvalidatePosts,
	ClickedRetryPosts,
	ClickedRetryPostDetail,
	ClickedRefreshStats,
	ClickedRetryStats,
	SettledFetchPosts,
	SettledFetchPostDetail,
	SettledFetchStats,
} = Message

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

function applyPostsTransition(
	model: Model,
	maybeNextPosts: Option.Option<PostsData>
): UpdateReturn {
	return Option.match(maybeNextPosts, {
		onNone: () => ({ model }),
		onSome: (nextPosts) => ({ model: evo(model, { posts: () => nextPosts }), commands: [FetchPosts()] }),
	})
}

function applyStatsTransition(
	model: Model,
	maybeNextStats: Option.Option<StatsData>
): UpdateReturn {
	return Option.match(maybeNextStats, {
		onNone: () => ({ model }),
		onSome: (nextStats) => ({ model: evo(model, { stats: () => nextStats }), commands: [FetchStats()] }),
	})
}

function setPostDetail(postId: string, postDetail: PostDetailData) {
	return HashMap.set(postId, postDetail)
}

function activateTab(model: Model, tab: Tab): UpdateReturn {
	const modelWithActiveTab = evo(model, { activeTab: () => tab })

	return Match.value(tab).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.when("Posts", () =>
			applyPostsTransition(modelWithActiveTab, AsyncData.loadIfMissing(modelWithActiveTab.posts))
		),
		Match.when("Stats", () =>
			applyStatsTransition(modelWithActiveTab, AsyncData.loadIfMissing(modelWithActiveTab.stats))
		),
		Match.exhaustive
	)
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
			ClickedTab: ({ tab }) => activateTab(model, tab),

			ClickedPost: ({ postId }) => {
				const selectedModel = evo(model, {
					maybeSelectedPostId: () => Option.some(postId),
				})

				return Option.match(HashMap.get(model.postDetailById, postId), {
					onNone: () => ({
						model: evo(selectedModel, {
							postDetailById: setPostDetail(postId, PostDetailData.Loading()),
						}),
						commands: [FetchPostDetail({ postId })],
					}),
					onSome: () => ({ model: selectedModel }),
				})
			},

			ClickedBackToPosts: () => ({
				model: evo(model, { maybeSelectedPostId: () => Option.none() }),
			}),

			ClickedInvalidatePosts: () =>
				applyPostsTransition(model, AsyncData.revalidateOrLoad(model.posts)),

			ClickedRetryPosts: () =>
				applyPostsTransition(model, AsyncData.revalidateOrLoad(model.posts)),

			ClickedRetryPostDetail: ({ postId }) => ({
				model: evo(model, {
					postDetailById: setPostDetail(postId, PostDetailData.Loading()),
				}),
				commands: [FetchPostDetail({ postId })],
			}),

			ClickedRefreshStats: () =>
				applyStatsTransition(model, AsyncData.revalidateOrLoad(model.stats)),

			ClickedRetryStats: () =>
				applyStatsTransition(model, AsyncData.revalidateOrLoad(model.stats)),

			TickedRevalidateStats: () =>
				applyStatsTransition(model, AsyncData.revalidate(model.stats)),

			SettledFetchPosts: ({ result }) => ({
				model: evo(model, { posts: AsyncData.settle(result) }),
			}),

			SettledFetchPostDetail: ({ postId, result }) => ({
				model: evo(model, {
					postDetailById: HashMap.modify(postId, AsyncData.settle(result)),
				}),
			}),

			SettledFetchStats: ({ result }) => ({
				model: evo(model, { stats: AsyncData.settle(result) }),
			}),
		})

// INIT

function init(): UpdateReturn {
	return {
		model: {
			activeTab: "Posts",
			posts: PostsData.Loading(),
			postDetailById: HashMap.empty(),
			maybeSelectedPostId: Option.none(),
			stats: StatsData.Idle(),
		},
		commands: [FetchPosts()],
	}
}

// COMMAND

const FetchPosts = Command.define("FetchPosts", {
	messages: [Message.SettledFetchPosts],
	execute: pipe(
		Effect.gen(function* () {
			const posts = yield* fetchPosts
			const fetchedAt = yield* Clock.currentTimeMillis
			return { posts, fetchedAt }
		}),
		Effect.result,
		Effect.map(function (result) {
			return SettledFetchPosts({ result })
		})
	),
})

const FetchPostDetail = Command.define("FetchPostDetail", {
	args: { postId: Schema.String },
	messages: [Message.SettledFetchPostDetail],
	execute: ({ postId }) =>
		pipe(
			Effect.gen(function* () {
				const detail = yield* fetchPostDetail(postId)
				const fetchedAt = yield* Clock.currentTimeMillis
				return { detail, fetchedAt }
			}),
			Effect.result,
			Effect.map(function (result) {
				return SettledFetchPostDetail({ postId, result })
			})
		),
})

const FetchStats = Command.define("FetchStats", {
	messages: [Message.SettledFetchStats],
	execute: pipe(
		Effect.gen(function* () {
			const stats = yield* fetchStats
			const fetchedAt = yield* Clock.currentTimeMillis
			return { stats, fetchedAt }
		}),
		Effect.result,
		Effect.map(function (result) {
			return SettledFetchStats({ result })
		})
	),
})

// SUBSCRIPTION

const subscriptions = Subscription.make<Model, Message>()(function (entry) {
	return {
		revalidateStats: entry(
			{ isObservingStats: Schema.Boolean },
			{
				modelToDependencies: function (model) {
					return {
						isObservingStats: model.activeTab === "Stats" && AsyncData.hasData(model.stats),
					}
				},
				dependenciesToStream: function ({ isObservingStats }) {
					return Stream.when(
						// NOTE: Stream.tick emits once immediately. Drop that first
						// emission so freshly loaded stats are not refetched instantly.
						Stream.tick(STATS_REFETCH_INTERVAL).pipe(
							Stream.drop(1),
			Stream.map(Message.TickedRevalidateStats)
						),
						Effect.sync(() => isObservingStats)
					)
				},
			}
		),
	}
})

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	update,
	subscriptions,
})

// VIEW

function formatFetchedAt(fetchedAt: number): string {
	return new Date(fetchedAt).toLocaleTimeString()
}

function isPostDetailCached(
	postDetailById: HashMap.HashMap<string, PostDetailData>,
	postId: string
): boolean {
	return Option.exists(HashMap.get(postDetailById, postId), AsyncData.hasData)
}

function ErrorPanel(props: {
	error: string
	onRetry: () => void
}) {
	return (
		<div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive">
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

function LoadingPanel(props: { text: string }) {
	return (
		<div className="rounded-2xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">
			{props.text}
		</div>
	)
}

function StatCard(props: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-4 py-3">
			<p className="text-sm text-muted-foreground">{props.label}</p>
			<p className="text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
		</div>
	)
}

function PostListItems(props: {
	posts: ReadonlyArray<Post>
	postDetailById: HashMap.HashMap<string, PostDetailData>
	onSelect: (postId: string) => void
}) {
	return (
		<ul className="flex flex-col gap-2">
			{Array.map(props.posts, function (post) {
				return (
					<li key={post.id}>
						<button
							type="button"
							className="flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60"
							onClick={function () {
								props.onSelect(post.id)
							}}
						>
							<div className="min-w-0">
								<p className="font-medium tracking-tight">{post.title}</p>
								<p className="text-sm text-muted-foreground">{post.excerpt}</p>
							</div>
							{isPostDetailCached(props.postDetailById, post.id) ? (
								<Badge variant="secondary">Cached</Badge>
							) : null}
						</button>
					</li>
				)
			})}
		</ul>
	)
}

function PostDetailCard(props: {
	detail: PostDetail
	fetchedAt: number
}) {
	return (
		<article className="flex flex-col gap-3 rounded-2xl bg-muted/60 px-5 py-5">
			<h2 className="text-2xl font-semibold tracking-tight">{props.detail.title}</h2>
			<p className="text-sm text-muted-foreground">By {props.detail.author}</p>
			<p className="leading-relaxed text-foreground/90">{props.detail.body}</p>
			<p className="text-xs text-muted-foreground">
				Fetched at {formatFetchedAt(props.fetchedAt)}. Future visits render instantly from the Model.
			</p>
		</article>
	)
}

function PostsListView() {
	const model = useModel()
	const dispatch = useDispatch()
	const isPending = AsyncData.isPending(model.posts)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold tracking-tight">Posts</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={function () {
						dispatch(ClickedInvalidatePosts())
					}}
				>
					{AsyncData.isRefreshing(model.posts) ? "Refreshing…" : "Invalidate"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Open a post, go back, and open it again. The second visit renders instantly from the Model.
				Invalidate marks the list stale and refetches it while the current list stays on screen.
			</p>
			{AsyncData.matchDataSplitEmpty(model.posts, {
				onIdle: () => <LoadingPanel text="Loading posts…" />,
				onLoading: () => <LoadingPanel text="Loading posts…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={function () {
							dispatch(ClickedRetryPosts())
						}}
					/>
				),
				onData: ({ posts }) => (
					<div className="flex flex-col gap-4">
						{Option.match(AsyncData.getError(model.posts), {
							onNone: () => null,
							onSome: (error) => (
								<ErrorPanel
									error={error}
									onRetry={function () {
										dispatch(ClickedRetryPosts())
									}}
								/>
							),
						})}
						<PostListItems
							posts={posts}
							postDetailById={model.postDetailById}
							onSelect={function (postId) {
								dispatch(ClickedPost({ postId }))
							}}
						/>
					</div>
				),
			})}
		</div>
	)
}

function PostDetailView(props: { postId: string }) {
	const model = useModel()
	const dispatch = useDispatch()
	const postDetailData = Option.getOrElse(HashMap.get(model.postDetailById, props.postId), () =>
		PostDetailData.Idle()
	)

	return (
		<div className="flex flex-col gap-4">
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				onClick={function () {
					dispatch(ClickedBackToPosts())
				}}
			>
				Back to posts
			</Button>
			{AsyncData.matchDataSplitEmpty(postDetailData, {
				onIdle: () => <LoadingPanel text="Loading post…" />,
				onLoading: () => <LoadingPanel text="Loading post…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={function () {
							dispatch(ClickedRetryPostDetail({ postId: props.postId }))
						}}
					/>
				),
				onData: ({ detail, fetchedAt }) => (
					<div className="flex flex-col gap-4">
						{Option.match(AsyncData.getError(postDetailData), {
							onNone: () => null,
							onSome: (error) => (
								<ErrorPanel
									error={error}
									onRetry={function () {
										dispatch(ClickedRetryPostDetail({ postId: props.postId }))
									}}
								/>
							),
						})}
						<PostDetailCard
							detail={detail}
							fetchedAt={fetchedAt}
						/>
					</div>
				),
			})}
		</div>
	)
}

function PostsTabView() {
	const maybeSelectedPostId = useModel((model) => model.maybeSelectedPostId)

	return Option.match(maybeSelectedPostId, {
		onNone: () => <PostsListView />,
		onSome: (postId) => <PostDetailView postId={postId} />,
	})
}

function StatsCards(props: {
	stats: Stats
	fetchedAt: number
	isRefreshing: boolean
}) {
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

function StatsTabView() {
	const model = useModel()
	const dispatch = useDispatch()
	const isPending = AsyncData.isPending(model.stats)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold tracking-tight">Stats</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={function () {
						dispatch(ClickedRefreshStats())
					}}
				>
					{isPending ? "Refreshing…" : "Refresh"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the
				new ones load.
			</p>
			{AsyncData.matchDataSplitEmpty(model.stats, {
				onIdle: () => <LoadingPanel text="Loading stats…" />,
				onLoading: () => <LoadingPanel text="Loading stats…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={function () {
							dispatch(ClickedRetryStats())
						}}
					/>
				),
				onData: ({ stats, fetchedAt }) => (
					<div className="flex flex-col gap-4">
						{Option.match(AsyncData.getError(model.stats), {
							onNone: () => null,
							onSome: (error) => (
								<ErrorPanel
									error={error}
									onRetry={function () {
										dispatch(ClickedRetryStats())
									}}
								/>
							),
						})}
						<StatsCards
							stats={stats}
							fetchedAt={fetchedAt}
							isRefreshing={AsyncData.isRefreshing(model.stats)}
						/>
					</div>
				),
			})}
		</div>
	)
}

function TabPanel() {
	const activeTab = useModel((model) => model.activeTab)

	return Match.value(activeTab).pipe(
		Match.when("Posts", () => <PostsTabView />),
		Match.when("Stats", () => <StatsTabView />),
		Match.exhaustive
	)
}

function TabList() {
	const activeTab = useModel((model) => model.activeTab)
	const dispatch = useDispatch()

	return (
		<nav
			className="flex gap-2"
			aria-label="API cache sections"
		>
			{Array.map(tabValues, function (tab) {
				const isActive = activeTab === tab
				return (
					<Button
						key={tab}
						variant={isActive ? "default" : "ghost"}
						size="sm"
						aria-current={isActive ? "page" : undefined}
						onClick={function () {
							dispatch(ClickedTab({ tab }))
						}}
					>
						{tab}
					</Button>
				)
			})}
		</nav>
	)
}

function View() {
	return (
		<ExampleShell
			title="API Cache"
			description="Query client patterns as ordinary Model state, update logic, and one Subscription."
		>
			<div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 pt-8 pb-16">
				<TabList />
				<Separator />
				<TabPanel />
			</div>
		</ExampleShell>
	)
}

export function ApiCache() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
