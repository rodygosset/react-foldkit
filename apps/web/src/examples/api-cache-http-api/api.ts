import { Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiClient, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import {
	FetchedPostDetail,
	FetchedPosts,
	FetchedStats,
	fetchPostDetail,
	fetchPosts,
	fetchStats,
} from "../api-cache/data"

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

const BlogHandlers = HttpApiBuilder.group(BlogApi, "blog", (handlers) =>
	handlers
		.handle("listPosts", () => fetchPosts)
		.handle("getPost", ({ params }) => fetchPostDetail(params.postId))
		.handle("getStats", () => fetchStats)
)

/** A real HttpApi client whose fetch is served in memory by the BlogApi handlers. */
export class BlogClient extends Context.Service<BlogClient, HttpApiClient.ForApi<typeof BlogApi>>()("BlogClient") {
	static readonly layer = Layer.effect(
		BlogClient,
		Effect.gen(function* () {
			const webHandler = yield* Effect.acquireRelease(
				Effect.sync(() =>
					HttpRouter.toWebHandler(
						HttpApiBuilder.layer(BlogApi).pipe(
							Layer.provide(BlogHandlers),
							Layer.provide(HttpServer.layerServices)
						),
						{ disableLogger: true }
					)
				),
				({ dispose }) => Effect.promise(dispose)
			)
			const httpClient = yield* HttpClient.HttpClient.pipe(
				Effect.provide(FetchHttpClient.layer),
				Effect.provideService(FetchHttpClient.Fetch, (input, options) =>
					webHandler.handler(new Request(input, options))
				)
			)
			return yield* HttpApiClient.makeWith(BlogApi, {
				baseUrl: "http://blog.local",
				httpClient,
			})
		})
	)
}
