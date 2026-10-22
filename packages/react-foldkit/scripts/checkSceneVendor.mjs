import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import manifest from "./sceneVendorManifest.json" with { type: "json" }
import { Scene as FoldkitScene } from "foldkit/test"

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const vendorRoot = resolve(packageRoot, "src/scene/vendor")
const foldkitRoot = resolve(packageRoot, "node_modules/foldkit")
const packageJson = JSON.parse(readFileSync(resolve(foldkitRoot, "package.json"), "utf8"))
if (packageJson.version !== manifest.upstream.version) {
	throw new Error(`Scene vendor expects foldkit@${manifest.upstream.version}, found ${packageJson.version}`)
}

function checkedSource(name) {
	const source = readFileSync(resolve(foldkitRoot, "dist/test", name), "utf8")
	const actual = createHash("sha256").update(source).digest("hex")
	if (actual !== manifest.sourceFiles[name]) {
		throw new Error(`foldkit@${packageJson.version} ${name} hash changed: ${actual}`)
	}
	return source
}

for (const name of Object.keys(manifest.sourceFiles)) checkedSource(name)
const license = readFileSync(resolve(foldkitRoot, "LICENSE"))
if (createHash("sha256").update(license).digest("hex") !== manifest.licenseSha256) {
	throw new Error(`foldkit@${packageJson.version} MIT license differs from the recorded notice`)
}
const actualRuntimeExports = Object.keys(FoldkitScene).sort()
const expectedRuntimeExports = [...manifest.runtimeExports].sort()
if (actualRuntimeExports.join("\n") !== expectedRuntimeExports.join("\n")) {
	throw new Error("foldkit/test Scene runtime exports differ from the recorded Scene entry inventory")
}
for (const [name, expected] of Object.entries(manifest.compatibility)) {
	const shim = readFileSync(resolve(vendorRoot, "sceneCompat.ts"), "utf8")
	if (!shim.includes(expected)) throw new Error(`Scene compatibility shim no longer matches ${name}`)
}

function replaceOnce(source, from, to, label) {
	const first = source.indexOf(from)
	if (first < 0 || source.indexOf(from, first + from.length) !== -1) {
		throw new Error(`Scene vendor patch did not find one exact ${label} anchor`)
	}
	return source.slice(0, first) + to + source.slice(first + from.length)
}

const upstreamScene = checkedSource("scene.js")
let scene = upstreamScene
scene = replaceOnce(scene,
	"import { Array, Context, Effect, Equal, Function, Match, Option, Predicate, String, pipe, } from 'effect';",
	"import { Array, Effect, Equal, Function, Match, Option, Predicate, String, pipe, } from 'effect';",
	"Effect import")
scene = replaceOnce(scene,
	"import { kebabToPascal } from '../customElement/index.js';\nimport { serializedStylePropertyName } from '../domReflection.js';\nimport { FOLDKIT_MOUNT_KEY, FileHandlerSymbol, __clearRuntime as clearHtmlRuntime, __htmlBuilder as htmlBuilderFor, __setRuntime as setHtmlRuntime, } from '../html/index.js';\nimport { MountTracker } from '../mount/index.js';\nimport { Dispatch } from '../runtime/dispatch.js';\nimport { tagNameFromSelector } from '../tagName.js';",
	"import { kebabToPascal, serializedStylePropertyName, FOLDKIT_MOUNT_KEY, FileHandlerSymbol, tagNameFromSelector } from './sceneCompat.js';\nimport { createSceneRenderSession, disposeSceneRenderSession, isBoundSceneView, renderBoundSceneView, runSceneInteraction, getSceneEventHandler } from '../sceneBinding.js';",
	"private helper import")
const renderViewStart = scene.indexOf("const renderView = (viewFn, model, dispatch) => {")
const renderViewEnd = scene.indexOf("\nconst isDocument", renderViewStart)
if (renderViewStart < 0 || renderViewEnd < 0) throw new Error("Scene renderView patch anchor changed")
scene = scene.slice(0, renderViewStart) + `const renderView = (viewFn, model, dispatch, session) => {
    if (!isBoundSceneView(viewFn)) {
        throw new TypeError('The vendored Scene runner only accepts a view created by bindSceneView');
    }
    return renderBoundSceneView(viewFn, model, dispatch.dispatchSync, session);
};` + scene.slice(renderViewEnd)
scene = replaceOnce(scene,
	"dispatch: Dispatch.of({\n            dispatchAsync: () => Effect.void,\n            dispatchSync: (dispatchedMessage) => {\n                capturedMessages.push(dispatchedMessage);\n            },\n        }),",
	"dispatch: {\n            dispatchAsync: () => Effect.void,\n            dispatchSync: (dispatchedMessage) => {\n                capturedMessages.push(dispatchedMessage);\n            },\n        },",
	"capturing dispatch")
