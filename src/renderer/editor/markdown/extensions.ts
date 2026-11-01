import { Extension, type Extensions, type JSONContent, type MarkdownRendererHelpers } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import Link from '@tiptap/extension-link'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { isSafeLinkUrl } from '../../../shared/links'
import { FrontMatter } from './frontMatterNode'
import { markdownDestination } from './markdownText'
import { inlineMarks } from './inlineMarks'
import { MathBlock, MathInline } from './math'
import { RawMarkdownBlock, RawMarkdownInline } from './rawMarkdown'
import { RawHtmlBlock, RawHtmlInline } from './rawHtml'

const lowlight = createLowlight(common)

const titlePart = (title: unknown): string => (typeof title === 'string' && title ? ` "${title.replace(/"/g, '\\"')}"` : '')

const escapeHtml = (c: string): string => c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * marked hands back backslash-escaped characters already HTML-escaped (`\>` → "&gt;") and the
 * editor would keep that as literal text. Reading the escape as plain text gives the real character.
 */
export const MarkdownEscapes = Extension.create({
  name: 'markdownEscapes',
  markdownTokenizer: {
    name: 'dnEscape',
    level: 'inline',
    start: (src: string) => src.indexOf('\\'),
    tokenize: (src: string) => {
      const m = /^\\([!-/:-@[-`{-~])/.exec(src)
      return m ? { type: 'text', raw: m[0], text: escapeHtml(m[1]) } : undefined
    }
  }
})

/** Image that writes targets containing spaces/parentheses in a form markdown reads back. */
export const ImageMd = Image.extend({
  renderMarkdown(node: JSONContent) {
    const a = node.attrs ?? {}
    return `![${String(a.alt ?? '')}](${markdownDestination(String(a.src ?? ''))}${titlePart(a.title)})`
  }
})

/** Link that does the same for its target. */
export const LinkMd = Link.extend({
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers) {
    const a = node.attrs ?? {}
    return `[${h.renderChildren(node)}](${markdownDestination(String(a.href ?? ''))}${titlePart(a.title)})`
  }
})

/** TipTap extension set shared by the WYSIWYG editor and the headless markdown codec. */
export function getExtensions(): Extensions {
  return [
    StarterKit.configure({ codeBlock: false, link: false }),
    LinkMd.configure({ openOnClick: false, isAllowedUri: (url: string) => isSafeLinkUrl(url) }),
    Markdown,
    MarkdownEscapes,
    CodeBlockLowlight.configure({ lowlight }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    ImageMd,
    RawHtmlBlock,
    RawHtmlInline,
    RawMarkdownBlock,
    RawMarkdownInline,
    FrontMatter,
    MathInline,
    MathBlock,
    ...inlineMarks
  ]
}
