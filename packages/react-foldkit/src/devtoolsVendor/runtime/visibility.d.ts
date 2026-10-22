/** Controls when a feature is shown. */
export type Visibility = 'Development' | 'Always';
/** Whether a feature configured with `show` is enabled. `'Always'` enables it
 *  everywhere. `'Development'` enables it only when `isDevelopment` is true.
 *  Callers pass whether Vite's dev server is active, and DevTools also requires
 *  a top-level window. */
export declare const isVisible: (show: Visibility, isDevelopment: boolean) => boolean;
//# sourceMappingURL=visibility.d.ts.map