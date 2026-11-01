import type React from 'react'
import { useMemo } from 'react'
import { computeStats, formatBytes } from '../../shared/textStats'
import { t } from '../app/i18n'
import { useDocuments } from '../store/documents'

export interface StatsAnchor {
  docId: string
  left: number
  top: number
}

/** Hover card under a tab: word, character, paragraph and byte counts, kept live while the text changes. */
export function TabStats({ anchor }: { anchor: StatsAnchor }): React.ReactElement | null {
  const text = useDocuments((s) => s.docs[anchor.docId]?.text)
  const eol = useDocuments((s) => s.docs[anchor.docId]?.eol)
  const bom = useDocuments((s) => s.docs[anchor.docId]?.bom)
  const stats = useMemo(() => (text === undefined || !eol ? null : computeStats(text, eol, bom ?? false)), [text, eol, bom])
  if (!stats) return null
  const size = formatBytes(stats.bytes)
  const rows: Array<[string, string]> = [
    [t('statWords'), stats.words.toLocaleString('en-US')],
    [t('statChars'), stats.chars.toLocaleString('en-US')],
    [t('statCharsWithSpaces'), stats.charsWithSpaces.toLocaleString('en-US')],
    [t('statParagraphs'), stats.paragraphs.toLocaleString('en-US')],
    [t('statBytes'), size.approx ? `${size.exact} Byte (${size.approx})` : `${size.exact} Byte`]
  ]
  return (
    <div role="tooltip" data-testid="tab-stats" className="dn-tab-stats" style={{ left: anchor.left, top: anchor.top }}>
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
