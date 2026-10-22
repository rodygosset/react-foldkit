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
	"import { kebabToPascal, serializedStylePropertyName, FOLDKIT_MOUNT_KEY, FileHandlerSymbol, tagNameFromSelector } from './sceneCompat.js';\nimport { createSceneRenderSession, disposeSceneRenderSession, isBoundSceneView, renderBoundSceneView, getSceneEventHandler } from '../sceneBinding.js';\nimport { runClick } from '../sceneClick.js';\nimport { settleSimulation } from '../sceneSettle.js';",
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
    const internal = toInternal(simulation);
    if (internal.model === UNINITIALIZED) return internal;
    return settleSimulation(internal, (current) => {
        current.capturingDispatch.reset();
        const html = renderView(current.viewFn, current.model, current.capturingDispatch.dispatch, current.sceneRenderSession);
        const mountSlots = reconcileMountSlots(current.mountSlots, html);
        const rendered = { ...current, html, mountSlots, mounts: pendingMountsOf(mountSlots) };
        const messages = current.capturingDispatch.getCapturedMessages();
        current.capturingDispatch.reset();
        return [rendered, messages];
    }, applyMessageWithoutBoundaryChecks);
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
	`    const simulatedClick = createSimulatedClick();
    let isClickHandled = false;
    let isSubmitHandled = false;
    internal.capturingDispatch.reset();
    for (const currentElement of propagationPath) {
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
    }
    if (!simulatedClick.isDefaultPrevented()) {
        const maybeSubmitter = Array.findFirst(propagationPath, isSubmitButton);
        const maybeForm = pipe(maybeSubmitter, Option.flatMap(submitter => formOwnerOf(internal.html, submitter)));
        if (Option.isSome(maybeForm)) {
            const maybeSubmitHandler = Option.fromNullishOr(maybeForm.value.data?.on?.['submit']);
            if (Option.isSome(maybeSubmitHandler)) {
                isSubmitHandled = true;
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                const submitHandler = maybeSubmitHandler.value;
                submitHandler({ preventDefault: Function.constVoid });
            }
        }
    }
    if (!isClickHandled && !isSubmitHandled) {`,
	`    internal.capturingDispatch.reset();
    const clickListeners = runClick(internal.html, element, propagationPath);
    if (clickListeners._tag === 'Missing') {`,
	"React click activation")
scene = replaceOnce(scene,
	"const maybeHandler = Option.fromNullishOr(element.data?.on?.[eventName]);",
	"const maybeHandler = Option.fromNullishOr(getSceneEventHandler(element, eventName));",
	"React event capture and bubbling")
scene = replaceOnce(scene,
	`    const hasHandler = element.data?.on?.['dblclick'] !== undefined;
    if (hasHandler) {
        return captureFromElement(simulation, element, description, 'dblclick', handler => {
            handler();
        });
    }
    const maybeAncestor = findAncestorWithHandler(internal.html, element, 'dblclick');
    if (Option.isSome(maybeAncestor)) {
        return captureFromElement(simulation, maybeAncestor.value, \`ancestor of \${description}\`, 'dblclick', handler => {
            handler();
        });
    }`,
	`    if (getSceneEventHandler(element, 'dblclick') !== undefined) {
        return captureFromElement(simulation, element, description, 'dblclick', handler => {
            handler();
        });
    }`,
	"React double click target")
scene = replaceOnce(scene,
	`    if (element.data?.on?.['contextmenu'] !== undefined) {
        return captureFromElement(simulation, element, description, 'contextmenu', invokeHandler);
    }
    const maybeAncestor = findAncestorWithHandler(internal.html, element, 'contextmenu');
    if (Option.isSome(maybeAncestor)) {
        return captureFromElement(simulation, maybeAncestor.value, \`ancestor of \${description}\`, 'contextmenu', invokeHandler);
    }`,
	`    if (getSceneEventHandler(element, 'contextmenu') !== undefined) {
        return captureFromElement(simulation, element, description, 'contextmenu', invokeHandler);
    }`,
	"React context menu target")
scene = replaceOnce(scene,
	`    if (element.data?.on?.['pointerdown'] !== undefined) {
        return captureFromElement(simulation, element, description, 'pointerdown', invokeHandler);
    }
    const maybeAncestor = findAncestorWithHandler(internal.html, element, 'pointerdown');
    if (Option.isSome(maybeAncestor)) {
        return captureFromElement(simulation, maybeAncestor.value, \`ancestor of \${description}\`, 'pointerdown', invokeHandler);
    }`,
	`    if (getSceneEventHandler(element, 'pointerdown') !== undefined) {
        return captureFromElement(simulation, element, description, 'pointerdown', invokeHandler);
    }`,
	"React pointer down target")
