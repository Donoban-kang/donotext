import { mergeAttributes } from '@tiptap/core'
import type { ImageOptions } from '@tiptap/extension-image'
import { isSafeImageSrc, resolveImageSrc } from '../../shared/images'
import { t } from '../app/i18n'
import { ImageMd } from './markdown/extensions'

export interface ImageDisplayOptions extends ImageOptions {
  /** Folder of the document being edited; relative image paths are shown relative to it. */
  getBaseDir: () => string | null
}

/**
 * Image node whose on-screen `src` is rewritten to the scoped local-image scheme. The node keeps
 * the original (relative) path, so the markdown that gets saved is unchanged.
 */
export const ImageDisplay = ImageMd.extend<ImageDisplayOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), getBaseDir: () => null }
  },
  renderHTML({ HTMLAttributes }) {
    // Dangerous targets stay in the document (and the saved file) but are never loaded.
    if (typeof HTMLAttributes.src === 'string' && !isSafeImageSrc(HTMLAttributes.src)) {
      return ['span', { class: 'dn-blocked-image', title: HTMLAttributes.src }, t('imageBlocked')]
    }
    const src = typeof HTMLAttributes.src === 'string' ? resolveImageSrc(HTMLAttributes.src, this.options.getBaseDir()) : HTMLAttributes.src
    return ['img', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, src })]
  }
})
