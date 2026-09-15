import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Array, Clock, Duration, Effect, Layer, Match, Option, pipe, Schema, Stream } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import type * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"
import { ReactFoldkit } from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import { defineMessageUnion } from "react-foldkit/message"
import * as Query from "react-foldkit/query"
import { evo } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import * as Update from "react-foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import { fetchPostDetail, fetchPosts, fetchStats, Post, PostDetail, Stats } from "../api-cache/data"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

const FetchedPosts = Schema.Struct({ posts: Schema.Array(Post), fetchedAt: Schema.Number })
const FetchedPostDetail = Schema.Struct({
	detail: PostDetail,
	fetchedAt: Schema.Number,
})
const FetchedStats = Schema.Struct({ stats: Stats, fetchedAt: Schema.Number })

const BlogApi = HttpApi.make("BlogApi").add(
	HttpApiGroup.make("blog")
		.add(
			HttpApiEndpoint.get("listPosts", "/posts", {
				success: FetchedPosts,
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.get("getPost", "/posts/:postId", {
				params: { postId: Schema.String },
				success: FetchedPostDetail,
				error: Schema.String,
			})
		)
		.add(
			HttpApiEndpoint.get("getStats", "/stats", {
				success: FetchedStats,
				error: Schema.String,
			})
		)
)

class BlogClient extends Query.HttpApi.Service<BlogClient>()("BlogClient", { api: BlogApi }) {}

const postsQuery = BlogClient.query({
	name: "Posts",
	group: "blog",
	endpoint: "listPosts",
})

const statsQuery = BlogClient.query({
	name: "Stats",
	group: "blog",
	endpoint: "getStats",
})

const postDetailQuery = BlogClient.query({
	name: "PostDetail",
	group: "blog",
	endpoint: "getPost",
})

type BlogApiGroups = typeof BlogApi extends HttpApi.HttpApi<infer _I, infer G> ? G : never

const blogClient = {
	blog: {
		listPosts: function () {
			return Effect.gen(function* () {
				const list = yield* fetchPosts
				const fetchedAt = yield* Clock.currentTimeMillis
				return { posts: list, fetchedAt }
			})
		},
		getPost: function (request: { readonly params: { readonly postId: string } }) {
			return Effect.gen(function* () {
				const detail = yield* fetchPostDetail(request.params.postId)
				const fetchedAt = yield* Clock.currentTimeMillis
				return { detail, fetchedAt }
			})
		},
		getStats: function () {
			return Effect.gen(function* () {
				const snapshot = yield* fetchStats
				const fetchedAt = yield* Clock.currentTimeMillis
				return { stats: snapshot, fetchedAt }
			})
		},
	},
} as unknown as HttpApiClient.Client<BlogApiGroups, never, never>

const BlogClientLive = Layer.succeed(BlogClient, blogClient)

const Tab = Schema.Literals(["Posts", "Stats"])
type Tab = typeof Tab.Type

const tabValues: ReadonlyArray<Tab> = Tab.literals

const Model = Schema.Struct({
	activeTab: Tab,
	posts: postsQuery.Model,
	postDetailById: postDetailQuery.Model,
	maybeSelectedPostId: Schema.Option(Schema.String),
	stats: statsQuery.Model,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
	GotPostsMessage: postsQuery.ParentMessage,
	GotStatsMessage: statsQuery.ParentMessage,
	GotPostDetailMessage: postDetailQuery.ParentMessage,
	ClickedTab: { tab: Tab },
	ClickedPost: { postId: Schema.String },
	ClickedBackToPosts: {},
	ClickedInvalidatePosts: {},
	ClickedRetryPosts: {},
	ClickedRetryPostDetail: { postId: Schema.String },
	ClickedRefreshStats: {},
	ClickedRetryStats: {},
	TickedRevalidateStats: {},
})
type Message = typeof Message.Type

type UpdateReturn = Update.Return<Model, Message, BlogClient>

const foldPosts = postsQuery.lift<Model, Message>()({
	field: "posts",
	toParentMessage: Message.GotPostsMessage,
})

const foldStats = statsQuery.lift<Model, Message>()({
	field: "stats",
	toParentMessage: Message.GotStatsMessage,
})

const foldPostDetail = postDetailQuery.lift<Model, Message>()({
	field: "postDetailById",
	toParentMessage: Message.GotPostDetailMessage,
})

function activateTab(model: Model, tab: Tab): UpdateReturn {
	const modelWithActiveTab = evo(model, { activeTab: () => tab })

	return Match.value(tab).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.when("Posts", () => foldPosts.loadIfMissing(modelWithActiveTab)),
		Match.when("Stats", () => foldStats.loadIfMissing(modelWithActiveTab)),
		Match.exhaustive
	)
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		GotPostsMessage: foldPosts(model),
		GotStatsMessage: foldStats(model),
		GotPostDetailMessage: foldPostDetail(model),
		ClickedTab: ({ tab }) => activateTab(model, tab),
		ClickedPost: ({ postId }) =>
			Update.identity(
				evo(model, {
					maybeSelectedPostId: () => Option.some(postId),
				})
			),
		ClickedBackToPosts: () => Update.identity(evo(model, { maybeSelectedPostId: () => Option.none() })),
		ClickedInvalidatePosts: () => foldPosts.revalidateOrLoad(model),
		ClickedRetryPosts: () => foldPosts.revalidateOrLoad(model),
		ClickedRetryPostDetail: ({ postId }) => foldPostDetail.revalidateOrLoad(model, { params: { postId } }),
		ClickedRefreshStats: () => foldStats.revalidateOrLoad(model),
		ClickedRetryStats: () => foldStats.revalidateOrLoad(model),
		TickedRevalidateStats: () => foldStats.revalidate(model),
	})

