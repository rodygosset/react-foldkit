export const FOLDKIT_MOUNT_KEY = "foldkitMount"
export const FileHandlerSymbol = Symbol.for("foldkit/html/fileHandler")

export const kebabToPascal = (input: string): string =>
	input.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("")

export const tagNameFromSelector = (selector: string): string => {
	const hashIndex = selector.indexOf("#")
	const dotIndex = selector.indexOf(".")
	const hashEnd = hashIndex > 0 ? hashIndex : selector.length
	const dotEnd = dotIndex > 0 ? dotIndex : selector.length
	return selector.slice(0, Math.min(hashEnd, dotEnd))
}

export const serializedStylePropertyName = (name: string): string => {
	if (name.startsWith("--")) return name
	const canonicalName = name.startsWith("Webkit") ? `webkit${name.slice(6)}` : name
	const kebabName = canonicalName.replace(/[A-Z]/g, (letter) => `-${letter}`).toLowerCase()
	return kebabName.startsWith("webkit-") || kebabName.startsWith("ms-") ? `-${kebabName}` : kebabName
}

export const StringExt = {
	stripPrefix: (prefix: string) => (input: string) =>
		input.startsWith(prefix) ? Option.some(input.slice(prefix.length)) : Option.none(),
}
import { Option } from "effect"

