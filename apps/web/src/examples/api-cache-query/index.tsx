import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Array, Clock, Duration, Effect, Match, Option, Schema, Stream } from "effect"
import { ReactFoldkit } from "react-foldkit"
import * as AsyncData from "react-foldkit/asyncData"
import { defineMessageUnion } from "react-foldkit/message"
import * as Query from "react-foldkit/query"
import { evo } from "react-foldkit/struct"
import * as Subscription from "react-foldkit/subscription"
import * as Update from "react-foldkit/update"
import { ExampleShell } from "../../components/example-shell"
import { Post, PostDetail, Stats, fetchPostDetail, fetchPosts, fetchStats } from "../api-cache/data"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

const FetchedPosts = Schema.Struct({ posts: Schema.Array(Post), fetchedAt: Schema.Number })
const FetchedPostDetail = Schema.Struct({
	detail: PostDetail,
	fetchedAt: Schema.Number,
})
const FetchedStats = Schema.Struct({ stats: Stats, fetchedAt: Schema.Number })

const postsQuery = Query.define({
	name: "Posts",
	data: FetchedPosts,
	error: Schema.String,
	execute: Effect.gen(function* () {
		const list = yield* fetchPosts
		const fetchedAt = yield* Clock.currentTimeMillis
		return { posts: list, fetchedAt }
	}),
})

const statsQuery = Query.define({
	name: "Stats",
	data: FetchedStats,
	error: Schema.String,
	execute: Effect.gen(function* () {
		const snapshot = yield* fetchStats
		const fetchedAt = yield* Clock.currentTimeMillis
		return { stats: snapshot, fetchedAt }
	}),
})

const postDetailQuery = Query.define({
	name: "PostDetail",
	args: { postId: Schema.String },
	keyFields: ["postId"],
	toKey: ({ postId }) => postId,
	data: FetchedPostDetail,
	error: Schema.String,
	execute: ({ postId }) =>
		Effect.gen(function* () {
			const detail = yield* fetchPostDetail(postId)
			const fetchedAt = yield* Clock.currentTimeMillis
			return { detail, fetchedAt }
		}),
})

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

const {
	ClickedTab,
	ClickedPost,
	ClickedBackToPosts,
	ClickedInvalidatePosts,
	ClickedRetryPosts,
	ClickedRetryPostDetail,
	ClickedRefreshStats,
	ClickedRetryStats,
} = Message

type UpdateReturn = Update.Return<Model, Message>

const postsField = postsQuery.foldChild({
	read: (model: Model) => Option.some(model.posts),
	write: (model, nextPosts) => evo(model, { posts: () => nextPosts }),
	toParentMessage: (childMessage) => Message.GotPostsMessage({ message: childMessage }),
})

const statsField = statsQuery.foldChild({
	read: (model: Model) => Option.some(model.stats),
	write: (model, nextStats) => evo(model, { stats: () => nextStats }),
	toParentMessage: (childMessage) => Message.GotStatsMessage({ message: childMessage }),
})

const postDetailField = postDetailQuery.foldChild({
	read: (model: Model) => Option.some(model.postDetailById),
	write: (model, nextPostDetailById) => evo(model, { postDetailById: () => nextPostDetailById }),
	toParentMessage: (childMessage) => Message.GotPostDetailMessage({ message: childMessage }),
})

function activateTab(model: Model, tab: Tab): UpdateReturn {
	const modelWithActiveTab = evo(model, { activeTab: () => tab })

	return Match.value(tab).pipe(
		Match.withReturnType<UpdateReturn>(),
		Match.when("Posts", () => postsField.loadIfMissing(modelWithActiveTab)),
		Match.when("Stats", () => statsField.loadIfMissing(modelWithActiveTab)),
		Match.exhaustive
	)
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		GotPostsMessage: ({ message: postsMessage }) => postsField.fold(model, postsMessage),
		GotStatsMessage: ({ message: statsMessage }) => statsField.fold(model, statsMessage),
		GotPostDetailMessage: ({ message: postDetailMessage }) => postDetailField.fold(model, postDetailMessage),
		ClickedTab: ({ tab }) => activateTab(model, tab),
		ClickedPost: ({ postId }) =>
			Update.identity(
				evo(model, {
					maybeSelectedPostId: () => Option.some(postId),
				})
			),
		ClickedBackToPosts: () => Update.identity(evo(model, { maybeSelectedPostId: () => Option.none() })),
		ClickedInvalidatePosts: () => postsField.revalidateOrLoad(model),
		ClickedRetryPosts: () => postsField.revalidateOrLoad(model),
		ClickedRetryPostDetail: ({ postId }) => postDetailField.revalidateOrLoad(model, { postId }),
		ClickedRefreshStats: () => statsField.revalidateOrLoad(model),
		ClickedRetryStats: () => statsField.revalidateOrLoad(model),
		TickedRevalidateStats: () => statsField.revalidate(model),
	})