const init = (): UpdateReturn =>
	foldPosts.revalidateOrLoad({
		activeTab: "Posts",
		posts: postsQuery.init(),
		postDetailById: postDetailQuery.init(),
		maybeSelectedPostId: Option.none(),
		stats: statsQuery.init(),
	})

const subscriptions = Subscription.make<Model, Message, BlogClient>()((entry) => ({
	revalidateStats: entry(
		{ isObservingStats: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isObservingStats: model.activeTab === "Stats" && AsyncData.hasData(model.stats),
			}),
			dependenciesToStream: ({ isObservingStats }) =>
				Stream.when(
					// NOTE: Stream.tick emits once immediately. Drop that first
					// emission so freshly loaded stats are not refetched instantly.
					Stream.tick(STATS_REFETCH_INTERVAL).pipe(Stream.drop(1), Stream.map(Message.TickedRevalidateStats)),
					Effect.sync(() => isObservingStats)
				),
		}
	),
	watchPostDetail: foldPostDetail.watchSubscription(entry, (model) =>
		Option.match(model.maybeSelectedPostId, {
			onNone: () => [],
			onSome: (postId) => [{ params: { postId } }],
		})
	),
}))

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	Model,
	update,
	subscriptions,
	layer: BlogClientLive,
})

const formatFetchedAt = (fetchedAt: number): string => new Date(fetchedAt).toLocaleTimeString()

const isPostDetailCached = (postDetailById: Model["postDetailById"], postId: string): boolean =>
	AsyncData.hasData(postDetailQuery.read(postDetailById, { params: { postId } }))

