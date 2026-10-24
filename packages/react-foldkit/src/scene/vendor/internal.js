import { Array, Equal, Option, Order, Predicate, pipe } from 'effect';
import { CommandDefinitionTypeId } from 'foldkit/command';
import { MountDefinitionTypeId } from 'foldkit/mount';
const isCommandDefinitionMatcher = (matcher) => Predicate.hasProperty(matcher, CommandDefinitionTypeId);
/** Whether a `matcher` matches a pending Command. Definition matchers match
 *  by name. Instance matchers (with declared args) match by name + structural
 *  args equality; instance matchers without args match by name. */
const commandMatches = (matcher, command) => matcher.name === command.name &&
    (isCommandDefinitionMatcher(matcher) ||
        matcher.args === undefined ||
        Equal.equals(matcher.args, command.args));
const formatArgs = (args) => args === undefined ? '' : ` ${JSON.stringify(args)}`;
/** Formats a Command matcher for display in error messages. Definition
 *  matchers render as just the name; Instance matchers append the args. */
export const formatMatcher = (matcher) => isCommandDefinitionMatcher(matcher)
    ? matcher.name
    : `${matcher.name}${formatArgs(matcher.args)}`;
/** Formats a pending Command for display in error messages. Same shape as
 *  `formatMatcher` so failure messages diff visually at a glance. */
export const formatCommand = (command) => `${command.name}${formatArgs(command.args)}`;
const isMountDefinitionMatcher = (matcher) => Predicate.hasProperty(matcher, MountDefinitionTypeId);
/** Whether a `matcher` matches a pending Mount. Definition matchers match by
 *  name. Instance matchers (with declared args) match by name + structural
 *  args equality; instance matchers without args match by name. */
export const mountMatches = (matcher, mount) => matcher.name === mount.name &&
    (isMountDefinitionMatcher(matcher) ||
        matcher.args === undefined ||
        Equal.equals(matcher.args, mount.args));
/** Formats a Mount matcher for display in error messages. Definition
 *  matchers render as just the name; Instance matchers append the args. */
export const formatMountMatcher = (matcher) => isMountDefinitionMatcher(matcher)
    ? matcher.name
    : `${matcher.name}${formatArgs(matcher.args)}`;
/** Drops every pending Command holding `interruptsKey` when a resolved
 *  Command declares one (an Interrupt Command). Resolving the Interrupt
 *  before the target declares that the interrupt won the race, so the
 *  target's result Message never arrives; resolving the target first models
 *  completion before the interrupt ran. */
const dropInterruptedCommands = (pending, resolvedCommand) => Predicate.isUndefined(resolvedCommand.interruptsKey)
    ? pending
    : Array.filter(pending, pendingCommand => pendingCommand.key !== resolvedCommand.interruptsKey);
/** Folds a recorded message-mapping chain over `resultMessage`, reproducing the
 *  wrapping a resolved Command or mounted child's result travels through in
 *  production: the parent's `Command.mapMessages` for a Command, or the
 *  Submodel-boundary lift for a mount. A root or scene test can then resolve
 *  with the child's raw result. An absent chain is the identity. */
const foldMessageMappers = (messageMappers, resultMessage) => Array.reduce(messageMappers ?? [], resultMessage, (current, mapper) => mapper(current));
/** Resolves the first pending Command that matches the given matcher and feeds
 *  its result through update, applying the matched Command's own message-mapping
 *  chain to `resultMessage` first. Returns `undefined` when no pending Command
 *  matches. Definition matchers match by name; Instance matchers match by
 *  name + args. */
