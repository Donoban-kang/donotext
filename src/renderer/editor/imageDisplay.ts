import { mergeAttributes } from '@tiptap/core'
import Image, { type ImageOptions } from '@tiptap/extension-image'
import { resolveImageSrc } from '../../shared/images'

export interface ImageDisplayOptions extends ImageOptions {
  /** Folder of the document being edited; relative image paths are shown relative to it. */
  getBaseDir: () => string | null
}

/**
 * Image node whose on-screen `src` is rewritten to the scoped local-image scheme. The node keeps
 * the original (relative) path, so the markdown that gets saved is unchanged.
 */
export const ImageDisplay = Image.extend<ImageDisplayOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), getBaseDir: () => null }
  },
  renderHTML({ HTMLAttributes }) {
    const src = typeof HTMLAttributes.src === 'string' ? resolveImageSrc(HTMLAttributes.src, this.options.getBaseDir()) : HTMLAttributes.src
    return ['img', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, src })]
  }
})