scene = replaceOnce(scene,
	"const runSteps = (seed, steps) =>",
	`const settleRender = (simulation) => {
    let internal = toInternal(simulation);
    if (internal.model === UNINITIALIZED) return internal;
    for (let pass = 0; pass < 100; pass++) {
        internal.capturingDispatch.reset();
        const html = renderView(internal.viewFn, internal.model, internal.capturingDispatch.dispatch, internal.sceneRenderSession);
        const mountSlots = reconcileMountSlots(internal.mountSlots, html);
        internal = { ...internal, html, mountSlots, mounts: pendingMountsOf(mountSlots) };
        const messages = internal.capturingDispatch.getCapturedMessages();
        internal.capturingDispatch.reset();
        if (messages.length === 0) return internal;
        internal = Array.reduce(messages, internal, applyMessageWithoutBoundaryChecks);
    }
    throw new Error('React Scene did not settle after 100 renders. Check Effects that dispatch on every render.');
};
const runSteps = (seed, steps) =>`,
	"React render settlement")
scene = replaceOnce(scene,
	"const stepResult = applySceneStep(capturingSimulation, step);",
	"const stepResult = settleRender(applySceneStep(capturingSimulation, step));",
	"capture Effect OutMessages before restoring update")
scene = replaceOnce(scene,
	`    const internal = toInternal(next);
    if (internal.model !== UNINITIALIZED) {
        const html = renderView(internal.viewFn, internal.model, internal.capturingDispatch.dispatch);
        const mountSlots = reconcileMountSlots(internal.mountSlots, html);
        const mounts = pendingMountsOf(mountSlots);
        return { ...internal, html, mountSlots, mounts };
    }
    return next;`,
	"    return next;",
	"render before OutMessage capture closes")
scene = replaceOnce(scene,
	"    const simulatedClick = createSimulatedClick();",
	`    const simulatedClick = createSimulatedClick();
    const clickTarget = element.elm;
    simulatedClick.event.target = clickTarget;
    Object.defineProperty(simulatedClick.event, 'defaultPrevented', { get: simulatedClick.isDefaultPrevented });
    const inputType = lookupStringAttribute(element, 'type');
    const isCheckable = element.sel === 'input' && (inputType === 'checkbox' || inputType === 'radio');
    const previousChecked = clickTarget?.checked;
    const name = lookupStringAttribute(element, 'name');
    const form = Option.getOrUndefined(formOwnerOf(internal.html, element));
    const group = inputType === 'radio' && name !== undefined && name !== ''
        ? allSelector('input[type="radio"]')(internal.html).filter(radio =>
            lookupStringAttribute(radio, 'name') === name &&
            Option.getOrUndefined(formOwnerOf(internal.html, radio)) === form)
        : isCheckable ? [element] : [];
    const previousGroup = group.map(radio => [radio.elm, radio.elm.checked]);
    if (isCheckable && inputType === 'radio') {
        for (const [radio] of previousGroup) radio.checked = radio === clickTarget;
    }
    if (isCheckable) clickTarget.checked = inputType === 'radio' || !previousChecked;`,
	"React click target and activation")
scene = replaceOnce(scene,
	"    let isClickHandled = false;",
	"    const changeHandler = isCheckable ? getSceneEventHandler(element, 'change') : undefined;\n    let isClickHandled = changeHandler !== undefined;",
	"React radio clicks with no value change")
scene = replaceOnce(scene,
	`    for (const currentElement of propagationPath) {
        const maybeClickHandler = Option.fromNullishOr(currentElement.data?.on?.['click']);
        if (Option.isNone(maybeClickHandler)) {
            continue;
        }
        isClickHandled = true;
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        const clickHandler = maybeClickHandler.value;
        clickHandler(simulatedClick.event);
        if (simulatedClick.isPropagationStopped()) {
            break;
        }
    }`,
	`    runSceneInteraction(() => {
        const clickHandler = getSceneEventHandler(element, 'click');
        if (clickHandler !== undefined) {
            isClickHandled = true;
            clickHandler(simulatedClick.event);
        }`,
	"React click capture and bubbling")
scene = replaceOnce(scene,
	"    if (!simulatedClick.isDefaultPrevented()) {",
	`    if (isCheckable && clickTarget.checked !== previousChecked && changeHandler !== undefined) {
        isClickHandled = true;
        changeHandler(simulatedClick.event);
    }
    if (simulatedClick.isDefaultPrevented()) {
        for (const [radio, checked] of previousGroup) radio.checked = checked;
    }
    if (!simulatedClick.isDefaultPrevented()) {`,
	"React checkbox change and canceled activation")
scene = replaceOnce(scene,
	"    if (!isClickHandled && !isSubmitHandled) {",
	"    });\n    if (!isClickHandled && !isSubmitHandled) {",
	"flush React click work before capturing Messages")
scene = replaceOnce(scene,
	"const maybeHandler = Option.fromNullishOr(element.data?.on?.[eventName]);",
	"const maybeHandler = Option.fromNullishOr(getSceneEventHandler(element, eventName));",
	"React event capture and bubbling")