export const resolveByMatcher = (internal, matcher, resultMessage) => pipe(internal.commands, Array.findFirstIndex(command => commandMatches(matcher, command)), Option.flatMap(commandIndex => pipe(internal.commands, Array.get(commandIndex), Option.map(matchedCommand => {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const resolverMessage = foldMessageMappers(matchedCommand.messageMappers, resultMessage);
    const remainingCommands = dropInterruptedCommands(Array.remove(internal.commands, commandIndex), matchedCommand);
    const messageUpdate = internal.updateFn(internal.model, resolverMessage);
    return {
        ...internal,
        model: messageUpdate.model,
        message: resolverMessage,
        commands: Array.appendAll(remainingCommands, messageUpdate.commands ?? []),
        outMessage: messageUpdate.outMessage,
    };
}))), Option.getOrUndefined);
const MAX_CASCADE_DEPTH = 100;
/** A fingerprint identifying a matcher's match space. Two matchers with the
 *  same fingerprint resolve the same set of Commands; the newer one wins. */
const matcherFingerprint = (matcher) => isCommandDefinitionMatcher(matcher)
    ? `def:${matcher.name}`
    : `inst:${matcher.name}:${JSON.stringify(matcher.args ?? null)}`;
const findNextMatch = (commands, resolvers) => {
    const toMatchedResolver = (command) => pipe(resolvers, Array.findFirstWithIndex(({ matcher }) => commandMatches(matcher, command)), Option.map(([entry, resolverIndex]) => ({ entry, resolverIndex })));
    return Array.findFirst(commands, toMatchedResolver);
};
/** Resolves all listed Commands, cascading through any Commands produced by
 *  the result. Each entry is consumed by exactly one matching dispatch in
 *  declaration order; for N identical responses, compose with
 *  `Array.makeBy(n, () => [Def, message])`. Across calls, new entries replace
 *  any leftover resolvers sharing their fingerprint (latest wins). */
export const resolveAllInternal = (internal, resolvers) => {
    const newEntries = Array.map(resolvers, ([matcher, resultMessage]) => ({ matcher, resultMessage }));
    const newFingerprints = new Set(Array.map(newEntries, ({ matcher }) => matcherFingerprint(matcher)));
    const survivingExisting = Array.filter(internal.resolvers, ({ matcher }) => !newFingerprints.has(matcherFingerprint(matcher)));
    /* eslint-disable @typescript-eslint/consistent-type-assertions */
    let current = {
        ...internal,
        resolvers: [...survivingExisting, ...newEntries],
    };
    for (let depth = 0; depth < MAX_CASCADE_DEPTH; depth++) {
        const matched = findNextMatch(current.commands, current.resolvers);
        if (Option.isNone(matched)) {
            break;
        }
        const next = resolveByMatcher(current, matched.value.entry.matcher, matched.value.entry.resultMessage);
        if (Predicate.isUndefined(next)) {
            break;
        }
        current = {
            ...next,
            resolvers: Array.remove(next.resolvers, matched.value.resolverIndex),
        };
        if (depth === MAX_CASCADE_DEPTH - 1) {
            throw new Error('resolveAll hit the maximum cascade depth (100). ' +
                'This usually means Commands are producing Commands in an infinite cycle.');
        }
    }
    return current;
    /* eslint-enable @typescript-eslint/consistent-type-assertions */
};
/** Resolves only the listed Command resolvers, cascading through result
 *  Messages, and throws unless every resolver matches one dispatched Command.
 *  Unlike `resolveAllInternal`, unmatched entries never carry forward. */
