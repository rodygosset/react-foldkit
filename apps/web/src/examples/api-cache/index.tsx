import { Duration, Effect, HashMap, Match, Option, Schema, Stream, pipe } from "effect"
import * as AsyncData from "foldkit/asyncData"
import * as Command from "foldkit/command"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "foldkit/subscription"
import type * as Update from "foldkit/update"
import { FetchedPostDetail, FetchedPosts, FetchedStats, fetchPostDetail, fetchPosts, fetchStats } from "./data"
import {
	ApiCacheLayout,
	AsyncDataPanel,
	BackButton,
	PostDetailCard,
	PostListItems,
	SectionHeader,
	StatsCards,
	Tab,
} from "./ui"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

// MODEL

const PostsData = AsyncData.Schema(FetchedPosts, Schema.String)
const PostDetailData = AsyncData.Schema(FetchedPostDetail, Schema.String)
const StatsData = AsyncData.Schema(FetchedStats, Schema.String)

type PostsData = typeof PostsData.schema.Type
type PostDetailData = typeof PostDetailData.schema.Type
type StatsData = typeof StatsData.schema.Type

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

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const applyPostsTransition = (model: Model, maybeNextPosts: Option.Option<PostsData>): UpdateReturn =>
	Option.match(maybeNextPosts, {
		onNone: () => ({ model }),
		onSome: (nextPosts) => ({ model: modifyFields(model, { posts: () => nextPosts }), commands: [FetchPosts()] }),
	})

const applyStatsTransition = (model: Model, maybeNextStats: Option.Option<StatsData>): UpdateReturn =>
	Option.match(maybeNextStats, {
		onNone: () => ({ model }),
		onSome: (nextStats) => ({ model: modifyFields(model, { stats: () => nextStats }), commands: [FetchStats()] }),
	})

const loadPostDetail = (model: Model, postId: string): UpdateReturn => ({
	model: modifyFields(model, {
		postDetailById: HashMap.set<string, PostDetailData>(postId, PostDetailData.Loading()),
	}),
	commands: [FetchPostDetail({ postId })],
})

function activateTab(model: Model, tab: Tab): UpdateReturn {
	const modelWithActiveTab = modifyFields(model, { activeTab: () => tab })

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

function selectPost(model: Model, postId: string): UpdateReturn {
	const selectedModel = modifyFields(model, {
		maybeSelectedPostId: () => Option.some(postId),
	})

	return HashMap.has(model.postDetailById, postId) ? { model: selectedModel } : loadPostDetail(selectedModel, postId)
}

const update = (model: Model, message: Message): UpdateReturn =>
	Message.match<UpdateReturn>(message, {
		ClickedTab: ({ tab }) => activateTab(model, tab),
		ClickedPost: ({ postId }) => selectPost(model, postId),
		ClickedBackToPosts: () => ({
			model: modifyFields(model, { maybeSelectedPostId: () => Option.none() }),
		}),
		ClickedInvalidatePosts: () => applyPostsTransition(model, AsyncData.revalidateOrLoad(model.posts)),
		ClickedRetryPosts: () => applyPostsTransition(model, AsyncData.revalidateOrLoad(model.posts)),
		ClickedRetryPostDetail: ({ postId }) => loadPostDetail(model, postId),
		ClickedRefreshStats: () => applyStatsTransition(model, AsyncData.revalidateOrLoad(model.stats)),
		ClickedRetryStats: () => applyStatsTransition(model, AsyncData.revalidateOrLoad(model.stats)),
		TickedRevalidateStats: () => applyStatsTransition(model, AsyncData.revalidate(model.stats)),
		SettledFetchPosts: ({ result }) => ({
			model: modifyFields(model, { posts: AsyncData.settle(result) }),
		}),
		SettledFetchPostDetail: ({ postId, result }) => ({
			model: modifyFields(model, {
				postDetailById: HashMap.modify(postId, AsyncData.settle(result)),
			}),
		}),
		SettledFetchStats: ({ result }) => ({
			model: modifyFields(model, { stats: AsyncData.settle(result) }),
		}),
	})

// INIT

const init = (): UpdateReturn => ({
	model: {
		activeTab: "Posts",
		posts: PostsData.Loading(),
		postDetailById: HashMap.empty(),
		maybeSelectedPostId: Option.none(),
		stats: StatsData.Idle(),
	},
	commands: [FetchPosts()],
})

// COMMAND

const FetchPosts = Command.define("FetchPosts", {
	messages: [Message.SettledFetchPosts],
	execute: pipe(
		fetchPosts,
		Effect.result,
		Effect.map((result) => Message.SettledFetchPosts({ result }))
	),
})

const FetchPostDetail = Command.define("FetchPostDetail", {
	args: { postId: Schema.String },
	messages: [Message.SettledFetchPostDetail],
	execute: ({ postId }) =>
		pipe(
			fetchPostDetail(postId),
			Effect.result,
			Effect.map((result) => Message.SettledFetchPostDetail({ postId, result }))
		),
})

const FetchStats = Command.define("FetchStats", {
	messages: [Message.SettledFetchStats],
	execute: pipe(
		fetchStats,
		Effect.result,
		Effect.map((result) => Message.SettledFetchStats({ result }))
	),
})

// SUBSCRIPTION

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
}))

