import { Match } from 'effect';
/** Whether a feature configured with `show` is enabled. `'Always'` enables it
 *  everywhere. `'Development'` enables it only when `isDevelopment` is true.
 *  Callers pass whether Vite's dev server is active, and DevTools also requires
 *  a top-level window. */
export const isVisible = (show, isDevelopment) => Match.value(show).pipe(Match.when('Always', () => true), Match.when('Development', () => isDevelopment), Match.exhaustive);
