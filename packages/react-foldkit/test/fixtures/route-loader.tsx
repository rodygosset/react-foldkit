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
import { Context, Effect, Layer, Option, Schema } from "effect"
import React from "react"
import * as AsyncData from "../../src/asyncData"
import * as Loader from "../../src/loader"
import * as TanStackSource from "../../src/tanstack"
import { defineMessageUnion } from "../../src/message"
import * as Query from "../../src/query"
import * as ReactFoldkit from "../../src/react"
import { defineApplication, defineSubmodel, defineSubmodelProjection } from "../../src/react"
import { modifyFields } from "../../src/struct"
import * as Update from "../../src/update"

const SearchResponse = Schema.Struct({
	query: Schema.String,
	revision: Schema.Number,
	fetchedAt: Schema.DateFromString,
})
export type SearchResponse = typeof SearchResponse.Type

export function response(query: string, revision = 1): SearchResponse {
	return { query, revision, fetchedAt: new Date("2026-09-30T10:00:00.000Z") }
}

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
	LoadedFromRoute: {
		query: Schema.String,
		result: SearchLoader.Load.fields.result,
	},
})
type SearchModel = typeof SearchModel.Type
type SearchMessage = typeof SearchMessage.Type

const resultsChild = query.lift<SearchModel, SearchMessage>({
	field: "results",
	toParentMessage: (message) => SearchMessage.GotQueryMessage({ message }),
})

// The feature folds ordinary Query Messages and external loader outcomes alike.
function searchUpdate(
	model: SearchModel,
	message: SearchMessage
): Update.Return<SearchModel, SearchMessage, LoaderApi> {
	return SearchMessage.match(message, {
		GotQueryMessage: ({ message }) => resultsChild.fold(model, message),
		Revalidated: ({ query }) => resultsChild.revalidateOrLoad(model, { query }),
		LoadedFromRoute({ query: q, result }) {
			const settled = Loader.settleIfLoadKeyed(resultsChild, model, { query: q, result }, {
				fresher: function (incoming, current) {
					return incoming.revision > current.revision
				},
			})
			return { ...settled, model: modifyFields(settled.model, { activeQuery: () => q }) }
		},
	})
}
const { Provider, useModel } = defineSubmodel<SearchModel, SearchMessage>()

export const AppModel = Schema.Struct({ search: SearchModel, edits: Schema.Number, loads: Schema.Number })
export type AppModel = typeof AppModel.Type
const AppMessage = defineMessageUnion({
	GotSearchMessage: { message: SearchMessage },
	Edited: {},
	BurnedBudget: {},
})
export type AppMessage = typeof AppMessage.Type

const routeLoader = SearchLoader.pipe(
	Loader.mapMessages(function ({ query, result }) {
		return AppMessage.GotSearchMessage({
			message: SearchMessage.LoadedFromRoute({ query, result }),
		})
	}),
)

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
	function update(model: AppModel, message: AppMessage): Update.Return<AppModel, AppMessage, LoaderApi> {
		return AppMessage.match(message, {
			GotSearchMessage: ({ message }) => {
				const folded = child(model, message)
				return {
					...folded,
					model: modifyFields(folded.model, {
						loads: (loads) => loads + (message._tag === "LoadedFromRoute" ? 1 : 0),
					}),
				}
			},
			Edited: () => ({ model: modifyFields(model, { edits: (edits) => edits + 1 }) }),
			BurnedBudget: () => {
				options.onBurn?.()
				return { model }
			},
		})
	}
	const App = defineApplication({
		Model: AppModel,
		layer: Layer.succeed(LoaderApi, {
			load: (query) =>
				Effect.suspend(() => {
					fetchCalls.push(query)
					return options.fetch?.(query) ?? Effect.succeed(response(query))
				}),
		}),
		update: (model: AppModel, message: AppMessage) => {
			updates.push(message)
			if (isSourceConnected && message._tag === "GotSearchMessage" && message.message._tag === "LoadedFromRoute")
				liveRouteDeliveries.push(message)
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
		React.useEffect(() => {
			layoutMounts += 1
		}, [])
		return (
			<App.SubmodelProvider
				projection={searchProjection}
				render={({ source }) => <Provider source={source}><Outlet /></Provider>}
			/>
		)
	}
	function RootLayout() {
		const router = useRouter()
		const source = React.useMemo<ReactFoldkit.CommitSource<AppMessage>>(
			() => ({
				getSnapshot: () => adapter.getSnapshot(),
				subscribe: (notify) => {
					isSourceConnected = true
					const unsubscribe = adapter.subscribe(() => {
						options.onPublish?.(adapter.getSnapshot())
						notify()
					})
					return () => {
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
						load: (query) => Effect.suspend(() => {
							loaderCalls.push(query)
							return options.load?.(query) ?? Effect.succeed(response(query))
						}),
					}),
				),
				{ signal: abortController.signal },
			),
		component: SearchView,
	})
	function SearchView() {
		const { query: routeQuery } = search.useParams()
		const loaded = SearchLoader.decode(search.useLoaderData()).result
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
	const adapter = TanStackSource.make(router, [routeLoader])
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
			return adapter.getSnapshot()
		},
	}
}