const ErrorPanel = (props: { error: string; onRetry: () => void }) => (
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

const LoadingPanel = (props: { text: string }) => (
	<div className="rounded-2xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">{props.text}</div>
)

const StatCard = (props: { label: string; value: string }) => (
	<div className="flex flex-col gap-1 rounded-2xl bg-muted/60 px-4 py-3">
		<p className="text-sm text-muted-foreground">{props.label}</p>
		<p className="text-2xl font-semibold tracking-tight tabular-nums">{props.value}</p>
	</div>
)

const PostListItems = (props: {
	posts: ReadonlyArray<Post>
	postDetailById: Model["postDetailById"]
	onSelect: (postId: string) => void
}) => (
	<ul className="flex flex-col gap-2">
		{Array.map(props.posts, (post) => (
			<li key={post.id}>
				<button
					type="button"
					className="flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60"
					onClick={() => {
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
		))}
	</ul>
)

const PostDetailCard = (props: { detail: PostDetail; fetchedAt: number }) => (
	<article className="flex flex-col gap-3 rounded-2xl bg-muted/60 px-5 py-5">
		<h2 className="text-2xl font-semibold tracking-tight">{props.detail.title}</h2>
		<p className="text-sm text-muted-foreground">By {props.detail.author}</p>
		<p className="leading-relaxed text-foreground/90">{props.detail.body}</p>
		<p className="text-xs text-muted-foreground">
			Fetched at {formatFetchedAt(props.fetchedAt)}. Leaving this screen forgets the slot and Interrupts an
			in-flight Fetch for that key.
		</p>
	</article>
)

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
					onClick={() => {
						dispatch(Message.ClickedInvalidatePosts())
					}}
				>
					{AsyncData.isRefreshing(model.posts) ? "Refreshing…" : "Invalidate"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Open a post, then go back. The list stays Success. <code>watchSubscription</code> keeps the live key
				set. A dropped key runs the same forget path as <code>informForget</code>, including Interrupt while
				pending. Open the same post again to load it fresh. The Cached badge uses{" "}
				<code>postDetailQuery.read</code> with <code>params.postId</code> from the HttpApi endpoint.
			</p>
			{AsyncData.matchDataSplitEmpty(model.posts, {
				onIdle: () => <LoadingPanel text="Loading posts…" />,
				onLoading: () => <LoadingPanel text="Loading posts…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={() => {
							dispatch(Message.ClickedRetryPosts())
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
									onRetry={() => {
										dispatch(Message.ClickedRetryPosts())
									}}
								/>
							),
						})}
						<PostListItems
							posts={posts}
							postDetailById={model.postDetailById}
							onSelect={(postId) => {
								dispatch(Message.ClickedPost({ postId }))
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
	const postDetailData = postDetailQuery.read(model.postDetailById, { params: { postId: props.postId } })

	return (
		<div className="flex flex-col gap-4">
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				onClick={() => {
					dispatch(Message.ClickedBackToPosts())
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
						onRetry={() => {
							dispatch(Message.ClickedRetryPostDetail({ postId: props.postId }))
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
									onRetry={() => {
										dispatch(Message.ClickedRetryPostDetail({ postId: props.postId }))
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

const PostsTabView = () =>
	pipe(
		useModel((model) => model.maybeSelectedPostId),
		Option.match({
			onNone: () => <PostsListView />,
			onSome: (postId) => <PostDetailView postId={postId} />,
		})
	)

const StatsCards = (props: { stats: Stats; fetchedAt: number; isRefreshing: boolean }) => (
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
					onClick={() => {
						dispatch(Message.ClickedRefreshStats())
					}}
				>
					{isPending ? "Refreshing…" : "Refresh"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the new ones
				load. BlogClient.query owns those AsyncData transitions.
			</p>
			{AsyncData.matchDataSplitEmpty(model.stats, {
				onIdle: () => <LoadingPanel text="Loading stats…" />,
				onLoading: () => <LoadingPanel text="Loading stats…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={() => {
							dispatch(Message.ClickedRetryStats())
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
									onRetry={() => {
										dispatch(Message.ClickedRetryStats())
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
			{Array.map(tabValues, (tab) => {
				const isActive = activeTab === tab
				return (
					<Button
						key={tab}
						variant={isActive ? "default" : "ghost"}
						size="sm"
						aria-current={isActive ? "page" : undefined}
						onClick={() => {
							dispatch(Message.ClickedTab({ tab }))
						}}
					>
						{tab}
					</Button>
				)
			})}
		</nav>
	)
}

const View = () => (
	<ExampleShell
		title="API Cache (HttpApi)"
		description="The same Model-as-cache TEA as API Cache Query. BlogClient.query builds the Submodel from an HttpApi group and endpoint. Success, error, and keyed args come from the endpoint. The parent still folds Got* and intent."
	>
		<div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 pt-8 pb-16">
			<TabList />
			<Separator />
			<TabPanel />
		</div>
	</ExampleShell>
)

export const ApiCacheHttpApi = () => (
	<Provider init={init()}>
		<View />
	</Provider>
)
