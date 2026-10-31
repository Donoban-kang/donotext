import DOMPurify from 'dompurify'
import { markdownToHtml } from './markdown/codec'
import { renderLatex } from './markdown/math'

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CSP = "default-src 'none'; img-src data: http: https: file:; style-src 'unsafe-inline'"

const STYLE = `
body{margin:0;font:16px/1.7 system-ui,-apple-system,"Segoe UI","Noto Sans KR",sans-serif;color:#222;background:#fff}
main{max-width:860px;margin:0 auto;padding:32px 24px}
h1,h2,h3,h4{line-height:1.3}
pre{background:#f4f4f4;padding:12px 14px;border-radius:6px;overflow:auto}
code{background:#f0f0f0;padding:1px 4px;border-radius:4px}
pre code{background:none;padding:0}
table{border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #bbb;padding:4px 10px}
blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:14px;color:#555}
img{max-width:100%}
ul[data-type="taskList"]{list-style:none;padding-left:4px}
math[display="block"]{display:block;text-align:center;margin:12px 0}
@media print{main{max-width:none;padding:0}}
`

const purify = DOMPurify(window)
// Task-list checkboxes are the only form control that may stay, and they are read-only.
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName !== 'INPUT') return
  if (node.getAttribute('type') === 'checkbox') node.setAttribute('disabled', '')
  else node.remove()
})

const BASE_CONFIG = { USE_PROFILES: { html: true, mathMl: true }, FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'] }

/** Complete, sanitized, script-free HTML document for a markdown source. */
export function buildExportHtml(markdown: string, title: string): string {
  // Pass 1: sanitize what the markdown produced (this removes anything hostile in raw HTML).
  const first = purify.sanitize(markdownToHtml(markdown), { ...BASE_CONFIG, ADD_ATTR: ['data-latex', 'data-math-inline', 'data-math-block'] })
  const doc = new DOMParser().parseFromString(`<body>${first}</body>`, 'text/html')

  // Raw HTML kept inert in the editor is rendered in the export, after sanitizing it on its own.
  for (const el of Array.from(doc.querySelectorAll('pre[data-raw-html],code[data-raw-html]'))) {
    el.outerHTML = purify.sanitize(el.textContent ?? '', BASE_CONFIG)
  }

  // Formulas become MathML, which needs neither fonts nor scripts.
  for (const el of Array.from(doc.querySelectorAll('[data-math-inline],[data-math-block]'))) {
    const display = el.hasAttribute('data-math-block')
    const mathml = /<math[\s\S]*<\/math>/.exec(renderLatex(el.getAttribute('data-latex') ?? '', display, 'mathml'))
    if (mathml) el.outerHTML = mathml[0]
    else el.replaceWith(doc.createTextNode(el.getAttribute('data-latex') ?? ''))
  }

  // Pass 2: sanitize again, now including the generated MathML.
  const body = purify.sanitize(doc.body.innerHTML, BASE_CONFIG)

  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    `<body><main>${body}</main></body>`,
    '</html>'
  ].join('\n')
}
