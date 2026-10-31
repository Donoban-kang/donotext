import { useEffect } from 'react'
import { useLayout } from '../store/layoutStore'
import { attachScrollLink } from './scrollLink'

/** The element that actually scrolls inside a pane: the source editor's scroller or the WYSIWYG host. */
function scrollerOf(leafId: string): HTMLElement | null {
  const pane = document.querySelector(`[data-testid="pane-${leafId}"]`)
  return pane?.querySelector<HTMLElement>('.cm-scroller') ?? pane?.querySelector<HTMLElement>('.dn-editor-host') ?? null
}

export function ScrollLinkController(): null {
  const link = useLayout((s) => s.scrollLink)
  useEffect(() => {
    if (!link) return
    return attachScrollLink(
      () => scrollerOf(link.a),
      () => scrollerOf(link.b)
    )
  }, [link])
  return null
}
