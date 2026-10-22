import { Option, pipe } from 'effect';
import { isVisible } from './visibility.js';
let registeredDevToolsOverlay;
/** Registers the overlay supplied by the Foldkit Vite plugin. */
export const __setDevToolsOverlay = (overlay) => {
    registeredDevToolsOverlay = overlay;
};
const DEFAULT_DEV_TOOLS_SHOW = 'Development';
const DEFAULT_DEV_TOOLS_POSITION = 'BottomRight';
const DEFAULT_DEV_TOOLS_MODE = 'TimeTravel';
const resolveDevToolsMode = (config) => {
    if (typeof config === 'string') {
        return config;
    }
    else {
        return import.meta.hot ? config.development : config.production;
    }
};
const DEV_TOOLS_MAX_ENTRIES_MIN = 20;
const DEV_TOOLS_MAX_ENTRIES_MAX = 500;
const DEV_TOOLS_KEYFRAME_INTERVAL_MIN = 1;
/** Resolves the DevTools config for this boot, or `Option.none()` when
 *  DevTools is disabled or hidden. `'Development'` visibility requires Vite's
 *  dev server and a top-level window, so an app previewed inside an iframe does
 *  not stack a second panel over its host's. */
export const resolveDevToolsConfig = (devTools) => {
    const isInIframe = window.self !== window.top;
    return pipe(devTools ?? {}, Option.liftPredicate(config => config !== false), Option.filter(config => isVisible(config.show ?? DEFAULT_DEV_TOOLS_SHOW, !!import.meta.hot && !isInIframe)), Option.map(config => ({
        position: config.position ?? DEFAULT_DEV_TOOLS_POSITION,
        mode: resolveDevToolsMode(config.mode ?? DEFAULT_DEV_TOOLS_MODE),
        maybeBanner: Option.fromNullishOr(config.banner),
        maybeOverlay: Option.fromNullishOr(registeredDevToolsOverlay),
    })));
};
/** The Message tags `excludeFromHistory` keeps out of the DevTools history. */
export const resolveExcludeFromHistoryTags = (devTools) => pipe(devTools ?? {}, Option.liftPredicate(config => config !== false), Option.flatMapNullishOr(config => config.excludeFromHistory), Option.match({
    onNone: () => new Set(),
    onSome: tags => new Set(tags),
}));
/** The configured `maxEntries`, clamped to the supported range. */
export const resolveDevToolsMaxEntries = (devTools) => pipe(devTools ?? {}, Option.liftPredicate(config => config !== false), Option.flatMapNullishOr(config => config.maxEntries), Option.match({
    onNone: () => undefined,
    onSome: value => Math.max(DEV_TOOLS_MAX_ENTRIES_MIN, Math.min(DEV_TOOLS_MAX_ENTRIES_MAX, value)),
}));
/** The configured `keyframeInterval`, floored and clamped to its minimum. */
export const resolveDevToolsKeyframeInterval = (devTools) => pipe(devTools ?? {}, Option.liftPredicate(config => config !== false), Option.flatMapNullishOr(config => config.keyframeInterval), Option.match({
    onNone: () => undefined,
    onSome: value => Math.max(DEV_TOOLS_KEYFRAME_INTERVAL_MIN, Math.floor(value)),
}));
