import { Equal } from "effect"
import { structuralEquivalence } from "../src/application/structuralEquivalence.ts"

// Measures what one `useModel(selector)` subscriber pays on each Model change. The selector runs,
// then a compare checks the new selection against the last one. `structuralEquivalence` is the
// default, `Equal.equals` gives the same answers, and `Object.is` is the floor. Each change is a
// keystroke in a form field, so the todos keep their references, as after a Foldkit update.
//
// Run with `bun run bench:selection`.

const changes = 2_000

const makeModel = (size) =>
	Object.freeze({
		draft: "",
		todos: Object.freeze(
			Array.from({ length: size }, (_, index) =>
				Object.freeze({ id: `todo-${index}`, title: `Todo number ${index}`, done: index % 3 === 0 })
			)
		),
	})

const typeKey = (model) => Object.freeze({ ...model, draft: model.draft + "a" })

const selectors = {
	"A field that keeps its reference": (model) => model.todos,
	"A new filtered array": (model) => model.todos.filter((todo) => !todo.done),
	"New objects for each item": (model) => model.todos.map((todo) => ({ id: todo.id, label: todo.title })),
	"A small new object": (model) => ({ count: model.todos.length, typing: model.draft.length > 0 }),
}

const comparisons = { structuralEquivalence, "Equal.equals": Equal.equals, "Object.is": Object.is }

function measure(size, select, isEqual) {
	let model = makeModel(size)
	let selected = select(model)
	let elapsed = 0
	let kept = 0
	for (let change = -200; change < changes; change++) {
		model = typeKey(model)
		const next = select(model)
		const start = performance.now()
		const same = isEqual(selected, next)
		// The first 200 changes warm up the JIT and Effect's hash cache.
		if (change >= 0) {
			elapsed += performance.now() - start
			if (same) kept++
		}
		if (!same) selected = next
	}
	return { microseconds: (elapsed / changes) * 1000, rerenders: kept < changes }
}

const cell = (text, width) => text.padEnd(width)

for (const size of [1_000, 10_000]) {
	process.stdout.write(`\n${size} todos, compare time per change\n`)
	process.stdout.write(
		`${cell("Selection", 34)}${Object.keys(comparisons)
			.map((name) => cell(name, 24))
			.join("")}\n`
	)
	for (const [selection, select] of Object.entries(selectors)) {
		const results = Object.values(comparisons).map((isEqual) => measure(size, select, isEqual))
		const cells = results.map(({ microseconds, rerenders }) =>
			cell(`${microseconds.toFixed(2)} µs${rerenders ? ", re-renders" : ""}`, 24)
		)
		process.stdout.write(`${cell(selection, 34)}${cells.join("")}\n`)
	}
}
