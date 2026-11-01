import { isSafeLinkUrl } from '../../shared/links'
import { t } from '../app/i18n'
import { useDialogs, useToasts } from '../store/ui'

/**
 * Asks for a link address. Resolves to the address (an empty string means "remove the link"), or to
 * null when cancelled or when the address is not allowed in a link.
 */
export async function askLinkUrl(initial: string): Promise<string | null> {
  const url = await useDialogs.getState().askLink(initial)
  if (url === null) return null
  if (url !== '' && !isSafeLinkUrl(url)) {
    useToasts.getState().push({ kind: 'error', message: t('linkUnsafe') })
    return null
  }
  return url
}

/** Opens the system file chooser for images; resolves to the chosen files (none when cancelled). */
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp'
    input.multiple = true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}
