import { Array, Equal, Match, Number, Option, Predicate, Record, Result, String, flow, pipe, } from 'effect';
import { dual } from 'effect/Function';
import { StringExt } from '../effectExtensions/index.js';
import { modifyFields } from '../struct/index.js';
const ID_PATTERN = /^#([a-zA-Z0-9_-]+)/;
const CLASS_PATTERN = /^\.([a-zA-Z0-9_-]+)/;
const ATTRIBUTE_PATTERN = /^\[([a-zA-Z][a-zA-Z0-9_-]*)(?:(\^)?=(?:"([^"]*)"|'([^']*)'))?\]/;
const TAG_PATTERN = /^([a-zA-Z][a-zA-Z0-9-]*)/;
const WHITESPACE_CHARACTER_PATTERN = /\s/;
const WHITESPACE_RUN_PATTERN = /\s+/;
const NOT_PREFIX = ':not(';
const SUPPORTED_SELECTORS = 'Supported selectors: tag name, #id, .class, [attr], [attr="value"], ' +
    '[attr^="prefix"] (values in double or single quotes, whitespace allowed), ' +
    ':not(<compound selector>), and descendant combinators (whitespace).';
const throwParseError = (input) => {
    throw new Error(`I could not parse the selector at "${input}".\n\n${SUPPORTED_SELECTORS}`);
};
const initialTopLevelScanState = {
    maybeQuote: Option.none(),
    parenthesisDepth: 0,
};
const initialNotArgumentScanState = {
    maybeQuote: Option.none(),
    parenthesisDepth: 1,
};
const isWhitespace = (character) => WHITESPACE_CHARACTER_PATTERN.test(character);
const isQuote = (character) => character === '"' || character === "'";
const isTopLevel = (state) => Option.isNone(state.maybeQuote) && state.parenthesisDepth === 0;
const advanceScanState = (state, character) => Option.match(state.maybeQuote, {
    onSome: quote => character === quote
        ? modifyFields(state, { maybeQuote: () => Option.none() })
        : state,
    onNone: () => Match.value(character).pipe(Match.when(isQuote, quote => modifyFields(state, { maybeQuote: () => Option.some(quote) })), Match.when('(', () => modifyFields(state, { parenthesisDepth: Number.increment })), Match.when(')', () => modifyFields(state, { parenthesisDepth: Number.decrement })), Match.orElse(() => state)),
});
const splitAtTopLevelWhitespace = (input) => pipe(String.split(input, ''), Array.reduce({ segments: Array.of(''), scanState: initialTopLevelScanState }, ({ segments, scanState }, character) => ({
    segments: isTopLevel(scanState) && isWhitespace(character)
        ? Array.append(segments, '')
        : Array.modifyLastNonEmpty(segments, segment => segment + character),
    scanState: advanceScanState(scanState, character),
})), ({ segments }) => Array.filter(segments, String.isNonEmpty));
const findClosingParenthesisIndex = (input) => pipe(String.split(input, ''), Array.scan(initialNotArgumentScanState, advanceScanState), Array.drop(1), Array.findFirstIndex(isTopLevel));
const matchGroup = (regex) => (input) => pipe(input, String.match(regex), Option.flatMap(match => {
    const [consumed] = match;
    return pipe(match, Array.get(1), Option.map(group => ({
        consumed,
        group,
    })));
}));
const emptySelector = {
    tag: Option.none(),
    id: Option.none(),
    classes: [],
    attributes: [],
    negatedSelectors: [],
};
const tryParseId = (input, accumulator) => pipe(input, matchGroup(ID_PATTERN), Option.map(({ consumed, group }) => parseModifiers(input.slice(consumed.length), modifyFields(accumulator, {
    id: () => Option.some(group),
}))));
const tryParseClass = (input, accumulator) => pipe(input, matchGroup(CLASS_PATTERN), Option.map(({ consumed, group }) => parseModifiers(input.slice(consumed.length), modifyFields(accumulator, {
    classes: Array.append(group),
}))));
const tryParseAttribute = (input, accumulator) => pipe(input, String.match(ATTRIBUTE_PATTERN), Option.flatMap(match => {
    const [consumed, name, startsWithOperator, doubleQuotedValue, singleQuotedValue,] = match;
    if (Predicate.isUndefined(name)) {
        return Option.none();
    }
    const mode = startsWithOperator === '^' ? 'StartsWith' : 'Exact';
    return Option.some(parseModifiers(input.slice(consumed.length), modifyFields(accumulator, {
        attributes: Array.append({
            name,
            value: Option.fromNullishOr(doubleQuotedValue ?? singleQuotedValue),
            mode,
        }),
    })));
}));
const parseNotArgument = (input, argument) => {
    if (String.isEmpty(argument)) {
        return throwParseError(input);
    }
    return parseCompoundSelector(argument);
};
const splitNotArgument = (argumentAndRest) => pipe(argumentAndRest, findClosingParenthesisIndex, Option.map(closingIndex => ({
    argument: pipe(argumentAndRest, String.slice(0, closingIndex), String.trim),
    remainingInput: pipe(argumentAndRest, String.slice(closingIndex + 1)),
})));
const tryParseNot = (input, accumulator) => pipe(input, StringExt.stripPrefix(NOT_PREFIX), Option.flatMap(splitNotArgument), Option.map(({ argument, remainingInput }) => {
    const negatedSelector = parseNotArgument(input, argument);
    const nextAccumulator = modifyFields(accumulator, {
        negatedSelectors: Array.append(negatedSelector),
    });
    return parseModifiers(remainingInput, nextAccumulator);
}));
const parseModifiers = (input, accumulator) => {
    if (String.isEmpty(input)) {
        return accumulator;
    }
    return pipe(tryParseId(input, accumulator), Option.orElse(() => tryParseClass(input, accumulator)), Option.orElse(() => tryParseAttribute(input, accumulator)), Option.orElse(() => tryParseNot(input, accumulator)), Option.getOrElse(() => throwParseError(input)));
};
const parseCompoundSelector = (segment) => pipe(segment, String.match(TAG_PATTERN), Option.match({
    onNone: () => parseModifiers(segment, emptySelector),
    onSome: match => {
        const [consumed] = match;
        return parseModifiers(segment.slice(consumed.length), modifyFields(emptySelector, { tag: () => Array.get(match, 1) }));
    },
}));
export const parseSelector = (input) => {
    const trimmed = String.trim(input);
    if (String.isEmpty(trimmed)) {
        throw new Error('I received an empty selector.\n\n' +
            'Provide a CSS selector like "button", "#email", or \'[role="tab"]\'.');
    }
    return pipe(trimmed, splitAtTopLevelWhitespace, Array.map(parseCompoundSelector));
};
// NODE UTILITIES
const lookupAttribute = (name) => (vnode) => pipe(vnode.data?.attrs?.[name], Option.fromNullishOr, Option.orElse(() => Option.fromNullishOr(vnode.data?.props?.[name])));
const lookupStringAttribute = (name) => (vnode) => pipe(vnode, lookupAttribute(name), Option.map(globalThis.String));
/** Returns whether an element is hidden from the accessibility tree. */
export const isHidden = (vnode) => {
    const maybeHiddenProperty = Option.fromNullishOr(vnode.data?.props?.['hidden']);
    if (Option.exists(maybeHiddenProperty, Boolean)) {
        return true;
    }
    if (Option.isNone(maybeHiddenProperty)) {
        const maybeHiddenAttribute = Option.fromNullishOr(vnode.data?.attrs?.['hidden']);
        if (Option.isSome(maybeHiddenAttribute) &&
            maybeHiddenAttribute.value !== false) {
            return true;
        }
    }
    const maybeAriaHidden = lookupStringAttribute('aria-hidden')(vnode);
    if (Option.isSome(maybeAriaHidden) && maybeAriaHidden.value === 'true') {
        return true;
    }
    const display = vnode.data?.style?.['display'];
    if (display === 'none') {
        return true;
    }
    const visibility = vnode.data?.style?.['visibility'];
    if (visibility === 'hidden') {
        return true;
    }
    return false;
};
const isElement = (node) => !Predicate.isUndefined(node.sel);
const isVNode = (child) => !Predicate.isString(child);
const vnodeChildren = (vnode) => Array.filter(vnode.children ?? [], isVNode);
const collectDescendants = (vnode) => Array.flatMap(vnodeChildren(vnode), child => [
    child,
    ...collectDescendants(child),
]);
const allNodesIn = (vnode) => [
    vnode,
    ...collectDescendants(vnode),
];
/** Returns the ancestor chain of `target` within `root`, ordered from root to
 *  the immediate parent of `target` (exclusive). Returns an empty array when
 *  `target` is `root` itself or is not present in the subtree. */
export const ancestorsOf = (target) => (root) => {
    const walk = (node, chain) => {
        if (node === target) {
            return chain;
        }
        for (const child of vnodeChildren(node)) {
            const result = walk(child, [...chain, node]);
            if (result !== undefined) {
                return result;
            }
        }
        return undefined;
    };
    return walk(root, []) ?? [];
};
const attributeEquals = (name, expected) => (vnode) => pipe(vnode, lookupStringAttribute(name), Option.exists(Equal.equals(expected)));
const FORM_CONTROL_TAGS = ['input', 'select', 'textarea', 'button', 'output'];
const isFormControl = (node) => pipe(node.sel, Option.fromNullishOr, Option.exists(sel => Array.contains(FORM_CONTROL_TAGS, sel)));
const findById = (root) => (id) => Array.findFirst(allNodesIn(root), attributeEquals('id', id));
// MATCHING
const compareByMode = (mode, expected) => (actual) => Match.value(mode).pipe(Match.when('StartsWith', () => actual.startsWith(expected)), Match.when('Exact', () => actual === expected), Match.exhaustive);
const matchesValue = (maybeExpected, mode) => (maybeActual) => Option.match(maybeActual, {
    onNone: () => false,
    onSome: actual => Option.match(maybeExpected, {
        onNone: () => true,
        onSome: expected => compareByMode(mode, expected)(actual),
    }),
});
const matchesAttribute = (vnode) => ({ name, value, mode }) => {
    if (name === 'key') {
        return pipe(vnode.key, Option.fromNullishOr, Option.map(key => typeof key === 'symbol' ? key.toString() : globalThis.String(key)), matchesValue(value, mode));
    }
    return pipe(vnode, lookupAttribute(name), Option.filter(actual => actual !== false), Option.map(globalThis.String), matchesValue(value, mode));
};
const matchesSimpleSelector = (selector) => (vnode) => isElement(vnode) &&
    Option.match(selector.tag, {
        onNone: () => true,
        onSome: tag => vnode.sel === tag,
    }) &&
    Option.match(selector.id, {
        onNone: () => true,
        onSome: id => pipe(vnode, lookupStringAttribute('id'), Option.exists(Equal.equals(id))),
    }) &&
    Array.every(selector.classes, className => vnode.data?.class?.[className] === true) &&
    Array.every(selector.attributes, matchesAttribute(vnode)) &&
    !Array.some(selector.negatedSelectors, negatedSelector => matchesSimpleSelector(negatedSelector)(vnode));
// IMPLICIT ROLES
// NOTE: This map follows the 11 August 2026 ARIA in HTML Recommendation.
// It intentionally excludes mappings proposed only in working drafts:
// https://www.w3.org/TR/2026/REC-html-aria-20260811/#docconformance
const IMPLICIT_ROLE_MAP = {
    address: 'group',
    article: 'article',
    aside: 'complementary',
    blockquote: 'blockquote',
    button: 'button',
    caption: 'caption',
    code: 'code',
    del: 'deletion',
    details: 'group',
    dfn: 'term',
    dialog: 'dialog',
    em: 'emphasis',
    fieldset: 'group',
    figure: 'figure',
    form: 'form',
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    hgroup: 'group',
    hr: 'separator',
    ins: 'insertion',
    li: 'listitem',
    main: 'main',
    menu: 'list',
    meter: 'meter',
    nav: 'navigation',
    ol: 'list',
    optgroup: 'group',
    option: 'option',
    output: 'status',
    p: 'paragraph',
    progress: 'progressbar',
    s: 'deletion',
    search: 'search',
    select: 'combobox',
    strong: 'strong',
    sub: 'subscript',
    summary: 'button',
    sup: 'superscript',
    table: 'table',
    tbody: 'rowgroup',
    td: 'cell',
    textarea: 'textbox',
    tfoot: 'rowgroup',
    thead: 'rowgroup',
    time: 'time',
    tr: 'row',
    ul: 'list',
};
const INPUT_TYPE_ROLE_MAP = {
    button: 'button',
    checkbox: 'checkbox',
    image: 'button',
    number: 'spinbutton',
    radio: 'radio',
    range: 'slider',
    reset: 'button',
    search: 'searchbox',
    submit: 'button',
};
const inputRole = (vnode) => pipe(vnode, lookupStringAttribute('type'), Option.getOrElse(() => 'text'), Option.liftPredicate(typeString => typeString !== 'hidden'), Option.map(typeString => pipe(INPUT_TYPE_ROLE_MAP, Record.get(typeString), Option.getOrElse(() => 'textbox'))));
const imgRole = (vnode) => pipe(vnode, lookupAttribute('alt'), Option.match({
    onNone: () => 'img',
    onSome: value => globalThis.String(value) === '' ? 'presentation' : 'img',
}));
const linkOrGenericRole = (vnode) => pipe(vnode, lookupAttribute('href'), Option.match({
    onNone: () => 'generic',
    onSome: () => 'link',
}));
const thRole = (vnode) => pipe(vnode, lookupStringAttribute('scope'), Option.exists(Equal.equals('row')))
    ? 'rowheader'
    : 'columnheader';
const LANDMARK_EXCLUDING_ANCESTORS = [
    'article',
    'aside',
    'main',
    'nav',
    'section',
];
const isInsideLandmarkAncestor = (root) => (vnode) => pipe(root, ancestorsOf(vnode), Array.some(({ sel }) => sel !== undefined &&
    Array.contains(LANDMARK_EXCLUDING_ANCESTORS, sel)));
const headerOrFooterRole = (bannerRole) => (root) => (vnode) => isInsideLandmarkAncestor(root)(vnode) ? 'generic' : bannerRole;
const sectionRole = (root) => (vnode) => pipe(vnode, nameFromLabelledBy(root), Option.orElse(() => nameFromAriaLabel(vnode)), Option.orElse(() => nameFromTitle(vnode)), Option.match({
    onNone: () => 'generic',
    onSome: () => 'region',
}));
const implicitRole = (root) => (vnode) => pipe(vnode.sel, Option.fromNullishOr, Option.flatMap(tag => Match.value(tag).pipe(Match.when('input', () => inputRole(vnode)), Match.when('img', () => Option.some(imgRole(vnode))), Match.whenOr('a', 'area', () => Option.some(linkOrGenericRole(vnode))), Match.when('th', () => Option.some(thRole(vnode))), Match.when('header', () => Option.some(headerOrFooterRole('banner')(root)(vnode))), Match.when('footer', () => Option.some(headerOrFooterRole('contentinfo')(root)(vnode))), Match.when('section', () => Option.some(sectionRole(root)(vnode))), Match.orElse(() => Record.get(IMPLICIT_ROLE_MAP, tag)))));
const resolveRoles = (root) => (vnode) => pipe(vnode, lookupStringAttribute('role'), Option.map(flow(String.split(WHITESPACE_RUN_PATTERN), Array.filter(String.isNonEmpty))), Option.getOrElse(() => Option.toArray(implicitRole(root)(vnode))));
// ACCESSIBLE NAME
const nonEmptyString = (value) => Option.filter(Option.some(globalThis.String(value)), String.isNonEmpty);
const accessibleTextContent = (vnode) => {
    if (Predicate.isString(vnode.text)) {
        return vnode.text;
    }
    return pipe(vnode.children ?? [], Array.map(child => {
        if (Predicate.isString(child)) {
            return child;
        }
        return isHidden(child) ? '' : accessibleTextContent(child);
    }), Array.join(''));
};
const referencedTextContent = (vnode) => isHidden(vnode) ? textContent(vnode) : accessibleTextContent(vnode);
const nameFromLabelledBy = (root) => (vnode) => pipe(vnode, lookupAttribute('aria-labelledby'), Option.flatMap(nonEmptyString), Option.map(labelledBy => pipe(labelledBy, String.split(WHITESPACE_RUN_PATTERN), Array.filterMap(flow(findById(root), Option.map(referencedTextContent), Result.fromOption(() => undefined))), Array.join(' '))), Option.filter(String.isNonEmpty));
const nameFromAriaLabel = (vnode) => pipe(vnode, lookupAttribute('aria-label'), Option.flatMap(nonEmptyString));
const nameFromLabelFor = (root) => (vnode) => pipe(vnode, lookupStringAttribute('id'), Option.flatMap(idString => pipe(allNodesIn(root), Array.findFirst(node => node.sel === 'label' &&
    pipe(node, lookupStringAttribute('htmlFor'), Option.exists(Equal.equals(idString)))), Option.map(referencedTextContent))));
const nameFromTextContent = (vnode) => Option.filter(Option.some(accessibleTextContent(vnode)), String.isNonEmpty);
const nameFromTitle = (vnode) => pipe(vnode, lookupAttribute('title'), Option.flatMap(nonEmptyString));
const findFirstDirectChildWithTag = (tag) => (vnode) => Array.findFirst(vnodeChildren(vnode), ({ sel }) => sel === tag);
const nameFromChildTag = (childTag) => (vnode) => pipe(vnode, findFirstDirectChildWithTag(childTag), Option.filter(child => !isHidden(child)), Option.map(accessibleTextContent), Option.flatMap(nonEmptyString));
const INPUT_BUTTON_TYPES = ['button', 'reset', 'submit'];
const nameFromInput = (vnode) => {
    const type = pipe(vnode, lookupStringAttribute('type'), Option.getOrElse(() => 'text'));
    if (type === 'image') {
        return pipe(vnode, lookupAttribute('alt'), Option.flatMap(nonEmptyString));
    }
    if (Array.contains(INPUT_BUTTON_TYPES, type)) {
        return pipe(vnode, lookupAttribute('value'), Option.flatMap(nonEmptyString));
    }
    return Option.none();
};
const nameFromNativeHost = (vnode) => Match.value(vnode.sel).pipe(Match.whenOr('img', 'area', () => pipe(vnode, lookupAttribute('alt'), Option.flatMap(nonEmptyString))), Match.when('input', () => nameFromInput(vnode)), Match.when('fieldset', () => nameFromChildTag('legend')(vnode)), Match.when('figure', () => nameFromChildTag('figcaption')(vnode)), Match.when('table', () => nameFromChildTag('caption')(vnode)), Match.orElse(() => Option.none()));
/** Computes the accessible name of an element. Resolves via
 *  `aria-labelledby`, `aria-label`, `<label for>`, native host language
 *  attributes and child elements (img/area alt, input value/alt,
 *  fieldset legend, figure figcaption, table caption), accessible text content,
 *  then `title`. */
export const accessibleName = (root) => (vnode) => pipe(vnode, nameFromLabelledBy(root), Option.orElse(() => nameFromAriaLabel(vnode)), Option.orElse(() => nameFromLabelFor(root)(vnode)), Option.orElse(() => nameFromNativeHost(vnode)), Option.orElse(() => nameFromTextContent(vnode)), Option.orElse(() => nameFromTitle(vnode)), Option.getOrElse(() => ''));
/** Computes the accessible description of an element. Resolves via
 *  `aria-describedby` (joining referenced elements' text content). */
export const accessibleDescription = (root) => (vnode) => pipe(vnode, lookupAttribute('aria-describedby'), Option.flatMap(nonEmptyString), Option.match({
    onNone: () => '',
    onSome: flow(String.split(WHITESPACE_RUN_PATTERN), Array.filterMap(flow(findById(root), Option.map(referencedTextContent), Result.fromOption(() => undefined))), Array.join(' ')),
}));
// PUBLIC API
const findAllImpl = (selectorString) => (html) => {
    const selector = parseSelector(selectorString);
    const allNodes = allNodesIn(html);
    return pipe(selector, Array.head, Option.match({
        onNone: () => [],
        onSome: firstSegment => Array.reduce(Array.drop(selector, 1), Array.filter(allNodes, matchesSimpleSelector(firstSegment)), (candidates, segment) => Array.filter(Array.flatMap(candidates, collectDescendants), matchesSimpleSelector(segment))),
    }));
};
/** Finds the first VNode matching the CSS selector. */
export const find = dual(2, (html, selectorString) => pipe(html, findAllImpl(selectorString), Array.head));
/** Finds all VNodes matching the CSS selector. */
export const findAll = dual(2, (html, selectorString) => findAllImpl(selectorString)(html));
/** Extracts all text content from a VNode tree, depth-first. */
export const textContent = (vnode) => {
    if (Predicate.isString(vnode.text))
        return vnode.text;
    return pipe(vnode.children ?? [], Array.map(child => Predicate.isString(child) ? child : textContent(child)), Array.join(''));
};
const hasDirectTextNodeMatch = (node, target) => Array.some(node.children ?? [], child => Predicate.isString(child)
    ? child === target
    : !isElement(child) && textContent(child) === target);
const attrImpl = (vnode, name) => {
    if (name === 'class') {
        return pipe(vnode.data?.class, Option.fromNullishOr, Option.map(flow(Record.toEntries, Array.filter(([, isActive]) => isActive), Array.map(([className]) => className), Array.join(' '))), Option.filter(String.isNonEmpty));
    }
    return lookupStringAttribute(name)(vnode);
};
/** Reads an attribute or prop value from a VNode. */
export const attr = dual(2, attrImpl);
// ACCESSIBLE LOCATORS
const HEADING_LEVEL_PATTERN = /^h([1-6])$/;
const headingLevelFromTag = (vnode) => pipe(vnode.sel, Option.fromNullishOr, Option.flatMap(String.match(HEADING_LEVEL_PATTERN)), Option.map(match => globalThis.Number(match[1])));
const ariaLevel = (vnode) => pipe(vnode, lookupStringAttribute('aria-level'), Option.flatMap(Number.parse), Option.filter(value => !globalThis.Number.isNaN(value)));
const resolveLevel = (vnode) => Option.orElse(ariaLevel(vnode), () => headingLevelFromTag(vnode));
const ariaTriStateMatches = (attribute, expected) => (vnode) => pipe(vnode, lookupStringAttribute(attribute), Option.exists(value => value === globalThis.String(expected)));
const checkedMatches = (expected) => (vnode) => {
    const fromAria = ariaTriStateMatches('aria-checked', expected)(vnode);
    if (fromAria)
        return true;
    if (expected === 'mixed')
        return false;
    return pipe(vnode, lookupAttribute('checked'), Option.exists(value => Boolean(value) === expected));
};
const selectedMatches = (expected) => (vnode) => {
    const fromAria = ariaTriStateMatches('aria-selected', expected)(vnode);
    if (fromAria)
        return true;
    return pipe(vnode, lookupAttribute('selected'), Option.exists(value => Boolean(value) === expected));
};
const disabledMatches = (expected) => (vnode) => {
    const ariaValue = lookupStringAttribute('aria-disabled')(vnode);
    if (Option.isSome(ariaValue)) {
        return ariaValue.value === globalThis.String(expected);
    }
    const disabled = pipe(vnode, lookupAttribute('disabled'), Option.exists(Boolean));
    return disabled === expected;
};
const currentMatches = (expected) => (vnode) => {
    const maybeCurrent = lookupStringAttribute('aria-current')(vnode);
    if (expected === false) {
        return Option.isNone(maybeCurrent) || maybeCurrent.value === 'false';
    }
    else {
        return Option.exists(maybeCurrent, value => value === globalThis.String(expected));
    }
};
const roleOptionsMatch = (options, html) => (node) => {
    if (!options)
        return true;
    if (options.name !== undefined) {
        const actual = accessibleName(html)(node);
        const matches = options.name instanceof RegExp
            ? options.name.test(actual)
            : actual === options.name;
        if (!matches) {
            return false;
        }
    }
    if (options.level !== undefined &&
        !Option.exists(resolveLevel(node), Equal.equals(options.level))) {
        return false;
    }
    if (options.checked !== undefined &&
        !checkedMatches(options.checked)(node)) {
        return false;
    }
    if (options.selected !== undefined &&
        !selectedMatches(options.selected)(node)) {
        return false;
    }
    if (options.pressed !== undefined &&
        !ariaTriStateMatches('aria-pressed', options.pressed)(node)) {
        return false;
    }
    if (options.expanded !== undefined &&
        !ariaTriStateMatches('aria-expanded', options.expanded)(node)) {
        return false;
    }
    if (options.disabled !== undefined &&
        !disabledMatches(options.disabled)(node)) {
        return false;
    }
    if (options.current !== undefined &&
        !currentMatches(options.current)(node)) {
        return false;
    }
    return true;
};
/** Finds the first element with the given ARIA role and optional matching options.
 *  Supports `name` (accessible name), `level` (heading level), `checked`,
 *  `selected`, `pressed`, `expanded`, `disabled`, and `current` state filters. */
export const getByRole = (role, options) => (html) => {
    const matchesOptions = roleOptionsMatch(options, html);
    const resolveRolesInRoot = resolveRoles(html);
    return Array.findFirst(allNodesIn(html), node => pipe(node, resolveRolesInRoot, Array.contains(role)) &&
        matchesOptions(node));
};
/** Finds all elements with the given ARIA role and optional matching options. */
export const getAllByRole = (role, options) => (html) => {
    const matchesOptions = roleOptionsMatch(options, html);
    const resolveRolesInRoot = resolveRoles(html);
    return Array.filter(allNodesIn(html), node => pipe(node, resolveRolesInRoot, Array.contains(role)) &&
        matchesOptions(node));
};
const matchesText = (target, options) => {
    if (target instanceof RegExp) {
        const pattern = new RegExp(target.source, target.flags);
        return node => {
            pattern.lastIndex = 0;
            return pattern.test(textContent(node));
        };
    }
    else {
        const isExact = options?.exact !== false;
        return node => {
            const nodeText = textContent(node);
            return isExact
                ? nodeText === target || hasDirectTextNodeMatch(node, target)
                : String.includes(target)(nodeText);
        };
    }
};
/** Finds the first element whose text matches `target`.
 *  A string matches the element's full text or one direct text node. When
 *  `exact` is false, it instead matches a substring of the full text. A `RegExp`
 *  tests the full text from index zero without changing its `lastIndex`, and
 *  `exact` has no effect. When an ancestor and descendant both match, the query
 *  returns the descendant. Never returns text VNodes. */
export const getByText = (target, options) => (html) => {
    const textMatches = matchesText(target, options);
    return pipe(allNodesIn(html), Array.filter(node => isElement(node) && textMatches(node)), Array.findFirst(match => !Array.some(Array.filter(collectDescendants(match), isElement), textMatches)));
};
/** Finds the first element with the given placeholder attribute. */
export const getByPlaceholder = (placeholderValue) => (html) => Array.findFirst(allNodesIn(html), attributeEquals('placeholder', placeholderValue));
/** Finds the first element with the given label text. Checks `aria-label`
 *  first, then `<label for="id">` association, then `<label>` nesting,
 *  then `aria-labelledby` reverse lookup. */
export const getByLabel = (labelValue) => (html) => {
    const allNodes = allNodesIn(html);
    return pipe(Array.findFirst(allNodes, attributeEquals('aria-label', labelValue)), Option.orElse(() => pipe(Array.filter(allNodes, node => node.sel === 'label' && textContent(node) === labelValue), Array.filterMap(labelNode => Result.fromOption(pipe(labelNode, lookupStringAttribute('htmlFor'), Option.flatMap(findById(html)), Option.orElse(() => Array.findFirst(collectDescendants(labelNode), isFormControl))), () => undefined)), Array.head)), Option.orElse(() => Array.findFirst(allNodes, flow(nameFromLabelledBy(html), Option.exists(Equal.equals(labelValue))))));
};
/** Finds every element with the given label text. Applies the same four
 *  resolution strategies as `getByLabel` (`aria-label`, `<label for="id">`,
 *  `<label>` nesting, `aria-labelledby`) and returns deduplicated matches. */
export const getAllByLabel = (labelValue) => (html) => {
    const allNodes = allNodesIn(html);
    const viaAriaLabel = Array.filter(allNodes, attributeEquals('aria-label', labelValue));
    const viaLabelElement = pipe(Array.filter(allNodes, node => node.sel === 'label' && textContent(node) === labelValue), Array.flatMap(labelNode => pipe(labelNode, lookupStringAttribute('htmlFor'), Option.flatMap(findById(html)), Option.match({
        onNone: () => Array.filter(collectDescendants(labelNode), isFormControl),
        onSome: control => [control],
    }))));
    const viaLabelledBy = Array.filter(allNodes, flow(nameFromLabelledBy(html), Option.exists(Equal.equals(labelValue))));
    return Array.dedupeWith([...viaAriaLabel, ...viaLabelElement, ...viaLabelledBy], (a, b) => a === b);
};
/** Finds the first element with the given `alt` attribute. */
export const getByAltText = (altValue) => (html) => Array.findFirst(allNodesIn(html), attributeEquals('alt', altValue));
/** Finds the first element with the given `title` attribute. */
export const getByTitle = (titleValue) => (html) => Array.findFirst(allNodesIn(html), attributeEquals('title', titleValue));
/** Finds the first element with the given `data-testid` attribute. */
export const getByTestId = (testIdValue) => (html) => Array.findFirst(allNodesIn(html), attributeEquals('data-testid', testIdValue));
/** Finds every element whose text matches `target`.
 *  Uses the same string and `RegExp` rules as `getByText`, but returns matching
 *  ancestors and descendants in traversal order. Never returns text VNodes. */
export const getAllByText = (target, options) => (html) => {
    const textMatches = matchesText(target, options);
    return Array.filter(allNodesIn(html), node => isElement(node) && textMatches(node));
};
/** Finds all elements with the given placeholder attribute. */
export const getAllByPlaceholder = (placeholderValue) => (html) => Array.filter(allNodesIn(html), attributeEquals('placeholder', placeholderValue));
/** Finds all elements with the given `alt` attribute. */
export const getAllByAltText = (altValue) => (html) => Array.filter(allNodesIn(html), attributeEquals('alt', altValue));
/** Finds all elements with the given `title` attribute. */
export const getAllByTitle = (titleValue) => (html) => Array.filter(allNodesIn(html), attributeEquals('title', titleValue));
/** Finds all elements with the given `data-testid` attribute. */
export const getAllByTestId = (testIdValue) => (html) => Array.filter(allNodesIn(html), attributeEquals('data-testid', testIdValue));
/** Finds all form controls whose current value matches. */
export const getAllByDisplayValue = (displayValueString) => (html) => Array.filter(allNodesIn(html), node => isFormControl(node) &&
    attributeEquals('value', displayValueString)(node));
/** Finds the first form control whose current value matches. Checks the `value`
 *  attribute on inputs, textareas, and selects. */
export const getByDisplayValue = (displayValue) => (html) => Array.findFirst(allNodesIn(html), node => isFormControl(node) && attributeEquals('value', displayValue)(node));
const makeLocator = (resolve, description) => Object.assign(resolve, { description });
const makeLocatorAll = (resolve, description) => Object.assign(resolve, { description });
const describeRoleOptions = (options) => {
    const parts = [];
    if (options.name !== undefined) {
        parts.push(options.name instanceof RegExp ? `${options.name}` : `"${options.name}"`);
    }
    if (options.level !== undefined)
        parts.push(`level=${options.level}`);
    if (options.checked !== undefined)
        parts.push(`checked=${options.checked}`);
    if (options.selected !== undefined)
        parts.push(`selected=${options.selected}`);
    if (options.pressed !== undefined)
        parts.push(`pressed=${options.pressed}`);
    if (options.expanded !== undefined)
        parts.push(`expanded=${options.expanded}`);
    if (options.disabled !== undefined)
        parts.push(`disabled=${options.disabled}`);
    if (options.current !== undefined)
        parts.push(`current=${options.current}`);
    return Array.join(parts, ' ');
};
/** Creates a Locator that finds an element by ARIA role. Supports matching on
 *  `name`, `level`, `checked`, `selected`, `pressed`, `expanded`, `disabled`, and
 *  `current`. For `current`, `true` matches `aria-current="true"` only, `false`
 *  matches a missing attribute or `aria-current="false"`, and a token such as
 *  `'page'` matches itself. */
export const role = (roleValue, options) => {
    const optionsDescription = options ? describeRoleOptions(options) : '';
    const description = String.isEmpty(optionsDescription)
        ? roleValue
        : `${roleValue} ${optionsDescription}`;
    return makeLocator(getByRole(roleValue, options), description);
};
/** Creates a Locator that finds an element by placeholder attribute. */
export const placeholder = (placeholderValue) => makeLocator(getByPlaceholder(placeholderValue), `placeholder "${placeholderValue}"`);
/** Creates a Locator that finds an element by aria-label. */
export const label = (labelValue) => makeLocator(getByLabel(labelValue), `label "${labelValue}"`);
/** Creates a Locator that finds an element by its `alt` attribute. */
export const altText = (altValue) => makeLocator(getByAltText(altValue), `alt text "${altValue}"`);
/** Creates a Locator that finds an element by its `title` attribute. */
export const title = (titleValue) => makeLocator(getByTitle(titleValue), `title "${titleValue}"`);
/** Creates a Locator that finds an element by its `data-testid` attribute. */
export const testId = (testIdValue) => makeLocator(getByTestId(testIdValue), `testId "${testIdValue}"`);
/** Creates a Locator that finds a form control by its current `value`. */
export const displayValue = (valueString) => makeLocator(getByDisplayValue(valueString), `display value "${valueString}"`);
const describeText = (target) => target instanceof RegExp ? `${target}` : `"${target}"`;
/** Creates a Locator that finds the same element as `getByText`. */
export const text = (target, options) => makeLocator(getByText(target, options), `text ${describeText(target)}`);
/** Creates a Locator from the supported CSS selector subset. Use this escape
 *  hatch when no accessible Locator is available. Supports tag names, `#id`,
 *  `.class`, `[attr]`, `[attr="value"]`, `[attr^="prefix"]`,
 *  `:not(<compound selector>)`, and descendant combinators. Attribute values
 *  may use double or single quotes and may contain whitespace. Any other
 *  syntax throws. */
export const selector = (css) => makeLocator(flow(findAllImpl(css), Array.head), `"${css}"`);
/** Creates a scoped Locator that finds the child within the parent.
 *  Composes via `Option.flatMap` — the parent is resolved first, then
 *  the child is searched within the parent's subtree. */
export const within = dual(2, (parent, child) => makeLocator(flow(parent, Option.flatMap(child)), `${child.description} within ${parent.description}`));
// LOCATOR-ALL FACTORIES
/** Creates a LocatorAll that finds every element matching the role. */
export const allRole = (roleValue, options) => {
    const optionsDescription = options ? describeRoleOptions(options) : '';
    const description = String.isEmpty(optionsDescription)
        ? roleValue
        : `${roleValue} ${optionsDescription}`;
    return makeLocatorAll(getAllByRole(roleValue, options), `all ${description}`);
};
/** Creates a LocatorAll that finds the same elements as `getAllByText`. */
export const allText = (target, options) => makeLocatorAll(getAllByText(target, options), `all text ${describeText(target)}`);
/** Creates a LocatorAll that finds every element with the given label. */
export const allLabel = (labelValue) => makeLocatorAll(getAllByLabel(labelValue), `all label "${labelValue}"`);
/** Creates a LocatorAll that finds every element with the given placeholder. */
export const allPlaceholder = (placeholderValue) => makeLocatorAll(getAllByPlaceholder(placeholderValue), `all placeholder "${placeholderValue}"`);
/** Creates a LocatorAll that finds every element with the given alt text. */
export const allAltText = (altValue) => makeLocatorAll(getAllByAltText(altValue), `all alt text "${altValue}"`);
/** Creates a LocatorAll that finds every element with the given title. */
export const allTitle = (titleValue) => makeLocatorAll(getAllByTitle(titleValue), `all title "${titleValue}"`);
/** Creates a LocatorAll that finds every element with the given data-testid. */
export const allTestId = (testIdValue) => makeLocatorAll(getAllByTestId(testIdValue), `all testId "${testIdValue}"`);
/** Creates a LocatorAll that finds every form control with the given value. */
export const allDisplayValue = (valueString) => makeLocatorAll(getAllByDisplayValue(valueString), `all display value "${valueString}"`);
/** Creates a LocatorAll that returns every element matching a CSS
 *  selector. Accepts the same syntax as `selector`. */
export const allSelector = (css) => makeLocatorAll(findAllImpl(css), `all "${css}"`);
// LOCATOR-ALL COMBINATORS
/** Picks the first match from a LocatorAll, producing a single-match Locator. */
export const first = (locatorAll) => makeLocator(flow(locatorAll, Array.head), `first of ${locatorAll.description}`);
/** Picks the last match from a LocatorAll, producing a single-match Locator. */
export const last = (locatorAll) => makeLocator(flow(locatorAll, Array.last), `last of ${locatorAll.description}`);
/** Picks the nth match (0-indexed) from a LocatorAll, producing a Locator. */
export const nth = dual(2, (locatorAll, index) => makeLocator(flow(locatorAll, Array.get(index)), `nth(${index}) of ${locatorAll.description}`));
const describeFilterOptions = (options) => {
    const parts = [];
    if (options.has)
        parts.push(`has ${options.has.description}`);
    if (options.hasNot)
        parts.push(`hasNot ${options.hasNot.description}`);
    if (options.hasText !== undefined)
        parts.push(`hasText "${options.hasText}"`);
    if (options.hasNotText !== undefined) {
        parts.push(`hasNotText "${options.hasNotText}"`);
    }
    return Array.join(parts, ', ');
};
/** Filters a LocatorAll's matches. Supports `has`/`hasNot` to keep entries
 *  that do/don't contain a matching descendant, and `hasText`/`hasNotText`
 *  to keep entries whose text content does/doesn't include a substring. */
export const filter = dual(2, (locatorAll, options) => makeLocatorAll(html => Array.filter(locatorAll(html), match => {
    if (options.has && Option.isNone(options.has(match)))
        return false;
    if (options.hasNot && Option.isSome(options.hasNot(match))) {
        return false;
    }
    if (options.hasText !== undefined) {
        if (!String.includes(options.hasText)(textContent(match))) {
            return false;
        }
    }
    if (options.hasNotText !== undefined) {
        if (String.includes(options.hasNotText)(textContent(match))) {
            return false;
        }
    }
    return true;
}), `${locatorAll.description} filtered by (${describeFilterOptions(options)})`));
/** Resolves a target (CSS selector string or Locator) against a VNode tree. */
export const resolveTarget = (html, target) => {
    if (typeof target === 'string') {
        return {
            maybeElement: pipe(html, findAllImpl(target), Array.head),
            description: `"${target}"`,
        };
    }
    return { maybeElement: target(html), description: target.description };
};
