import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { DateTime, Array, Clock, Duration, Effect, Layer, Match, Option, pipe, Schema, Stream } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as AsyncData from "react-foldkit/asyncData"
import { defineMessageUnion } from "react-foldkit/message"
import * as Query from "foldkit/experimental/query"
import { defineApplication } from "react-foldkit/react"
import { modifyFields } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import * as Update from "react-foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import { fetchPostDetail, fetchPosts, fetchStats, Post, PostDetail, Stats } from "../api-cache/data"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

const FetchedPosts = Schema.Struct({ posts: Schema.Array(Post), fetchedAt: Schema.Finite })
const FetchedPostDetail = Schema.Struct({
	detail: PostDetail,
	fetchedAt: Schema.Finite,
})
const FetchedStats = Schema.Struct({ stats: Stats, fetchedAt: Schema.Finite })

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

class BlogClient extends Query.HttpApi.Service<BlogClient>()("BlogClient", { api: BlogApi }) {
	static readonly layer = Layer.succeed(
		BlogClient,
		BlogClient.of({
			blog: {
				listPosts: () =>
					Effect.gen(function* () {
						const list = yield* fetchPosts
						const fetchedAt = yield* Clock.currentTimeMillis
						return { posts: list, fetchedAt }
					}) as any,
				getPost: (request: { readonly params: { readonly postId: string } }) =>
					Effect.gen(function* () {
						const detail = yield* fetchPostDetail(request.params.postId)
						const fetchedAt = yield* Clock.currentTimeMillis
						return { detail, fetchedAt }
					}) as any,
				getStats: () =>
					Effect.gen(function* () {
						const snapshot = yield* fetchStats
						const fetchedAt = yield* Clock.currentTimeMillis
						return { stats: snapshot, fetchedAt }
					}) as any,
			},
		})
	)
}

const postsQuery = BlogClient.query("Posts", "blog", "listPosts")

const statsQuery = BlogClient.query("Stats", "blog", "getStats")

const postDetailQuery = BlogClient.query("PostDetail", "blog", "getPost", { interrupt: true })

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
	GotPostsMessage: { message: postsQuery.Message },
	GotStatsMessage: { message: statsQuery.Message },
	GotPostDetailMessage: { message: postDetailQuery.Message },
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

const posts = postsQuery.lift<Model, Message>({
	parentField: "posts",
	toParentMessage: (message) => Message.GotPostsMessage({ message }),
})

const stats = statsQuery.lift<Model, Message>({
	parentField: "stats",
	toParentMessage: (message) => Message.GotStatsMessage({ message }),
})

const postDetail = postDetailQuery.lift<Model, Message>({
	parentField: "postDetailById",
	toParentMessage: (message) => Message.GotPostDetailMessage({ message }),
})

function activateTab(model: Model, tab: Tab): UpdateReturn {
	const modelWithActiveTab = modifyFields(model, { activeTab: () => tab })

	return Match.value(tab).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.when("Posts", () => posts.loadIfMissing(modelWithActiveTab)),
		Match.when("Stats", () => stats.loadIfMissing(modelWithActiveTab)),
		Match.exhaustive
	)
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		GotPostsMessage: (value) => posts.fold(model, value.message),
		GotStatsMessage: (value) => stats.fold(model, value.message),
		GotPostDetailMessage: (value) => postDetail.fold(model, value.message),
		ClickedTab: ({ tab }) => activateTab(model, tab),
		ClickedPost: ({ postId }) =>
			Update.combine(modifyFields(model, { maybeSelectedPostId: () => Option.some(postId) }), [
				postDetail.retainOnly([{ params: { postId } }]),
				postDetail.loadIfMissing({ params: { postId } }),
			]),
		ClickedBackToPosts: () =>
			postDetail.retainOnly(modifyFields(model, { maybeSelectedPostId: () => Option.none() }), []),
		ClickedInvalidatePosts: () => posts.revalidateOrLoad(model),
		ClickedRetryPosts: () => posts.revalidateOrLoad(model),
		ClickedRetryPostDetail: ({ postId }) => postDetail.revalidateOrLoad(model, { params: { postId } }),
		ClickedRefreshStats: () => stats.revalidateOrLoad(model),
		ClickedRetryStats: () => stats.revalidateOrLoad(model),
		TickedRevalidateStats: () => stats.revalidate(model),
	})

