import { ko, type MessageKey } from './ko'

/** Looks up a Korean UI string and substitutes {placeholders}. */
export function t(key: MessageKey, vars: Record<string, string> = {}): string {
  return ko[key].replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? `{${name}}`)
}

export type { MessageKey }
