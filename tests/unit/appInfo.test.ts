import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion } from '../../src/shared/appInfo'
import { checkForUpdate, type FetchLike } from '../../src/main/services/updateService'

const reply = (ok: boolean, body: unknown, status = ok ? 200 : 500): FetchLike => async () => ({ ok, status, json: async () => body })

describe('versions', () => {
  it('parses plain and v-prefixed versions and rejects anything else', () => {
    expect(parseVersion('0.1.2')).toEqual([0, 1, 2])
    expect(parseVersion('v10.0.3')).toEqual([10, 0, 3])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('1.2.3-beta.1')).toBeNull()
    expect(parseVersion('latest')).toBeNull()
  })
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.1.10', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('0.2.0', '0.10.0')).toBeLessThan(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
  })
})

describe('checkForUpdate', () => {
  it('reports a newer release with the releases page link', async () => {
    const r = await checkForUpdate('0.1.2', reply(true, { tag_name: 'v0.1.3', html_url: 'https://evil.example' }))
    expect(r).toEqual({ status: 'available', current: '0.1.2', latest: '0.1.3', url: 'https://github.com/Donoban-kang/donotext/releases' })
  })
  it('reports up to date when the release is the same or older', async () => {
    expect((await checkForUpdate('0.1.2', reply(true, { tag_name: 'v0.1.2' }))).status).toBe('latest')
    expect((await checkForUpdate('0.1.2', reply(true, { tag_name: 'v0.1.1' }))).status).toBe('latest')
  })
  it('maps failures to error reasons without throwing', async () => {
    expect(await checkForUpdate('0.1.2', reply(false, {}))).toEqual({ status: 'error', current: '0.1.2', reason: 'http' })
    expect(await checkForUpdate('0.1.2', reply(false, {}, 404))).toEqual({ status: 'error', current: '0.1.2', reason: 'notFound' })
    expect(await checkForUpdate('0.1.2', reply(true, { tag_name: 'weird' }))).toEqual({ status: 'error', current: '0.1.2', reason: 'badResponse' })
    expect(await checkForUpdate('0.1.2', reply(true, null))).toEqual({ status: 'error', current: '0.1.2', reason: 'badResponse' })
    const down: FetchLike = async () => {
      throw new Error('offline')
    }
    expect(await checkForUpdate('0.1.2', down)).toEqual({ status: 'error', current: '0.1.2', reason: 'network' })
  })
  it('gives up when the request hangs', async () => {
    const hang: FetchLike = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
    expect((await checkForUpdate('0.1.2', hang, 20)).status).toBe('error')
  })
})
