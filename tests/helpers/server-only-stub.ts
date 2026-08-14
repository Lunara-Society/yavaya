/**
 * Stub for the `server-only` package.
 *
 * That package exists to make a build fail if server code is imported into a
 * client bundle. Vitest is neither, so importing it would throw. Aliasing it
 * here lets server modules be tested directly without weakening the guard in
 * the application build.
 */
export {};
