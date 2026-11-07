import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/
// koreanData.ts holds language data for reading Korean documents (particles, numbering symbols), not UI text.
const ALLOWED = new Set(['src/renderer/app/i18n/ko.ts', 'src/main/import/koreanData.ts'])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) yield p
  }
}

/** Source text with comments blanked out (line structure kept so reported line numbers stay right). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (_m, pre) => pre)
}

/** Lists Hangul text found in code outside the translation table: `[{ file, line, text }]`. */
export function scan(root = 'src') {
  const found = []
  for (const file of walk(root)) {
    const rel = relative('.', file).split('\\').join('/')
    if (ALLOWED.has(rel)) continue
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((text, i) => {
        if (HANGUL.test(text)) found.push({ file: rel, line: i + 1, text: text.trim() })
      })
  }
  return found
}