scene = replaceOnce(scene,
	"const hasHandler = element.data?.on?.['dblclick'] !== undefined;",
	"const hasHandler = getSceneEventHandler(element, 'dblclick') !== undefined;",
	"React double click target")
for (const name of ["contextmenu", "pointerdown", "pointerup"]) {
	scene = replaceOnce(scene,
		`if (element.data?.on?.['${name}'] !== undefined) {`,
		`if (getSceneEventHandler(element, '${name}') !== undefined) {`,
		`React ${name} target`)
}
const hoverStart = scene.indexOf("export const hover = (target) => (simulation) => {")
const hoverEnd = scene.indexOf("\n/** Simulates a focus event", hoverStart)
if (hoverStart < 0 || hoverEnd < 0) throw new Error("Scene hover patch anchor changed")
scene = scene.slice(0, hoverStart) + `export const hover = (target) => (simulation) =>
    invokeAndCapture(simulation, target, 'hover', handler => handler());` + scene.slice(hoverEnd)
const pointerTargetStart = scene.indexOf("const simulatedPointerTarget = (root, target) => {")
const pointerTargetEnd = scene.indexOf("\n/** Simulates a pointerdown", pointerTargetStart)
if (pointerTargetStart < 0 || pointerTargetEnd < 0) throw new Error("Scene pointer target patch anchor changed")
scene = scene.slice(0, pointerTargetStart) + "const simulatedPointerTarget = (_root, target) => target.elm;" + scene.slice(pointerTargetEnd)
scene = replaceOnce(scene,
	"const maybeSubmitHandler = Option.fromNullishOr(maybeForm.value.data?.on?.['submit']);",
	"const maybeSubmitHandler = Option.fromNullishOr(getSceneEventHandler(maybeForm.value, 'submit'));",
	"React submit handlers")
scene = replaceOnce(scene,
	"export const scene = (config, ...steps) => {\n    const capturingDispatch = createCapturingDispatch();",
	"export const scene = (config, ...steps) => {\n    const capturingDispatch = createCapturingDispatch();\n    const sceneRenderSession = createSceneRenderSession();",
	"scene session creation")
scene = replaceOnce(scene,
	"        capturingDispatch,\n        scope:",
	"        capturingDispatch,\n        sceneRenderSession,\n        scope:",
	"scene session state")
scene = replaceOnce(scene,
	"    const result = runSteps(seed, steps);\n    /* eslint-enable @typescript-eslint/consistent-type-assertions */\n    const internal = toInternal(result);\n    assertAllCommandsResolved(internal.commands);\n    assertAllMountsResolved(internal.mounts);\n    assertAllUnmountsAcknowledged(unacknowledgedEndedMountsOf(internal.mountSlots));\n    assertNoUnacknowledgedIgnored(internal);",
	"    try {\n        const result = runSteps(seed, steps);\n        /* eslint-enable @typescript-eslint/consistent-type-assertions */\n        const internal = toInternal(result);\n        assertAllCommandsResolved(internal.commands);\n        assertAllMountsResolved(internal.mounts);\n        assertAllUnmountsAcknowledged(unacknowledgedEndedMountsOf(internal.mountSlots));\n        assertNoUnacknowledgedIgnored(internal);\n    } finally {\n        disposeSceneRenderSession(sceneRenderSession);\n    }",
	"scene cleanup")

const importPatches = {
	"internal.js": [
		["import { CommandDefinitionTypeId, } from '../command/index.js';", "import { CommandDefinitionTypeId } from 'foldkit/command';"],
		["import { MountDefinitionTypeId } from '../mount/index.js';", "import { MountDefinitionTypeId } from 'foldkit/mount';"],
	],
	"query.js": [
		["import { StringExt } from '../effectExtensions/index.js';", "import { StringExt } from './sceneCompat.js';"],
		["import { modifyFields } from '../struct/index.js';", "import { modifyFields } from 'foldkit/struct';"],
	],
	"matchers.js": [
		["import { serializedStylePropertyName } from '../domReflection.js';", "import { serializedStylePropertyName } from './sceneCompat.js';"],
	],
}

const expected = { "scene.js": scene }
for (const [name, patches] of Object.entries(importPatches)) {
	let source = checkedSource(name)
	for (const [from, to] of patches) source = replaceOnce(source, from, to, `${name} import`)
	expected[name] = source
}
for (const [name, source] of Object.entries(expected)) {
	const upstreamCopy = readFileSync(resolve(vendorRoot, name.replace(".js", ".upstream.js")), "utf8")
	if (upstreamCopy !== checkedSource(name)) throw new Error(`${name}.upstream.js is not a pristine Foldkit copy`)
	if (process.argv.includes("--write")) writeFileSync(resolve(vendorRoot, name), source)
	const checkedIn = readFileSync(resolve(vendorRoot, name), "utf8")
	if (checkedIn !== source) throw new Error(`${name} differs from the recorded Foldkit ${packageJson.version} source patches`)
}
process.stdout.write(`Scene vendor matches foldkit@${packageJson.version}; upstream hashes and import/render/cleanup patches verified.\n`)
