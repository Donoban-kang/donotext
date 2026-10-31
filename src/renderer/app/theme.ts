export type Theme = 'light' | 'dark' | 'system'

export function resolveTheme(pref: Theme, systemDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

/** Applies the theme to <html>; returns a function that stops following system changes. */
export function applyTheme(pref: Theme): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = (): void => {
    document.documentElement.dataset.theme = resolveTheme(pref, mq.matches)
  }
  apply()
  mq.addEventListener('change', apply)
  return () => mq.removeEventListener('change', apply)
}
