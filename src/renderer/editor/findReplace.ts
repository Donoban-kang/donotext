import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface MatchRange {
  from: number
  to: number
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Non-overlapping literal matches of `query` in `text`. */
export function findMatches(text: string, query: string, opts: { caseSensitive: boolean }): MatchRange[] {
  if (!query) return []
  const re = new RegExp(escapeRegex(query), opts.caseSensitive ? 'gu' : 'giu')
  const out: MatchRange[] = []
  for (const m of text.matchAll(re)) {
    const from = m.index ?? 0
    out.push({ from, to: from + m[0].length })
  }
  return out
}

export interface SearchState {
  query: string
  caseSensitive: boolean
  current: number
  matches: MatchRange[]
  decorations: DecorationSet
}

export const searchKey = new PluginKey<SearchState>('donotextSearch')

function computeMatches(doc: PMNode, query: string, caseSensitive: boolean): MatchRange[] {
  const out: MatchRange[] = []
  // Matches are found within single text nodes, so a match cannot span a formatting change.
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (const m of findMatches(node.text, query, { caseSensitive })) out.push({ from: pos + m.from, to: pos + m.to })
    }
  })
  return out
}

function build(doc: PMNode, query: string, caseSensitive: boolean, current: number): SearchState {
  const matches = computeMatches(doc, query, caseSensitive)
  const cur = matches.length === 0 ? 0 : Math.min(Math.max(current, 0), matches.length - 1)
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, { class: i === cur ? 'dn-search-match dn-search-current' : 'dn-search-match' })
    )
  )
  return { query, caseSensitive, current: cur, matches, decorations }
}

type SearchMeta = Partial<Pick<SearchState, 'query' | 'caseSensitive' | 'current'>>

export function getSearchState(state: EditorState): SearchState | undefined {
  return searchKey.getState(state)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      setSearch: (query: string, caseSensitive: boolean) => ReturnType
      findNext: () => ReturnType
      findPrevious: () => ReturnType
      replaceCurrent: (replacement: string) => ReturnType
      replaceAll: (replacement: string) => ReturnType
      clearSearch: () => ReturnType
    }
  }
}

export interface SearchReplaceOptions {
  onOpen: (mode: 'find' | 'replace') => void
}

export const SearchReplace = Extension.create<SearchReplaceOptions>({
  name: 'searchReplace',
  addOptions() {
    return { onOpen: () => {} }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_c, { doc }) => build(doc, '', false, 0),
          apply(tr: Transaction, prev, _old, next) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined
            if (!meta && !tr.docChanged) return prev
            return build(
              next.doc,
              meta?.query ?? prev.query,
              meta?.caseSensitive ?? prev.caseSensitive,
              meta?.current ?? prev.current
            )
          }
        },
        props: { decorations: (state) => searchKey.getState(state)?.decorations }
      })
    ]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.options.onOpen('find')
        return true
      },
      'Mod-h': () => {
        this.options.onOpen('replace')
        return true
      }
    }
  },
  addCommands() {
    const meta =
      (m: SearchMeta) =>
      ({ tr, dispatch }: { tr: Transaction; dispatch?: (tr: Transaction) => void }) => {
        if (dispatch) dispatch(tr.setMeta(searchKey, m))
        return true
      }
    return {
      setSearch: (query, caseSensitive) => meta({ query, caseSensitive, current: 0 }),
      clearSearch: () => meta({ query: '', current: 0 }),
      findNext:
        () =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          if (!s || s.matches.length === 0) return false
          if (dispatch) dispatch(tr.setMeta(searchKey, { current: (s.current + 1) % s.matches.length }))
          return true
        },
      findPrevious:
        () =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          if (!s || s.matches.length === 0) return false
          if (dispatch) dispatch(tr.setMeta(searchKey, { current: (s.current - 1 + s.matches.length) % s.matches.length }))
          return true
        },
      replaceCurrent:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          const m = s?.matches[s.current]
          if (!s || !m) return false
          if (dispatch) dispatch(tr.insertText(replacement, m.from, m.to))
          return true
        },
      replaceAll:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const s = searchKey.getState(state)
          if (!s || s.matches.length === 0) return false
          // Apply from the end so earlier positions stay valid.
          for (const m of [...s.matches].reverse()) tr.insertText(replacement, m.from, m.to)
          if (dispatch) dispatch(tr)
          return true
        }
    }
  }
})
