/** Scroll position as a 0..1 fraction of the scrollable range. */
export function offsetToRatio(offset: number, scrollHeight: number, clientHeight: number): number {
  const range = scrollHeight - clientHeight
  if (range <= 0) return 0
  return Math.max(0, Math.min(1, offset / range))
}

export function ratioToOffset(ratio: number, scrollHeight: number, clientHeight: number): number {
  const range = scrollHeight - clientHeight
  if (range <= 0) return 0
  return Math.max(0, Math.min(1, ratio)) * range
}

/**
 * Keeps two scroll containers at the same relative position. The containers are looked up lazily
 * because editors are replaced when a tab or view mode changes. Returns a detach function.
 */
export function attachScrollLink(getA: () => HTMLElement | null, getB: () => HTMLElement | null): () => void {
  // scrollTop values we assigned ourselves: the resulting scroll event must not be echoed back.
  const assigned = new WeakMap<Element, number>()

  const follow = (from: HTMLElement, to: HTMLElement): void => {
    const ratio = offsetToRatio(from.scrollTop, from.scrollHeight, from.clientHeight)
    to.scrollTop = ratioToOffset(ratio, to.scrollHeight, to.clientHeight)
    assigned.set(to, to.scrollTop)
  }

  const onScroll = (e: Event): void => {
    const target = e.target
    if (!(target instanceof HTMLElement)) return
    if (assigned.get(target) === target.scrollTop) {
      assigned.delete(target)
      return
    }
    const a = getA()
    const b = getB()
    if (target === a && b) follow(a, b)
    else if (target === b && a) follow(b, a)
  }

  // `scroll` does not bubble, but it can be observed in the capture phase.
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => document.removeEventListener('scroll', onScroll, { capture: true })
}
