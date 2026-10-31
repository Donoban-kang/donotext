export interface TypewriterInput {
  /** Viewport y of the caret's top edge. */
  caretTop: number
  caretHeight: number
  /** Viewport y of the scroll container's top edge, and its height. */
  hostTop: number
  hostHeight: number
}

/** How far to scroll so the caret sits at the vertical centre of the container (0 = leave as is). */
export function typewriterScrollDelta({ caretTop, caretHeight, hostTop, hostHeight }: TypewriterInput): number {
  if (!Number.isFinite(caretTop) || !Number.isFinite(hostTop) || !(hostHeight > 0)) return 0
  const delta = caretTop + caretHeight / 2 - (hostTop + hostHeight / 2)
  return Math.abs(delta) < 1 ? 0 : delta
}
