/** Real router fixture using the public Loader and TanStack APIs. */
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router"
import { Context, Effect, Layer, Option, Result, Schema } from "effect"
import * as Query from "foldkit/experimental/query"
import React from "react"
import * as AsyncData from "../../src/asyncData"
import * as Command from "../../src/command"
import * as Loader from "../../src/loader"
import { defineMessageUnion } from "../../src/message"
import * as ReactFoldkit from "../../src/react"
import { defineApplication, defineSubmodel, defineSubmodelProjection } from "../../src/react"
import { modifyFields } from "../../src/struct"
import * as TanStackSource from "../../src/tanstack"
import * as Update from "../../src/update"

const SearchResponse = Schema.Struct({
	query: Schema.String,
	revision: Schema.Finite,
	fetchedAt: Schema.DateFromString,
})
export type SearchResponse = typeof SearchResponse.Type

export const response = (query: string, revision = 1): SearchResponse => ({
	query,
	revision,
	fetchedAt: new Date("2026-09-30T10:00:00.000Z"),
})

type Load = (query: string) => Effect.Effect<SearchResponse, string>

class LoaderApi extends Context.Service<
	LoaderApi,
	{
		readonly load: Load
	}
>()("RouteLoaderTest/LoaderApi") {}

const query = Query.define({
	name: "RouteLoaderTest",
	interrupt: true,
	args: { query: Schema.String },
	toKey: ({ query }) => query,
	data: SearchResponse,
	error: Schema.String,
	execute: ({ query }) => Effect.flatMap(LoaderApi, (api) => api.load(query)),
})

const SearchLoader = Loader.fromQuery(query)
const SearchModel = Schema.Struct({
	activeQuery: Schema.String,
	results: query.Model,
})
const SearchMessage = defineMessageUnion({
	GotQueryMessage: { message: query.Message },
	Revalidated: { query: Schema.String },
})
type SearchModel = typeof SearchModel.Type
type SearchMessage = typeof SearchMessage.Type

const resultsChild = query.lift<SearchModel, SearchMessage>({
	parentField: "results",
	toParentMessage: (message) => SearchMessage.GotQueryMessage({ message }),
})

// The feature folds ordinary Query Messages and external loader outcomes alike.
const searchUpdate = (
	model: SearchModel,
	message: SearchMessage
): Update.Return<SearchModel, SearchMessage, LoaderApi> =>
	SearchMessage.match(message, {
		GotQueryMessage: function ({ message }) {
			return resultsChild.fold(model, message)
		},
		Revalidated: function ({ query }) {
			return resultsChild.revalidateOrLoad(model, { query })
		},
	})
const { Provider, useModel } = defineSubmodel<SearchModel, SearchMessage>()

export const AppModel = Schema.Struct({ search: SearchModel, edits: Schema.Finite, loads: Schema.Finite })
export type AppModel = typeof AppModel.Type
const AppMessage = defineMessageUnion({
	GotSearchMessage: { message: SearchMessage },
	CompletedLoadSearch: { load: SearchLoader.Load },
	Edited: {},
	BurnedBudget: {},
})
export type AppMessage = typeof AppMessage.Type

const routeLoader = SearchLoader.pipe(Loader.mapMessages((load) => AppMessage.CompletedLoadSearch({ load })))

export interface Observation {
	readonly routeQuery: string
	readonly loaderRevision: number | undefined
	readonly modelQuery: string
	readonly result: AsyncData.AsyncData<SearchResponse, string>
	readonly model: AppModel
}

