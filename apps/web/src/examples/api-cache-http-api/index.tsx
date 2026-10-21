import { Duration, Effect, Match, Option, Schema, Stream } from "effect"
import * as AsyncData from "foldkit/asyncData"
import * as Query from "foldkit/experimental/query"
import { defineMessageUnion } from "foldkit/message"
import * as Application from "react-foldkit/application"
import { modifyFields } from "foldkit/struct"
import * as Subscription from "foldkit/subscription"
import * as Update from "foldkit/update"
import {
	ApiCacheLayout,
	AsyncDataPanel,
	BackButton,
	PostDetailCard,
	PostListItems,
	SectionHeader,
	StatsCards,
	Tab,
} from "../api-cache/ui"
import { BlogClient } from "./api"
import { FetchedPostDetail, FetchedPosts, FetchedStats } from "../api-cache/data"

const STATS_REFETCH_INTERVAL = Duration.seconds(5)

const postsQuery = Query.define({
	name: "Posts",
	data: FetchedPosts,
	error: Schema.String,
	execute: Effect.gen(function* () {
		const client = yield* BlogClient
		return yield* client.blog.listPosts()
	}).pipe(Effect.mapError(String)),
})

const statsQuery = Query.define({
	name: "Stats",
	data: FetchedStats,
	error: Schema.String,
	execute: Effect.gen(function* () {
		const client = yield* BlogClient
		return yield* client.blog.getStats()
	}).pipe(Effect.mapError(String)),
})

const postDetailQuery = Query.define({
	name: "PostDetail",
	args: { postId: Schema.String },
	data: FetchedPostDetail,
	error: Schema.String,
	execute: ({ postId }) =>
		Effect.gen(function* () {
			const client = yield* BlogClient
			return yield* client.blog.getPost({ params: { postId } })
		}).pipe(Effect.mapError(String)),
})

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
		GotPostsMessage: ({ message: postsMessage }) => posts.fold(model, postsMessage),
		GotStatsMessage: ({ message: statsMessage }) => stats.fold(model, statsMessage),
		GotPostDetailMessage: ({ message: postDetailMessage }) => postDetail.fold(model, postDetailMessage),
		ClickedTab: ({ tab }) => activateTab(model, tab),
		ClickedPost: ({ postId }) =>
			Update.combine(modifyFields(model, { maybeSelectedPostId: () => Option.some(postId) }), [
				postDetail.reset,
				postDetail.loadIfMissing({ postId }),
			]),
		ClickedBackToPosts: () => postDetail.reset(modifyFields(model, { maybeSelectedPostId: () => Option.none() })),
		ClickedInvalidatePosts: () => posts.revalidateOrLoad(model),
		ClickedRetryPosts: () => posts.revalidateOrLoad(model),
		ClickedRetryPostDetail: ({ postId }) => postDetail.revalidateOrLoad(model, { postId }),
		ClickedRefreshStats: () => stats.revalidateOrLoad(model),
		ClickedRetryStats: () => stats.revalidateOrLoad(model),
		TickedRevalidateStats: () => stats.revalidate(model),
	})

const init = (): UpdateReturn =>
	posts.loadIfMissing({
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

const { Provider, useModel, useSend } = Application.define(
	{ Model, Message, update, subscriptions },
	{
		resources: BlogClient.layer,
	}
)

function PostsListView() {
	const postsData = useModel((model) => postsQuery.read(model.posts))
	const postDetailById = useModel((model) => model.postDetailById)
	const send = useSend()

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Posts"
				actionLabel={AsyncData.isRefreshing(postsData) ? "Refreshing…" : "Invalidate"}
				isActionDisabled={AsyncData.isPending(postsData)}
				onAction={() => send.ClickedInvalidatePosts()}
			>
				Open a post, then go back. The list stays Success. <code>reset</code> clears cached post details; late
				responses for cleared entries are ignored. Open the same post again to load it fresh. The Cached badge
				uses <code>postDetailQuery.read</code> with the post identifier.
			</SectionHeader>
			<AsyncDataPanel
				data={postsData}
				loadingText="Loading posts…"
				onRetry={() => send.ClickedRetryPosts()}
			>
				{(fetched) => (
					<PostListItems
						posts={fetched.posts}
						isCached={(postId) => AsyncData.hasData(postDetailQuery.read(postDetailById, { postId }))}
						onSelect={(postId) => send.ClickedPost({ postId })}
					/>
				)}
			</AsyncDataPanel>
		</div>
	)
}

function PostDetailView(props: { postId: string }) {
	const postDetailData = useModel((model) => postDetailQuery.read(model.postDetailById, { postId: props.postId }))
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
						note="Leaving this screen clears cached details. Late responses cannot restore a cleared entry."
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
	const statsData = useModel((model) => statsQuery.read(model.stats))
	const send = useSend()
	const isPending = AsyncData.isPending(statsData)

	return (
		<div className="flex flex-col gap-4">
			<SectionHeader
				title="Stats"
				actionLabel={isPending ? "Refreshing…" : "Refresh"}
				isActionDisabled={isPending}
				onAction={() => send.ClickedRefreshStats()}
			>
				Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the new ones
				load. Query owns those AsyncData transitions.
			</SectionHeader>
			<AsyncDataPanel
				data={statsData}
				loadingText="Loading stats…"
				onRetry={() => send.ClickedRetryStats()}
			>
				{(fetched) => (
					<StatsCards
						stats={fetched.stats}
						fetchedAt={fetched.fetchedAt}
						isRefreshing={AsyncData.isRefreshing(statsData)}
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
			title="API Cache (HttpApi)"
			description="Query defines the cache Model and transitions. Its execute Effect reads BlogClient from the application Layer and calls a typed HttpApi endpoint. The parent folds Query Messages and handles user intent."
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

export function ApiCacheHttpApi() {
	return (
		<Provider init={init()}>
			<View />
		</Provider>
	)
}
