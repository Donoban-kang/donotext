import type { Extensions } from '@tiptap/core'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { isSafeLinkUrl } from '../../../shared/links'
import { FrontMatter } from './frontMatterNode'
import { MathBlock, MathInline } from './math'
import { RawHtmlBlock, RawHtmlInline } from './rawHtml'

const lowlight = createLowlight(common)

/** TipTap extension set shared by the WYSIWYG editor and the headless markdown codec. */
export function getExtensions(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, isAllowedUri: (url: string) => isSafeLinkUrl(url) }
    }),
    Markdown,
    CodeBlockLowlight.configure({ lowlight }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image,
    RawHtmlBlock,
    RawHtmlInline,
    FrontMatter,
    MathInline,
    MathBlock
  ]
}
