import { execSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Windows and macOS file systems ignore letter case, so `Outline.tsx` and `outline.ts` are the same
 * name there: `import './Outline'` then picks the wrong file and the build fails. Linux hides this,
 * so the check runs here.
 */
describe('source file names', () => {
  it('never differ from another module only by letter case', () => {
    const files = execSync('git ls-files -- src tests scripts', { encoding: 'utf8' }).split('\n').filter(Boolean)
    const importable = files.filter((f) => /\.(ts|tsx|mts|js|jsx|mjs)$/.test(f) && !f.endsWith('.d.ts'))
    const byStem = new Map<string, string[]>()
    for (const f of importable) {
      const stem = f.replace(/\.[^./]+$/, '').toLowerCase()
      byStem.set(stem, [...(byStem.get(stem) ?? []), f])
    }
    const clashes = [...byStem.values()].filter((group) => group.length > 1)
    expect(clashes).toEqual([])
  })
})
