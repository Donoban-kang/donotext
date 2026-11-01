import type React from 'react'
import { useMemo } from 'react'
import { computeStats, formatBytes } from '../../shared/textStats'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'

const ENCODING_LABEL = { 'utf-8': 'encUtf8', 'utf-16le': 'encUtf16le', 'utf-16be': 'encUtf16be', cp949: 'encCp949' } as const

export interface StatsAnchor {
  docId: string
  left: number
  top: number
}

/** Hover card under a tab: word, character, paragraph and byte counts, kept live while the text changes. */
export function TabStats({ anchor }: { anchor: StatsAnchor }): React.ReactElement | null {
  const name = useDocuments((s) => s.docs[anchor.docId]?.name)
  const text = useDocuments((s) => s.docs[anchor.docId]?.text)
  const eol = useDocuments((s) => s.docs[anchor.docId]?.eol)
  const bom = useDocuments((s) => s.docs[anchor.docId]?.bom)
  const encoding = useDocuments((s) => s.docs[anchor.docId]?.encoding) ?? 'utf-8'
  const stats = useMemo(() => (text === undefined || !eol ? null : computeStats(text, eol, bom ?? false, encoding)), [text, eol, bom, encoding])
  if (!stats) return null
  const size = formatBytes(stats.bytes)
  const rows: Array<[string, string]> = [
    [t('statWords'), stats.words.toLocaleString('en-US')],
    [t('statChars'), stats.chars.toLocaleString('en-US')],
    [t('statCharsWithSpaces'), stats.charsWithSpaces.toLocaleString('en-US')],
    [t('statParagraphs'), stats.paragraphs.toLocaleString('en-US')],
    [t('statBytes'), size.approx ? `${size.exact} Byte (${size.approx})` : `${size.exact} Byte`],
    [t('statEncoding'), t(ENCODING_LABEL[encoding]) + (bom && encoding !== 'cp949' ? ' (BOM)' : '')]
  ]
  return (
    <div role="tooltip" data-testid="tab-stats" className="dn-tab-stats" style={{ left: anchor.left, top: anchor.top }}>
      <div className="dn-tab-stats-name">{name}</div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
