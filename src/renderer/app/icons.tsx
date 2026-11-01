import type React from 'react'

// Small stroke icons (16px grid). Decorative only: every button keeps its text label for screen readers.
const PATHS = {
  folder: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6l1.4 1.5h5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z',
  plus: 'M8 3v10M3 8h10',
  save: 'M3 3h8l2 2v8H3zM5.5 3v3h4V3M5.5 13V9.5h5V13',
  saveAs: 'M3 3h6.5l2.5 2.5V8M5.5 3v3h4V3M3 3v10h5M11.5 10v4M9.5 12h4',
  splitRight: 'M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5zM8 3v10',
  splitDown: 'M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5zM2.5 8h11',
  closePane: 'M2.5 4.5A1.5 1.5 0 0 1 4 3h8a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5zM6.2 6.2l3.6 3.6M9.8 6.2 6.2 9.8',
  compare: 'M3 5.5h8.5M9.5 3 12 5.5 9.5 8M13 10.5H4.5M6.5 8 4 10.5 6.5 13',
  link: 'M6.8 9.2a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7M9.2 6.8a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7',
  html: 'M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3M9 3.5 7 12.5',
  pdf: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3M6 10.5h4M6 8.5h4',
  close: 'M4 4l8 8M12 4l-8 8',
  edit: 'M3 13l.6-2.6L10.8 3.2a1.4 1.4 0 0 1 2 0l0 0a1.4 1.4 0 0 1 0 2L5.6 12.4z',
  trash: 'M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8',
  help: 'M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM6.3 6.3a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3M8 11.6v.1',
  settings: 'M3 4.5h6M11.5 4.5H13M3 11.5h1.5M7 11.5h6M9 3v3M6 10v3',
  download: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3M8 7v3.4M6.4 9l1.6 1.6L9.6 9',
  triLeft: 'M10.5 3.5v9L4.5 8z',
  triRight: 'M5.5 3.5v9L11.5 8z',
  chevron: 'M6 4l4 4-4 4',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }): React.ReactElement {
  return (
    <svg className={name.startsWith('tri') ? 'dn-icon dn-icon-solid' : 'dn-icon'} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
