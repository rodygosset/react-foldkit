import { Array, Effect, HashMap, HashSet, Match, Option, Predicate, Record, String, SubscriptionRef, pipe, } from 'effect';
import { modifyFields } from 'foldkit/struct';
export const INIT_INDEX = -1;
const DEFAULT_KEYFRAME_INTERVAL = 31;
const DEFAULT_MAX_ENTRIES = 100;
export const emptyDiff = {
    changedPaths: HashSet.empty(),
    affectedPaths: HashSet.empty(),
};
const isExpandable = Predicate.isObjectOrArray;
export const computeDiff = (previous, current) => {
    const changed = new Set();
    const walk = (prev, curr, path) => {
        if (prev === curr) {
            return;
        }
        if (!isExpandable(curr) || !isExpandable(prev)) {
            changed.add(path);
            return;
        }
        if (Array.isArray(curr) && Array.isArray(prev)) {
            walkArray(prev, curr, path);
        }
        else if (Predicate.isObject(curr) && Predicate.isObject(prev)) {
            walkObject(prev, curr, path);
        }
        else {
            changed.add(path);
        }
    };
    const walkObject = (prev, curr, path) => {
        pipe(curr, Record.keys, Array.forEach(key => {
            const childPath = `${path}.${key}`;
            if (Record.has(prev, key)) {
                walk(prev[key], curr[key], childPath);
            }
            else {
                changed.add(childPath);
            }
        }));
        pipe(prev, Record.keys, Array.forEach(key => {
            if (!Record.has(curr, key)) {
                changed.add(`${path}.${key}`);
            }
        }));
    };
    const walkArray = (prev, curr, path) => {
        curr.forEach((item, index) => {
            const childPath = `${path}.${index}`;
            if (index < prev.length) {
                walk(prev[index], item, childPath);
            }
            else {
                changed.add(childPath);
            }
        });
        if (prev.length > curr.length) {
            pipe(Array.range(curr.length, prev.length - 1), Array.forEach(index => changed.add(`${path}.${index}`)));
        }
    };
    walk(previous, current, 'root');
    const affected = new Set(changed);
    const addAncestors = (path) => {
        pipe(path, String.lastIndexOf('.'), Option.map(lastDot => path.substring(0, lastDot)), Option.filter(parent => !affected.has(parent)), Option.map(parent => {
            affected.add(parent);
            addAncestors(parent);
        }));
    };
    changed.forEach(addAncestors);
    return {
        changedPaths: HashSet.fromIterable(changed),
        affectedPaths: HashSet.fromIterable(affected),
    };
};
const emptyState = {
    entries: [],
    keyframes: HashMap.empty(),
    maybeInitModel: Option.none(),
    initCommands: [],
    initMountStarts: [],
    startIndex: 0,
    isPaused: false,
    pausedAtIndex: 0,
    maybeLatestModel: Option.none(),
};
/**
 * The absolute index of the most recently recorded entry, or `INIT_INDEX`
 * when no Messages have been recorded yet.
 */
export const latestEntryIndex = (state) => Array.match(state.entries, {
    onEmpty: () => INIT_INDEX,
    onNonEmpty: entries => state.startIndex + entries.length - 1,
});
/**
 * The absolute index the next recorded entry will land at. `recordMessage`
 * assigns indices from this formula, so dispatch predictions derived from it
 * match where entries are actually recorded.
 */
