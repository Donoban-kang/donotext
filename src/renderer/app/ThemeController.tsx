import { useEffect } from 'react'
import { useSettings } from '../store/settings'
import { applyTheme } from './theme'

export function ThemeController(): null {
  const theme = useSettings((s) => s.theme)
  useEffect(() => applyTheme(theme), [theme])
  return null
}
