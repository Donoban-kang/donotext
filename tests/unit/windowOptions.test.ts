import { describe, expect, it } from 'vitest'
import { buildWebPreferences } from '../../src/main/windowOptions'
import { CSP } from '../../src/shared/csp'

describe('buildWebPreferences', () => {
  it('enables isolation and sandbox and disables node integration', () => {
    const prefs = buildWebPreferences('/p')
    expect(prefs.contextIsolation).toBe(true)
    expect(prefs.sandbox).toBe(true)
    expect(prefs.nodeIntegration).toBe(false)
    expect(prefs.preload).toBe('/p')
  })
})

describe('CSP', () => {
  it("restricts default and script sources to 'self'", () => {
    expect(CSP).toContain("default-src 'self'")
    expect(CSP).toContain("script-src 'self'")
  })
  it('does not allow unsafe-eval', () => {
    expect(CSP).not.toContain('unsafe-eval')
  })
})
