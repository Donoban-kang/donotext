import { isAbsolute, resolve } from 'node:path'

/**
 * File paths a user passed when starting the app (double-clicking a .md file, `donotext a.md`).
 * `cwd` is the directory the command was run from, used to resolve relative paths.
 */
export function filePathsFromArgv(argv: string[], isPackaged: boolean, cwd: string): string[] {
  // Packaged: [executable, ...args]. Development: [electron, appDir, ...args].
  const args = argv.slice(isPackaged ? 1 : 2)
  const paths = args.filter((a) => a !== '' && !a.startsWith('-')).map((a) => (isAbsolute(a) ? a : resolve(cwd, a)))
  return [...new Set(paths)]
}