export function createFixture(
	options: {
		initial?: string
		isServer?: boolean
		documentShell?: boolean
		load?: Load
		fetch?: Load
		onBurn?: () => void
		onPublish?: (snapshot: ReadonlyArray<ReactFoldkit.CommitEntry<AppMessage>>) => void
	} = {}
) {
	const renders: Observation[] = []
	const layoutModels: AppModel[] = []
	// Live route deliveries exclude the Messages folded into bootstrap init below.
	const liveRouteDeliveries: AppMessage[] = []
	const updates: AppMessage[] = []
	const loaderCalls: string[] = []
	const fetchCalls: string[] = []
	let dispatch!: (message: AppMessage) => void
	let layoutMounts = 0
	let isSourceConnected = false

	const child = Update.foldChild({
		update: searchUpdate,
		read: (model: AppModel) => Option.some(model.search),
		write: (model: AppModel, search: SearchModel) => modifyFields(model, { search: () => search }),
		toParentMessage: (message: SearchMessage) => AppMessage.GotSearchMessage({ message }),
	})
	const update = (model: AppModel, message: AppMessage): Update.Return<AppModel, AppMessage, LoaderApi> =>
		AppMessage.match(message, {
			GotSearchMessage: function ({ message }) {
				return child(model, message)
			},
			CompletedLoadSearch({ load }) {
				const { args, result } = load
				const settled = Loader.settleQueryIf(query, model.search.results, args, result, {
					fresher: (incoming, current) => incoming.revision > current.revision,
				})
				const search = modifyFields(model.search, {
					results: () => settled.model,
					activeQuery: () => args.query,
				})
				const commands = Command.mapMessages(settled.commands, (message) =>
					AppMessage.GotSearchMessage({ message: SearchMessage.GotQueryMessage({ message }) })
				)
				return {
					model: modifyFields(model, {
						search: () => search,
						loads: (loads) => loads + 1,
					}),
					...(commands.length > 0 ? { commands } : {}),
				}
			},
			Edited: function () {
				return { model: modifyFields(model, { edits: (edits) => edits + 1 }) }
			},
			BurnedBudget() {
				options.onBurn?.()
				return { model }
			},
		})
	const App = defineApplication({
		Model: AppModel,
		layer: Layer.succeed(LoaderApi, {
			load: (query) =>
				Effect.suspend(function () {
					fetchCalls.push(query)
					return options.fetch?.(query) ?? Effect.succeed(response(query))
				}),
		}),
		update(model: AppModel, message: AppMessage) {
			updates.push(message)
			if (isSourceConnected && message._tag === "CompletedLoadSearch") liveRouteDeliveries.push(message)
			return update(model, message)
		},
	})
	const searchProjection = defineSubmodelProjection({
		read: (model: AppModel) => model.search,
		toParentMessage: (message: SearchMessage) => AppMessage.GotSearchMessage({ message }),
	})
	function Layout() {
		const parentDispatch = App.useDispatch()
		dispatch = parentDispatch
		const model = App.useModel()
		layoutModels.push(model)
		React.useEffect(function recordLayoutMount() {
			layoutMounts += 1
		}, [])
		return (
			<App.SubmodelProvider
				projection={searchProjection}
				render={({ source }) => (
					<Provider source={source}>
						<Outlet />
					</Provider>
				)}
			/>
		)
	}
	function RootLayout() {
		const router = useRouter()
		const source = React.useMemo<ReactFoldkit.CommitSource<AppMessage, Schema.SchemaError>>(
			() => ({
				getSnapshot: () => adapter.getSnapshot(),
				subscribe(notify) {
					isSourceConnected = true
					const unsubscribe = adapter.subscribe(function () {
						options.onPublish?.(Result.getOrThrow(adapter.getSnapshot()))
						notify()
					})
					return function () {
						isSourceConnected = false
						unsubscribe()
					}
				},
			}),
			[router]
		)
		const initial: AppModel = { search: { activeQuery: "", results: query.init("search") }, edits: 0, loads: 0 }
		return (
			<App.Provider
				init={{ model: initial }}
				commitSource={source}
			>
				<Layout />
			</App.Provider>
		)
	}
	function RootDocument({ children }: { children: React.ReactNode }) {
		return (
			<html>
				<head />
				<body>
					{children}
					<Scripts />
				</body>
			</html>
		)
	}
	const root = createRootRoute({
		component: RootLayout,
		shellComponent: (options.documentShell ?? options.isServer ?? false) ? RootDocument : undefined,
	})
	const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <span>Home</span> })
	const search = createRoute({
		getParentRoute: () => root,
		path: "/search/$query",
		loader: ({ params, abortController }) =>
			Effect.runPromise(
				SearchLoader.loadQuery({ query: params.query }).pipe(
					Effect.provideService(LoaderApi, {
						load: (query) =>
							Effect.suspend(function () {
								loaderCalls.push(query)
								return options.load?.(query) ?? Effect.succeed(response(query))
							}),
					})
				),
				{ signal: abortController.signal }
			),
		component: SearchView,
	})
	function SearchView() {
		const { query: routeQuery } = search.useParams()
		const decoded = SearchLoader.decode(search.useLoaderData())
		const loaded = Result.getOrThrow(decoded).result
		const loaderRevision = AsyncData.isSuccess(loaded) ? loaded.data.revision : undefined
		const model = App.useModel()
		const searchModel = useModel()
		const result = query.read(searchModel.results, { query: routeQuery })
		renders.push({ routeQuery, loaderRevision, modelQuery: searchModel.activeQuery, result, model })
		return (
			<span data-testid="search">
				{AsyncData.matchData(result, {
					onEmpty: () => `${routeQuery}:empty`,
					onFailure: (error) => `${routeQuery}:error:${error}`,
					onData: ({ query, revision }) => `${query}:${revision}`,
				})}
			</span>
		)
	}
	const router = createRouter({
		routeTree: root.addChildren([home, search]),
		history: createMemoryHistory({ initialEntries: [options.initial ?? "/"] }),
		isServer: options.isServer ?? false,
		defaultPreloadStaleTime: Infinity,
		defaultStaleTime: Infinity,
		defaultPendingMs: 0,
		defaultPendingMinMs: 0,
	})
	const adapter = Result.getOrThrow(TanStackSource.make(router, [routeLoader]))
	return {
		router,
		renders,
		layoutModels,
		loaderCalls,
		fetchCalls,
		refresh: (query: string) =>
			dispatch(AppMessage.GotSearchMessage({ message: SearchMessage.Revalidated({ query }) })),
		liveRouteDeliveries,
		updates,
		edit: () => dispatch(AppMessage.Edited()),
		burn: () => dispatch(AppMessage.BurnedBudget()),
		get layoutMounts() {
			return layoutMounts
		},
		get resolvedEntries() {
			return Result.getOrThrow(adapter.getSnapshot())
		},
	}
}
