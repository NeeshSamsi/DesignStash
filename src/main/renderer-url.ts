/**
 * The dev server's page, from electron-vite's ELECTRON_RENDERER_URL, or undefined to load the built
 * files. The installed app ignores the variable: the preload bridge goes to whatever page loads.
 */
export function rendererDevUrl(env: NodeJS.ProcessEnv, packaged: boolean): string | undefined {
  if (packaged) return undefined
  return env['ELECTRON_RENDERER_URL'] || undefined
}