export const resolveAllExactInternal = (internal, resolvers) => {
    let remainingResolvers = Array.map(resolvers, ([matcher, resultMessage]) => ({ matcher, resultMessage }));
    let current = internal;
    for (let depth = 0; depth < MAX_CASCADE_DEPTH; depth++) {
        const matched = findNextMatch(current.commands, remainingResolvers);
        if (Option.isNone(matched)) {
            break;
        }
        const next = resolveByMatcher(current, matched.value.entry.matcher, matched.value.entry.resultMessage);
        if (Predicate.isUndefined(next)) {
            break;
        }
        current = next;
        remainingResolvers = Array.remove(remainingResolvers, matched.value.resolverIndex);
        if (depth === MAX_CASCADE_DEPTH - 1) {
            throw new Error('resolveAllExact hit the maximum cascade depth (100). ' +
                'This usually means Commands are producing Commands in an infinite cycle.');
        }
    }
    if (Array.isReadonlyArrayNonEmpty(remainingResolvers)) {
        throw new Error(`resolveAllExact expected Commands that were not dispatched:\n\n${formatMatcherList(Array.map(remainingResolvers, ({ matcher }) => matcher))}\n\nPending Commands after resolving matches:\n\n${formatCommandList(current.commands)}`);
    }
    assertAllCommandsResolved(current.commands);
    return current;
};
const formatCommandList = (commands) => Array.match(commands, {
    onEmpty: () => '    (none)',
    onNonEmpty: nonEmpty => pipe(nonEmpty, Array.map(command => `    ${formatCommand(command)}`), Array.join('\n')),
});
const formatMatcherList = (matchers) => pipe(matchers, Array.map(matcher => `    ${formatMatcher(matcher)}`), Array.join('\n'));
/** Throws if more than one pending Command matches the given matcher. Used
 *  by single-resolve paths (`Story.Command.resolve`, `Scene.Command.resolve`)
 *  where ambiguity is a bug. The test author can't have intended one specific
 *  Command if multiple match. `resolveAll` consumes ordered pairings and
 *  skips this check. */
export const assertResolveUnambiguous = (commands, matcher) => {
    const matches = Array.filter(commands, command => commandMatches(matcher, command));
    if (matches.length > 1) {
        throw new Error(`I tried to resolve "${formatMatcher(matcher)}" but multiple pending Commands match.\n\n` +
            `Matches:\n${formatCommandList(matches)}\n\n` +
            'To disambiguate, pass a Command instance with specific args, ' +
            'or use resolveAll for ordered consumption.');
    }
};
/** Throws if any of the given matchers fail to match a pending Command.
 *  Definition matchers match by name; Instance matchers match by name + args. */
export const assertHasCommands = (commands, matchers) => {
    const missing = Array.filter(matchers, matcher => !commands.some(command => commandMatches(matcher, command)));
    if (Array.isReadonlyArrayNonEmpty(missing)) {
        throw new Error(`Expected to find Commands:\n\n${formatMatcherList(missing)}\n\nBut the pending Commands are:\n\n${formatCommandList(commands)}`);
    }
};
/** Throws if the pending Commands don't match the given matchers exactly
 *  (order-independent). Definition matchers compare by name; Instance
 *  matchers compare by name + args. Each matcher must consume exactly one
 *  pending Command. */
export const assertExactCommands = (commands, matchers) => {
    const consumed = new Set();
    const unmatched = Array.filter(matchers, matcher => pipe(commands, Array.findFirstIndex((command, index) => !consumed.has(index) && commandMatches(matcher, command)), Option.match({
        onNone: () => true,
        onSome: index => {
            consumed.add(index);
            return false;
        },
    })));
    const remaining = Array.filter(commands, (_, index) => !consumed.has(index));
    if (Array.isReadonlyArrayNonEmpty(unmatched) ||
        Array.isReadonlyArrayNonEmpty(remaining)) {
        const expected = formatMatcherList(pipe(matchers, Array.map(matcher => formatMatcher(matcher)), Array.sort(Order.String), Array.map((line) => ({ name: line }))));
        const actual = formatCommandList(pipe(commands, Array.map(command => formatCommand(command)), Array.sort(Order.String), Array.map((line) => ({ name: line }))));
        throw new Error(`Expected exactly these Commands:\n\n${expected}\n\nBut found:\n\n${actual}`);
    }
};
/** Throws if there are any pending Commands. */
export const assertZeroCommands = (commands) => {
    if (Array.isReadonlyArrayNonEmpty(commands)) {
        throw new Error(`Expected no Commands but found:\n\n${formatCommandList(commands)}`);
    }
};
const formatChildCommandHint = (commands) => Array.some(commands, command => Array.isReadonlyArrayNonEmpty(command.messageMappers ?? []))
    ? '\n\nSome Commands came from a child Submodel. If the child is an\n' +
        '@foldkit/ui component, check its test namespace for a helper\n' +
        '(for example, Toast.test.drainEntry).'
    : '';