const init = (): UpdateReturn =>
	posts.revalidateOrLoad({
		activeTab: "Posts",
		posts: postsQuery.init(),
		postDetailById: postDetailQuery.init("postDetail"),
		maybeSelectedPostId: Option.none(),
		stats: statsQuery.init(),
	})

const subscriptions = Subscription.make<Model, Message, BlogClient>()((entry) => ({
	revalidateStats: entry(
		{ isObservingStats: Schema.Boolean },
		{
			modelToDependencies: (model) => ({
				isObservingStats: model.activeTab === "Stats" && AsyncData.hasData(statsQuery.read(model.stats)),
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
}))

const { Provider, useModel, useDispatch } = defineApplication({
	Model,
	update,
	subscriptions,
	layer: BlogClient.layer,
})

const formatFetchedAt = (fetchedAt: number): string =>
	DateTime.formatLocal(DateTime.makeUnsafe(fetchedAt), { timeStyle: "medium" })

const isPostDetailCached = (postDetailById: Model["postDetailById"], postId: string): boolean =>
	AsyncData.hasData(postDetailQuery.read(postDetailById, { params: { postId } }))

function ErrorPanel(props: { error: string; onRetry: () => void }) {
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
		<div className="rounded-2xl bg-muted/60 px-4 py-8 text-center text-sm text-muted-foreground">{props.text}</div>
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
	postDetailById: Model["postDetailById"]
	onSelect: (postId: string) => void
}) {
	return (
		<ul className="flex flex-col gap-2">
			{Array.map(props.posts, (post) => (
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
			))}
		</ul>
	)
}

function PostDetailCard(props: { detail: PostDetail; fetchedAt: number }) {
	return (
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
}

function PostsListView() {
	const model = useModel()
	const dispatch = useDispatch()
	const postsData = postsQuery.read(model.posts)
	const isPending = AsyncData.isPending(postsData)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold tracking-tight">Posts</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={function () {
						dispatch(Message.ClickedInvalidatePosts())
					}}
				>
					{AsyncData.isRefreshing(postsData) ? "Refreshing…" : "Invalidate"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Open a post, then go back. The list stays Success. <code>retainOnly</code> keeps the live key set. A
				dropped key runs the same forget path as <code>forget</code>, including optional interruption while
				pending. Open the same post again to load it fresh. The Cached badge uses{" "}
				<code>postDetailQuery.read</code> with <code>params.postId</code> from the HttpApi endpoint.
			</p>
			{AsyncData.matchDataSplitEmpty(postsData, {
				onIdle: () => <LoadingPanel text="Loading posts…" />,
				onLoading: () => <LoadingPanel text="Loading posts…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error.toString()}
						onRetry={function () {
							dispatch(Message.ClickedRetryPosts())
						}}
					/>
				),
				onData: ({ posts }) => (
					<div className="flex flex-col gap-4">
						{Option.match(AsyncData.getError(postsData), {
							onNone: () => null,
							onSome: (error) => (
								<ErrorPanel
									error={error.toString()}
									onRetry={function () {
										dispatch(Message.ClickedRetryPosts())
									}}
								/>
							),
						})}
						<PostListItems
							posts={posts}
							postDetailById={model.postDetailById}
							onSelect={function (postId) {
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
				onClick={function () {
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
						error={error.toString()}
						onRetry={function () {
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
									error={error.toString()}
									onRetry={function () {
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

function StatsCards(props: { stats: Stats; fetchedAt: number; isRefreshing: boolean }) {
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
	const statsData = statsQuery.read(model.stats)
	const isPending = AsyncData.isPending(statsData)

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="text-xl font-semibold tracking-tight">Stats</h2>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={function () {
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
			{AsyncData.matchDataSplitEmpty(statsData, {
				onIdle: () => <LoadingPanel text="Loading stats…" />,
				onLoading: () => <LoadingPanel text="Loading stats…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error.toString()}
						onRetry={function () {
							dispatch(Message.ClickedRetryStats())
						}}
					/>
				),
				onData: ({ stats, fetchedAt }) => (
					<div className="flex flex-col gap-4">
						{Option.match(AsyncData.getError(statsData), {
							onNone: () => null,
							onSome: (error) => (
								<ErrorPanel
									error={error.toString()}
									onRetry={function () {
										dispatch(Message.ClickedRetryStats())
									}}
								/>
							),
						})}
						<StatsCards
							stats={stats}
							fetchedAt={fetchedAt}
							isRefreshing={AsyncData.isRefreshing(statsData)}
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

function View() {
	return (
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
}

export function ApiCacheHttpApi() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
