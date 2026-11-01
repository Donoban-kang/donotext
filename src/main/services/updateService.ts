import { LATEST_RELEASE_API, RELEASES_URL, compareVersions, parseVersion, type UpdateResult } from '../../shared/appInfo'

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{
  ok: boolean
  status?: number
  json(): Promise<unknown>
}>

/**
 * Asks GitHub for the newest published release. Sends no document data, only a plain GET, and only
 * when the user presses the button. The download link is always the project's own releases page.
 */
export async function checkForUpdate(current: string, fetchFn: FetchLike, timeoutMs = 8000): Promise<UpdateResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchFn(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'donotext-update-check' },
      signal: ctrl.signal
    })
    if (!res.ok) return { status: 'error', current, reason: res.status === 404 ? 'notFound' : 'http' }
    const body = (await res.json()) as { tag_name?: unknown } | null
    const tag = typeof body?.tag_name === 'string' ? body.tag_name : ''
    if (!parseVersion(tag) || !parseVersion(current)) return { status: 'error', current, reason: 'badResponse' }
    const latest = tag.replace(/^v/, '')
    return compareVersions(latest, current) > 0
      ? { status: 'available', current, latest, url: RELEASES_URL }
      : { status: 'latest', current, latest }
  } catch {
    return { status: 'error', current, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