scene = replaceOnce(scene,
	`    if (element.data?.on?.['pointerup'] !== undefined) {
        return captureFromElement(simulation, element, description, 'pointerup', invokeHandler);
    }
    const maybeAncestor = findAncestorWithHandler(internal.html, element, 'pointerup');
    if (Option.isSome(maybeAncestor)) {
        return captureFromElement(simulation, maybeAncestor.value, \`ancestor of \${description}\`, 'pointerup', invokeHandler);
    }`,
	`    if (getSceneEventHandler(element, 'pointerup') !== undefined) {
        return captureFromElement(simulation, element, description, 'pointerup', invokeHandler);
    }`,
	"React pointer up target")
scene = replaceOnce(scene,
	`    const node = {};
    handler({
        key,
        ...DEFAULT_KEYBOARD_MODIFIERS,
        ...modifiers,
        target: node,
        currentTarget: node,
        preventDefault: Function.constVoid,
    });`,
	`    handler({
        key,
        ...DEFAULT_KEYBOARD_MODIFIERS,
        ...modifiers,
        preventDefault: Function.constVoid,
    });`,
	"React keydown host target")
scene = replaceOnce(scene,
	`const lookupStringAttribute = (vnode, name) => {
    const fromAttrs = vnode.data?.attrs?.[name];
    const fromProps = vnode.data?.props?.[name];
    if (Predicate.isString(fromAttrs)) {
        return fromAttrs;
    }
    if (Predicate.isString(fromProps)) {
        return fromProps;
    }
    return undefined;
};
const isSubmitButton = (element) => {
    const maybeType = pipe(lookupStringAttribute(element, 'type'), Option.fromNullishOr, Option.map(String.toLowerCase));
    if (element.sel === 'button') {
        return Option.match(maybeType, {
            onNone: () => true,
            onSome: value => value !== 'button' && value !== 'reset',
        });
    }
    if (element.sel === 'input') {
        return Option.exists(maybeType, value => value === 'submit' || value === 'image');
    }
    return false;
};
const findElementById = (root, id) => {
    if (lookupStringAttribute(root, 'id') === id) {
        return Option.some(root);
    }
    for (const child of root.children ?? []) {
        if (Predicate.isString(child)) {
            continue;
        }
        const maybeMatch = findElementById(child, id);
        if (Option.isSome(maybeMatch)) {
            return maybeMatch;
        }
    }
    return Option.none();
};
const formOwnerOf = (root, submitter) => {
    const formId = lookupStringAttribute(submitter, 'form');
    if (formId !== undefined) {
        return pipe(findElementById(root, formId), Option.filter(element => element.sel === 'form'));
    }
    return pipe(root, ancestorsOf(submitter), Array.findLast(element => element.sel === 'form'));
};
`,
	"",
	"React click owns form lookup")
scene = replaceOnce(scene,
	`const findAncestorWithHandler = (root, element, eventName) => pipe(root, ancestorsOf(element), Array.reverse, Array.findFirst(vnode => vnode.data?.on?.[eventName] !== undefined));
const createSimulatedClick = () => {
    let isDefaultPrevented = false;
    let isPropagationStopped = false;
    return {
        event: {
            preventDefault: () => {
                isDefaultPrevented = true;
            },
            stopPropagation: () => {
                isPropagationStopped = true;
            },
        },
        isDefaultPrevented: () => isDefaultPrevented,
        isPropagationStopped: () => isPropagationStopped,
    };
};
`,
	"",
	"React click owns the event")
scene = replaceOnce(scene,
	`export const change = dual(2, (target, value) => (simulation) => invokeAndCapture(simulation, target, 'change', handler => {
    handler({ target: { value } });
}));`,
	`export const change = dual(2, (target, value) => (simulation) => invokeAndCapture(simulation, target, 'change', handler => {
    handler({ hostUpdate: { _tag: 'Value', value } });
}));`,
	"React change host update")
scene = replaceOnce(scene,
	`const type_ = dual(2, (target, value) => (simulation) => invokeAndCapture(simulation, target, 'input', handler => {
    handler({ target: { value } });
}));`,
	`const type_ = dual(2, (target, value) => (simulation) => invokeAndCapture(simulation, target, 'input', handler => {
    handler({ hostUpdate: { _tag: 'Value', value } });
}));`,
	"React input host update")
scene = replaceOnce(scene,
	"handler({ target: { files, value: '' } });",
	"handler({ hostUpdate: { _tag: 'Files', files } });",
	"React file host update")
scene = replaceOnce(scene,
	"handler({ target: { innerText: text } });",
	"handler({ hostUpdate: { _tag: 'Text', text } });",
	"React text host update")
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