const { Provider, useModel, useSend } = Application.define({ Model, Message, update, subscriptions })

// VIEW

function PostsListView() {
	const posts = useModel((model) => model.posts)
	const postDetailById = useModel((model) => model.postDetailById)
	const send = useSend()

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Posts"
				actionLabel={AsyncData.isRefreshing(posts) ? "Refreshing…" : "Invalidate"}
				isActionDisabled={AsyncData.isPending(posts)}
				onAction={() => send.ClickedInvalidatePosts()}
			>
				Open a post, go back, and open it again. The second visit renders instantly from the Model. Invalidate
				marks the list stale and refetches it while the current list stays on screen.
			</SectionHeader>
			<AsyncDataPanel
				data={posts}
				loadingText="Loading posts…"
				onRetry={() => send.ClickedRetryPosts()}
			>
				{(fetched) => (
					<PostListItems
						posts={fetched.posts}
						isCached={(postId) => Option.exists(HashMap.get(postDetailById, postId), AsyncData.hasData)}
						onSelect={(postId) => send.ClickedPost({ postId })}
					/>
				)}
			</AsyncDataPanel>
		</div>
	)
}

function PostDetailView(props: { postId: string }) {
	const postDetailData = useModel((model) =>
		Option.getOrElse(HashMap.get(model.postDetailById, props.postId), () => PostDetailData.Idle())
	)
	const send = useSend()

	return (
		<div className="flex flex-col gap-4">
			<BackButton onClick={() => send.ClickedBackToPosts()} />
			<AsyncDataPanel
				data={postDetailData}
				loadingText="Loading post…"
				onRetry={() => send.ClickedRetryPostDetail({ postId: props.postId })}
			>
				{({ detail, fetchedAt }) => (
					<PostDetailCard
						detail={detail}
						fetchedAt={fetchedAt}
						note="Future visits render instantly from the Model."
					/>
				)}
			</AsyncDataPanel>
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

function StatsTabView() {
	const stats = useModel((model) => model.stats)
	const send = useSend()
	const isPending = AsyncData.isPending(stats)

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Stats"
				actionLabel={isPending ? "Refreshing…" : "Refresh"}
				isActionDisabled={isPending}
				onAction={() => send.ClickedRefreshStats()}
			>
				Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the new ones
				load.
			</SectionHeader>
			<AsyncDataPanel
				data={stats}
				loadingText="Loading stats…"
				onRetry={() => send.ClickedRetryStats()}
			>
				{(fetched) => (
					<StatsCards
						stats={fetched.stats}
						fetchedAt={fetched.fetchedAt}
						isRefreshing={AsyncData.isRefreshing(stats)}
					/>
				)}
			</AsyncDataPanel>
		</div>
	)
}

function View() {
	const activeTab = useModel((model) => model.activeTab)
	const send = useSend()

	return (
		<ApiCacheLayout
			slug="api-cache"
			activeTab={activeTab}
			onSelectTab={(tab) => send.ClickedTab({ tab })}
		>
			{Match.value(activeTab).pipe(
				Match.when("Posts", () => <PostsTabView />),
				Match.when("Stats", () => <StatsTabView />),
				Match.exhaustive
			)}
		</ApiCacheLayout>
	)
}

export function ApiCache() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