const init = (): UpdateReturn =>
	postsField.revalidateOrLoad({
		activeTab: "Posts",
		posts: postsQuery.init(),
		postDetailById: postDetailQuery.init(),
		maybeSelectedPostId: Option.none(),
		stats: statsQuery.init(),
	})

const subscriptions = Subscription.make<Model, Message>()((entry) => ({
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
	watchPostDetail: postDetailQuery.watchSubscription(entry, {
		toParentMessage: (message) => Message.GotPostDetailMessage({ message }),
		modelToArgs: (model) =>
			Option.match(model.maybeSelectedPostId, {
				onNone: () => [],
				onSome: (postId) => [{ postId }],
			}),
	}),
}))

const { Provider, useModel, useDispatch } = ReactFoldkit.make({
	update,
	subscriptions,
})

const formatFetchedAt = (fetchedAt: number): string => new Date(fetchedAt).toLocaleTimeString()

const isPostDetailCached = (postDetailById: Model["postDetailById"], postId: string): boolean =>
	AsyncData.hasData(postDetailQuery.read(postDetailById, { postId }))

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
			Fetched at {formatFetchedAt(props.fetchedAt)}. Leaving this screen forgets the detail slot.
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
						dispatch(ClickedInvalidatePosts())
					}}
				>
					{AsyncData.isRefreshing(model.posts) ? "Refreshing…" : "Invalidate"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Open a post, then go back. The list stays Success. The detail key is forgotten when nothing is watching
				it. Open the same post again to load it fresh.
			</p>
			{AsyncData.matchDataSplitEmpty(model.posts, {
				onIdle: () => <LoadingPanel text="Loading posts…" />,
				onLoading: () => <LoadingPanel text="Loading posts…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={() => {
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
									onRetry={() => {
										dispatch(ClickedRetryPosts())
									}}
								/>
							),
						})}
						<PostListItems
							posts={posts}
							postDetailById={model.postDetailById}
							onSelect={(postId) => {
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
	const postDetailData = postDetailQuery.read(model.postDetailById, { postId: props.postId })

	return (
		<div className="flex flex-col gap-4">
			<Button
				variant="ghost"
				size="sm"
				className="self-start"
				onClick={() => {
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
						onRetry={() => {
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
									onRetry={() => {
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

const PostsTabView = () => {
	const maybeSelectedPostId = useModel((model) => model.maybeSelectedPostId)

	return Option.match(maybeSelectedPostId, {
		onNone: () => <PostsListView />,
		onSome: (postId) => <PostDetailView postId={postId} />,
	})
}

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
						dispatch(ClickedRefreshStats())
					}}
				>
					{isPending ? "Refreshing…" : "Refresh"}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">
				Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the new ones
				load. Query.define owns those AsyncData transitions.
			</p>
			{AsyncData.matchDataSplitEmpty(model.stats, {
				onIdle: () => <LoadingPanel text="Loading stats…" />,
				onLoading: () => <LoadingPanel text="Loading stats…" />,
				onFailure: (error) => (
					<ErrorPanel
						error={error}
						onRetry={() => {
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
									onRetry={() => {
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
			{Array.map(tabValues, (tab) => {
				const isActive = activeTab === tab
				return (
					<Button
						key={tab}
						variant={isActive ? "default" : "ghost"}
						size="sm"
						aria-current={isActive ? "page" : undefined}
						onClick={() => {
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

const View = () => (
	<ExampleShell
		title="API Cache (Query)"
		description="The same Model-as-cache TEA as API Cache. Query.define owns settle, retry, and in-flight dedup; watch keeps the live key set; the parent only folds Got* and intent."
	>
		<div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 pt-8 pb-16">
			<TabList />
			<Separator />
			<TabPanel />
		</div>
	</ExampleShell>
)

export const ApiCacheQuery = () => (
	<Provider init={init()}>
		<View />
	</Provider>
)
