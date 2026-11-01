// Public facts about the app plus the pure helpers used by the "check for updates" feature.
export const APP_NAME = 'donotext'
export const AUTHOR = 'Donoban-kang'
export const REPO_URL = 'https://github.com/Donoban-kang/donotext'
export const RELEASES_URL = `${REPO_URL}/releases`
export const LATEST_RELEASE_API = 'https://api.github.com/repos/Donoban-kang/donotext/releases/latest'

export interface AppInfo {
  name: string
  version: string
  author: string
  repoUrl: string
  releasesUrl: string
}

/** notFound: GitHub says there is no public release (the repository may be private). */
export type UpdateErrorReason = 'network' | 'http' | 'notFound' | 'badResponse'

export type UpdateResult =
  | { status: 'latest'; current: string; latest: string }
  | { status: 'available'; current: string; latest: string; url: string }
  | { status: 'error'; current: string; reason: UpdateErrorReason }

/** "v1.2.3" or "1.2.3" -> [1, 2, 3]; anything else (pre-release tags included) -> null. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(text.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Negative when a < b, 0 when equal, positive when a > b. Unparseable versions compare as equal. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}