export const nextEntryIndex = (state) => state.startIndex + state.entries.length;
export const createDevToolsStore = (bridge, options = {}) => Effect.gen(function* () {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const keyframeInterval = options.keyframeInterval ?? DEFAULT_KEYFRAME_INTERVAL;
    const stateRef = yield* SubscriptionRef.make(emptyState);
    const replayToIndex = (state, index) => {
        // NOTE: the keyframe stored at `index + 1` represents the model
        // state immediately after entry `index` was processed, per the
        // convention `recordMessage` uses. Looking it up first short-circuits
        // replay entirely; this hits on every index when keyframeInterval is
        // 1 and at segment boundaries otherwise. Don't "simplify" to
        // `keyframes[index]` — that's the model BEFORE entry `index`, which
        // would require replaying the entry to land at the right state.
        const directSnapshot = HashMap.get(state.keyframes, index + 1);
        if (Option.isSome(directSnapshot)) {
            return directSnapshot.value;
        }
        const segmentStart = Math.floor(index / keyframeInterval) * keyframeInterval;
        const keyframeIndex = HashMap.has(state.keyframes, segmentStart)
            ? segmentStart
            : state.startIndex;
        return pipe(state.keyframes, HashMap.get(keyframeIndex), Option.map(keyframeModel => pipe(state.entries, Array.drop(keyframeIndex - state.startIndex), Array.take(index - keyframeIndex + 1), Array.reduce(keyframeModel, (model, entry) => bridge.replay(model, entry.message)))), Option.getOrThrow);
    };
    const addKeyframeIfNeeded = (nextAbsoluteIndex, modelAfterUpdate) => (keyframes) => nextAbsoluteIndex % keyframeInterval === 0
        ? HashMap.set(keyframes, nextAbsoluteIndex, modelAfterUpdate)
        : keyframes;
    const evictOldestSegment = (state) => {
        const nextStartIndex = state.startIndex + keyframeInterval;
        const isPausedAtRetainedIndex = state.pausedAtIndex >= nextStartIndex ||
            state.pausedAtIndex === INIT_INDEX;
        return modifyFields(state, {
            entries: Array.drop(keyframeInterval),
            keyframes: HashMap.remove(state.startIndex),
            startIndex: () => nextStartIndex,
            isPaused: isPaused => isPaused && isPausedAtRetainedIndex,
        });
    };
    const recordInit = (model, commands, mountStarts = []) => SubscriptionRef.update(stateRef, state => modifyFields(state, {
        maybeInitModel: () => Option.some(model),
        initCommands: () => commands,
        initMountStarts: () => mountStarts,
        keyframes: HashMap.set(0, model),
        maybeLatestModel: () => Option.some(model),
    }));
    const recordMessage = (message, modelBeforeUpdate, modelAfterUpdate, commands, isModelChanged) => Effect.gen(function* () {
        const didAutoResume = yield* SubscriptionRef.modify(stateRef, state => {
            const absoluteIndex = nextEntryIndex(state);
            const diff = isModelChanged
                ? computeDiff(modelBeforeUpdate, modelAfterUpdate)
                : emptyDiff;
            const hasChangedFields = HashSet.size(diff.changedPaths) > 0;
            const nextState = modifyFields(state, {
                entries: Array.append({
                    tag: message._tag,
                    message,
                    commands,
                    mountStarts: [],
                    mountEnds: [],
                    timestamp: performance.now(),
                    isModelChanged: hasChangedFields,
                    diff,
                }),
                keyframes: addKeyframeIfNeeded(absoluteIndex + 1, modelAfterUpdate),
                maybeLatestModel: () => Option.some(modelAfterUpdate),
            });
            const recordedState = nextState.entries.length > maxEntries
                ? evictOldestSegment(nextState)
                : nextState;
            return [state.isPaused && !recordedState.isPaused, recordedState];
        });
        if (didAutoResume) {
            yield* bridge.markRenderPending;
        }
    });
    const recordResolvedCommand = (id, submodelPath) => SubscriptionRef.update(stateRef, state => {
        const updateCommands = (commands) => pipe(commands, Array.findFirstIndex(command => command.id === id), Option.flatMap(index => Array.modify(commands, index, command => modifyFields(command, {
            maybeSubmodelPath: () => Option.some(submodelPath),
        }))));
        const maybeInitCommands = updateCommands(state.initCommands);
        if (Option.isSome(maybeInitCommands)) {
            return modifyFields(state, {
                initCommands: () => maybeInitCommands.value,
            });
        }
        const maybeEntryIndex = Array.findFirstIndex(state.entries, entry => Array.some(entry.commands, command => command.id === id));
        if (Option.isNone(maybeEntryIndex)) {
            return state;
        }
        const maybeEntries = Array.modify(state.entries, maybeEntryIndex.value, entry => Option.match(updateCommands(entry.commands), {
            onNone: () => entry,
            onSome: nextCommands => modifyFields(entry, { commands: () => nextCommands }),
        }));
        return Option.match(maybeEntries, {
            onNone: () => state,
            onSome: nextEntries => modifyFields(state, { entries: () => nextEntries }),
        });
    });
    /** Attaches Mount lifecycle events from the most recent render to the
     *  history entry that triggered the render. Mount events fire during
     *  snabbdom's `patch`, but render frames are scheduled through
     *  `requestAnimationFrame`, so a render may fire after the
     *  Message that dirtied it has already been recorded. The runtime drains
     *  its mount buffer after each render and calls this to associate the
     *  events with the correct entry. When called before any Message has been
     *  recorded (only possible from the init render path), the starts attach
     *  to `initMountStarts`; init has no `ends` because nothing existed
     *  to unmount. */
    const attachRenderedMounts = (mountStarts, mountEnds) => SubscriptionRef.update(stateRef, state => {
        if (Array.isReadonlyArrayEmpty(mountStarts) &&
            Array.isReadonlyArrayEmpty(mountEnds)) {
            return state;
        }
        return Array.match(state.entries, {
            onEmpty: () => modifyFields(state, {
                initMountStarts: Array.appendAll(mountStarts),
            }),
            onNonEmpty: entries => modifyFields(state, {
                entries: () => Array.modifyLastNonEmpty(entries, last => modifyFields(last, {
                    mountStarts: Array.appendAll(mountStarts),
                    mountEnds: Array.appendAll(mountEnds),
                })),
            }),
        });
    });
    // NOTE: maybeLatestModel must be stamped atomically with the entries
    // append in recordMessage. The follow-latest fast-path below depends on
    // that invariant.
    const resolveModel = (state, index) => Match.value(index).pipe(Match.when(INIT_INDEX, () => Option.getOrThrow(state.maybeInitModel)), Match.when(latestEntryIndex(state), () => Option.getOrThrow(state.maybeLatestModel)), Match.orElse(() => replayToIndex(state, index)));
    const getModelAtIndex = (index) => pipe(stateRef, SubscriptionRef.get, Effect.map(state => resolveModel(state, index)));
    const getMessageAtIndex = (index) => Effect.gen(function* () {
        if (index === INIT_INDEX) {
            return Option.none();
        }
        const state = yield* SubscriptionRef.get(stateRef);
        return pipe(state.entries, Array.get(index - state.startIndex), Option.map(({ message }) => message));
    });
    const jumpTo = (index) => Effect.gen(function* () {
        const state = yield* SubscriptionRef.get(stateRef);
        const model = resolveModel(state, index);
        yield* bridge.render(model);
        const wasTargetEvicted = yield* SubscriptionRef.modify(stateRef, currentState => {
            const isTargetRetained = index === INIT_INDEX ||
                (index >= currentState.startIndex &&
                    index <= latestEntryIndex(currentState));
            return isTargetRetained
                ? [
                    false,
                    modifyFields(currentState, {
                        isPaused: () => true,
                        pausedAtIndex: () => index,
                    }),
                ]
                : [
                    true,
                    modifyFields(currentState, {
                        isPaused: () => false,
                    }),
                ];
        });
        if (wasTargetEvicted) {
            yield* bridge.markRenderPending;
        }
        return model;
    });
    const resume = Effect.gen(function* () {
        yield* SubscriptionRef.update(stateRef, state => modifyFields(state, {
            isPaused: () => false,
        }));
        yield* bridge.markRenderPending;
    });
    // NOTE: the paused snapshot is replayed off the entries array, so wiping
    // entries while paused strands the runtime on a historical state with no
    // path back to live. Refuse the write until resume.
    const clear = SubscriptionRef.update(stateRef, state => {
        if (state.isPaused) {
            return state;
        }
        else {
            return modifyFields(state, {
                entries: () => [],
                startIndex: () => 0,
                pausedAtIndex: () => 0,
                keyframes: () => Option.match(state.maybeInitModel, {
                    onNone: () => HashMap.empty(),
                    onSome: model => HashMap.make([0, model]),
                }),
                maybeLatestModel: () => state.maybeInitModel,
            });
        }
    });
    const getDiffAtIndex = (index) => Effect.gen(function* () {
        if (index === INIT_INDEX) {
            return emptyDiff;
        }
        const state = yield* SubscriptionRef.get(stateRef);
        return pipe(state.entries, Array.get(index - state.startIndex), Option.match({
            onNone: () => emptyDiff,
            onSome: ({ diff }) => diff,
        }));
    });
    const updateLatestModel = (model) => SubscriptionRef.update(stateRef, modifyFields({ maybeLatestModel: () => Option.some(model) }));
    return {
        recordInit,
        recordMessage,
        recordResolvedCommand,
        updateLatestModel,
        attachRenderedMounts,
        getModelAtIndex,
        getMessageAtIndex,
        getDiffAtIndex,
        jumpTo,
        resume,
        clear,
        stateRef,
    };
});
