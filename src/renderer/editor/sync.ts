export const EDIT_DEBOUNCE_MS = 150

/** A remote text update is applied unless this pane caused it or an IME composition is active. */
export function shouldApplyRemote(a: { selfId: string; origin: string; composing: boolean }): boolean {
  return a.origin !== a.selfId && !a.composing
}

export interface Debouncer {
  call(fn: () => void): void
  flush(): void
  cancel(): void
}

export function createDebouncer(ms: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: (() => void) | undefined
  const clear = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  return {
    call(fn) {
      pending = fn
      clear()
      timer = setTimeout(() => {
        timer = undefined
        const f = pending
        pending = undefined
        f?.()
      }, ms)
    },
    flush() {
      clear()
      const f = pending
      pending = undefined
      f?.()
    },
    cancel() {
      clear()
      pending = undefined
    }
  }
}

const flushers = new Set<() => void>()

/** Editors register here so commands (save, close) can push pending edits into the store first. */
export function registerFlusher(fn: () => void): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

export function flushAllEditors(): void {
  flushers.forEach((f) => f())
}