/** Throws when trying to send a message with unresolved Commands. Keyed
 *  Commands (built with an interruptible `Command.define`) and Interrupt
 *  Commands are exempt: they model in-flight async work that legitimately
 *  stays pending while later Messages arrive, so a story can dispatch the
 *  Message that interrupts a keyed Command, or keep typing while a
 *  cancellation is in flight. They must still be resolved by the end of the
 *  test. */
export const assertNoUnresolvedCommands = (commands, context) => {
    const unresolvable = Array.filter(commands, command => Predicate.isUndefined(command.key) &&
        Predicate.isUndefined(command.interruptsKey));
    if (Array.isReadonlyArrayNonEmpty(unresolvable)) {
        throw new Error(`I found unresolved Commands ${context}:\n\n${formatCommandList(unresolvable)}\n\n` +
            'Resolve all Commands before sending the next Message.\n' +
            'Use resolve(Definition | instance, ResultMessage) for each one,\n' +
            'or resolveAll(...resolvers) to resolve them all at once.' +
            formatChildCommandHint(unresolvable));
    }
};
/** Throws when Commands remain at the end of a test. */
export const assertAllCommandsResolved = (commands) => {
    if (Array.isReadonlyArrayNonEmpty(commands)) {
        throw new Error(`I found Commands without resolvers:\n\n${formatCommandList(commands)}\n\n` +
            'Every Command produced by update needs to be resolved.\n' +
            'Use resolve(Definition | instance, ResultMessage) for each one,\n' +
            'or resolveAll(...resolvers) to resolve them all at once.' +
            formatChildCommandHint(commands));
    }
};
const formatPendingMount = ({ name, args, occurrence, }) => {
    const occurrenceSuffix = occurrence === 0 ? '' : ` (#${occurrence + 1})`;
    return `${name}${formatArgs(args)}${occurrenceSuffix}`;
};
/** Formats a list of pending Mounts (with args + occurrence suffix where
 *  applicable) for display in error messages. Returns "    (none)" when
 *  empty, mirroring the Command-side formatters. */
export const formatMountList = (mounts) => Array.match(mounts, {
    onEmpty: () => '    (none)',
    onNonEmpty: nonEmpty => pipe(nonEmpty, Array.map(mount => `    ${formatPendingMount(mount)}`), Array.join('\n')),
});
/** Resolves the first pending Mount that matches the given matcher and feeds
 *  its result through update, folding the matched Mount's Submodel-boundary
 *  chain over `resultMessage` first. Returns `undefined` when no pending Mount
 *  matches. Definition matchers match by name; Instance matchers match by
 *  name + args. */
export const resolveMountByMatcher = (internal, pendingMounts, matcher, resultMessage) => pipe(pendingMounts, Array.findFirstIndex(mount => mountMatches(matcher, mount)), Option.flatMap(index => pipe(pendingMounts, Array.get(index), Option.map(matchedMount => {
    /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
    const resolverMessage = foldMessageMappers(matchedMount.messageMappers, resultMessage);
    const remaining = Array.remove(pendingMounts, index);
    const messageUpdate = internal.updateFn(internal.model, resolverMessage);
    return {
        internal: {
            ...internal,
            model: messageUpdate.model,
            message: resolverMessage,
            commands: Array.appendAll(internal.commands, messageUpdate.commands ?? []),
            outMessage: messageUpdate.outMessage,
        },
        pendingMounts: remaining,
    };
}))), Option.getOrUndefined);
/** Throws if any of the given matchers are missing from the pending mount
 *  list. Definition matchers match by name; Instance matchers match by
 *  name + structural-equal args. */
