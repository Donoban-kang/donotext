import { scan } from './i18nScan.mjs'

const hits = scan('src')
for (const h of hits) console.error(`${h.file}:${h.line}  ${h.text}`)
if (hits.length > 0) {
  console.error(`\n${hits.length} hard-coded Korean string(s). Move them to src/renderer/app/i18n/ko.ts and use t().`)
  process.exit(1)
}
console.log('i18n check passed: no hard-coded UI text outside ko.ts')
