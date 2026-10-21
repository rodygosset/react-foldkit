import { Array, Result, SchemaAST, type Schema } from "effect"

type Fields<Message> = { readonly [Key in keyof Message as Key extends "_tag" ? never : Key]: Message[Key] }

type SendVariant<Message> = keyof Fields<Message> extends never ? () => void : (fields: Fields<Message>) => void

/**
 * Sends Messages by tag. `send.ChangedTitle({ title })` builds the Message with the union's
 * constructor and dispatches it. `send(message)` dispatches a Message you already built.
 *
 * @see `ModelHooks.useSend`, which returns one for the Provider's Message union
 * @category models
 * @since 0.2.0
 */
export type Send<Message> = ((message: Message) => void) & {
	readonly [
		Variant in Message as Variant extends { readonly _tag: infer Tag extends string } ? Tag : never
	]: SendVariant<Variant>
}

type Constructors<Message> = Readonly<Record<string, (fields?: unknown) => Message>>

// Reads the variant tags from the Schema AST. defineMessageUnion builds a Union of tagged
// structs; a Union may also nest other unions, such as a Query's Messages.
function variantTags(ast: SchemaAST.AST): ReadonlyArray<string> {
	if (SchemaAST.isUnion(ast)) return Array.flatMap(ast.types, variantTags)
	if (!SchemaAST.isObjects(ast)) return []
	return Array.filterMap(ast.propertySignatures, (property) =>
		property.name === "_tag" && SchemaAST.isLiteral(property.type)
			? Result.succeed(String(property.type.literal))
			: Result.failVoid
	)
}

/**
 * Creates the function that builds a Send for one Message union. Call it once per union and
 * the returned function once per dispatch function.
 */
export function sendFor<Message>(union: Schema.Schema<Message>) {
	const constructors = union as unknown as Constructors<Message>
	const tags = variantTags(union.ast)
	return function (dispatch: (message: Message) => void): Send<Message> {
		const send = (message: Message) => dispatch(message)
		for (const tag of tags) {
			// Foldkit unions expose a constructor per tag. Other tagged Schemas get a plain Message.
			const make = constructors[tag] ?? ((fields?: unknown) => ({ ...(fields as object), _tag: tag }) as Message)
			// defineProperty, because a function's own `name` and `length` are read-only.
			Object.defineProperty(send, tag, { enumerable: true, value: (fields?: unknown) => dispatch(make(fields)) })
		}
		return send as Send<Message>
	}
}
