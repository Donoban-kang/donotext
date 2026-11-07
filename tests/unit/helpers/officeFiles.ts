// Builds tiny but valid Office files in memory for converter tests.
import JSZip from 'jszip'

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface DocxParagraph {
  text: string
  style?: string
  bold?: boolean
}

export async function makeDocx(paragraphs: DocxParagraph[], opts: { table?: string[][]; images?: number } = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  )
  const imgRels = Array.from({ length: opts.images ?? 0 }, (_, k) => `<Relationship Id="rIdImg${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/i${k}.png"/>`).join('')
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imgRels}</Relationships>`
  )
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  for (let k = 0; k < (opts.images ?? 0); k++) zip.file(`word/media/i${k}.png`, png)
  const styles = [
    ['Heading1', 'heading 1'],
    ['Heading2', 'heading 2'],
    ['Style1', '제목 1']
  ]
    .map(([id, name]) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`)
    .join('')
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles}</w:styles>`)
  const paras = paragraphs
    .map(
      (p) =>
        `<w:p>${p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : ''}<w:r>${p.bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`
    )
    .join('')
  const table = opts.table
    ? `<w:tbl>${opts.table.map((row) => `<w:tr>${row.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
    : ''
  const imgs = Array.from(
    { length: opts.images ?? 0 },
    (_, k) =>
      `<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="100" cy="100"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rIdImg${k}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  ).join('')
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}${table}${imgs}</w:body></w:document>`
  )
  return zip.generateAsync({ type: 'uint8array' })
}

// ---------- xlsx ----------

export type XlsxCell = string | number | boolean | null | { n: number; style: 'date' | 'percent' | 'thousands' | 'customDate' }

export interface XlsxSheet {
  name: string
  rows: XlsxCell[][]
  hidden?: boolean
}

const STYLE_INDEX = { date: 1, percent: 2, thousands: 3, customDate: 4 } as const
const colName = (k: number): string => String.fromCharCode(65 + k)

export async function makeXlsx(sheets: XlsxSheet[], opts: { date1904?: boolean } = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  const shared: string[] = []
  const sst = (s: string): number => {
    let i = shared.indexOf(s)
    if (i < 0) i = shared.push(s) - 1
    return i
  }
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`)
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${opts.date1904 ? ' date1904="1"' : ''}/><sheets>${sheets
      .map((s, k) => `<sheet name="${esc(s.name)}" sheetId="${k + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${k + 1}"/>`)
      .join('')}</sheets></workbook>`
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_s, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`)
      .join('')}</Relationships>`
  )
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy&quot;년&quot; m&quot;월&quot;"/></numFmts><cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="9"/><xf numFmtId="3"/><xf numFmtId="164"/></cellXfs></styleSheet>`
  )
  sheets.forEach((s, k) => {
    const rows = s.rows
      .map((row, r) => {
        const cells = row
          .map((v, c) => {
            const ref = `${colName(c)}${r + 1}`
            if (v === null) return ''
            if (typeof v === 'string') return `<c r="${ref}" t="s"><v>${sst(v)}</v></c>`
            if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
            if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
            return `<c r="${ref}" s="${STYLE_INDEX[v.style]}"><v>${v.n}</v></c>`
          })
          .join('')
        return `<row r="${r + 1}">${cells}</row>`
      })
      .join('')
    zip.file(`xl/worksheets/sheet${k + 1}.xml`, `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)
  })
  zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`)
  return zip.generateAsync({ type: 'uint8array' })
}

// ---------- pptx ----------

export interface PptxSlide {
  title?: string
  /** Body placeholder paragraphs (they inherit bullets from the layout). */
  body?: Array<string | { text: string; lvl: number }>
  textBox?: string[]
  table?: string[][]
  notes?: string
  images?: number
}

export async function makePptx(slides: PptxSlide[]): Promise<Uint8Array> {
  const zip = new JSZip()
  const NS = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
  const para = (text: string, lvl = 0): string => `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r><a:t>${esc(text)}</a:t></a:r></a:p>`
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`)
  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${slides.map((_s, k) => `<p:sldId id="${256 + k}" r:id="rId${k + 1}"/>`).join('')}</p:sldIdLst></p:presentation>`
  )
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides
      .map((_s, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${k + 1}.xml"/>`)
      .join('')}</Relationships>`
  )
  slides.forEach((s, k) => {
    const shapes: string[] = []
    if (s.title !== undefined)
      shapes.push(`<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody>${para(s.title)}</p:txBody></p:sp>`)
    if (s.body)
      shapes.push(
        `<p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${s.body.map((b) => (typeof b === 'string' ? para(b) : para(b.text, b.lvl))).join('')}</p:txBody></p:sp>`
      )
    if (s.textBox) shapes.push(`<p:sp><p:nvSpPr><p:nvPr/></p:nvSpPr><p:txBody>${s.textBox.map((t) => para(t)).join('')}</p:txBody></p:sp>`)
    shapes.push(`<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:fld type="slidenum"><a:t>${k + 1}</a:t></a:fld></a:p></p:txBody></p:sp>`)
    if (s.table)
      shapes.push(
        `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${s.table.map((row) => `<a:tr>${row.map((c) => `<a:tc><a:txBody>${para(c)}</a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
      )
    for (let i = 0; i < (s.images ?? 0); i++) shapes.push(`<p:pic><p:nvPicPr/></p:pic>`)
    zip.file(`ppt/slides/slide${k + 1}.xml`, `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${shapes.join('')}</p:spTree></p:cSld></p:sld>`)
    if (s.notes !== undefined) {
      zip.file(
        `ppt/slides/_rels/slide${k + 1}.xml.rels`,
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${k + 1}.xml"/></Relationships>`
      )
      zip.file(
        `ppt/notesSlides/notesSlide${k + 1}.xml`,
        `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${para(s.notes)}</p:txBody></p:sp></p:spTree></p:cSld></p:notes>`
      )
    }
  })
  return zip.generateAsync({ type: 'uint8array' })
}