export const assertHasMounts = (pendingMounts, matchers) => {
    const missing = Array.filter(matchers, matcher => !pendingMounts.some(mount => mountMatches(matcher, mount)));
    if (Array.isReadonlyArrayNonEmpty(missing)) {
        const missingFormatted = pipe(missing, Array.map(matcher => `    ${formatMountMatcher(matcher)}`), Array.join('\n'));
        throw new Error(`Expected to find Mounts:\n\n${missingFormatted}\n\n` +
            `But the pending Mounts are:\n\n${formatMountList(pendingMounts)}`);
    }
};
/** Throws if the pending Mounts don't match the given matchers exactly. Each
 *  matcher must consume exactly one pending Mount. Order-independent.
 *  Definition matchers match by name; Instance matchers match by
 *  name + structural-equal args. */
export const assertExactMounts = (pendingMounts, matchers) => {
    const consumed = new Set();
    const unmatched = Array.filter(matchers, matcher => pipe(pendingMounts, Array.findFirstIndex((mount, index) => !consumed.has(index) && mountMatches(matcher, mount)), Option.match({
        onNone: () => true,
        onSome: index => {
            consumed.add(index);
            return false;
        },
    })));
    const leftover = pipe(pendingMounts, Array.filter((_, index) => !consumed.has(index)));
    if (Array.isReadonlyArrayNonEmpty(unmatched) ||
        Array.isReadonlyArrayNonEmpty(leftover)) {
        const expected = pipe(matchers, Array.map(matcher => `    ${formatMountMatcher(matcher)}`), Array.join('\n'));
        throw new Error(`Expected exactly these Mounts:\n\n${expected}\n\n` +
            `But found:\n\n${formatMountList(pendingMounts)}`);
    }
};
/** Throws if there are any pending Mounts. */
export const assertZeroMounts = (pendingMounts) => {
    if (Array.isReadonlyArrayNonEmpty(pendingMounts)) {
        throw new Error(`Expected no Mounts but found:\n\n${formatMountList(pendingMounts)}`);
    }
};
/** Throws when trying to send a Message with unresolved Mounts in the
 *  rendered view. */
export const assertNoUnresolvedMounts = (pendingMounts, context) => {
    if (Array.isReadonlyArrayNonEmpty(pendingMounts)) {
        throw new Error(`I found unresolved Mounts ${context}:\n\n${formatMountList(pendingMounts)}\n\n` +
            'Resolve all Mounts before sending the next Message.\n' +
            'Use resolveMount(Definition | instance, ResultMessage) for each one,\n' +
            'or resolveAllMounts(...resolvers) to resolve them all at once.');
    }
};
/** Throws when trying to send a Message with unacknowledged unmounts
 *  from previous renders. */
export const assertNoUnacknowledgedUnmounts = (unacknowledgedEnded, context) => {
    if (Array.isReadonlyArrayNonEmpty(unacknowledgedEnded)) {
        throw new Error(`I found unacknowledged unmounts ${context}:\n\n${formatMountList(unacknowledgedEnded)}\n\n` +
            'Acknowledge unmounts before sending the next Message.\n' +
            'Use Scene.Mount.expectEnded(Definition) for each one.');
    }
};
/** Throws when Mounts remain at the end of a test. */
export const assertAllMountsResolved = (pendingMounts) => {
    if (Array.isReadonlyArrayNonEmpty(pendingMounts)) {
        throw new Error(`I found Mounts without resolvers:\n\n${formatMountList(pendingMounts)}\n\n` +
            'Every OnMount in the rendered view needs to be resolved.\n' +
            'Use resolveMount(Definition | instance, ResultMessage) for each one,\n' +
            'or resolveAllMounts(...resolvers) to resolve them all at once.');
    }
};
/** Throws when Mounts ended (unmounted) without being acknowledged. */
export const assertAllUnmountsAcknowledged = (unacknowledgedEnded) => {
    if (Array.isReadonlyArrayNonEmpty(unacknowledgedEnded)) {
        throw new Error(`I found Mounts that ended without being acknowledged:\n\n${formatMountList(unacknowledgedEnded)}\n\n` +
            'Every Mount that fires and then unmounts during a scene must be\n' +
            'acknowledged with Scene.Mount.expectEnded(Definition), even if it\n' +
            'was previously resolved.');
    }
};
