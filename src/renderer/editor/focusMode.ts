import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Marks the top-level block that holds the caret. The CSS dims every other block, but only while
 * focus mode is switched on, so this plugin can stay registered all the time.
 */
export const FocusMode = Extension.create({
  name: 'focusMode',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const { $from } = state.selection
            if ($from.depth < 1) return null
            const from = $from.before(1)
            return DecorationSet.create(state.doc, [
              Decoration.node(from, from + $from.node(1).nodeSize, { class: 'dn-block-current' })
            ])
          }
        }
      })
    ]
  }
})
