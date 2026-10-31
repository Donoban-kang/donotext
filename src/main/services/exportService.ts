import { dirname, resolve } from 'node:path'
import { inlineLocalImages } from './exportImages'
import type { FsService } from './fsService'
import type { ImageService } from './imageService'

export interface ExportDeps {
  /** Shows a save dialog; resolves to the chosen path or null when cancelled. */
  showSaveDialog(opts: { defaultName: string; ext: 'html' | 'pdf' }): Promise<string | null>
  /** Renders a complete HTML document to PDF bytes. */
  renderPdf(html: string): Promise<Uint8Array>
}

function suggestedFileName(name: string, ext: string): string {
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1)
  const stem = base.replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
  return `${stem || 'document'}.${ext}`
}

const withExtension = (path: string, ext: string): string => (path.toLowerCase().endsWith(`.${ext}`) ? path : `${path}.${ext}`)

export class ExportService {
  constructor(
    private readonly fs: FsService,
    private readonly images: ImageService,
    private readonly deps: ExportDeps
  ) {}

  async exportHtml(html: string, suggestedName: string, docPath: string | null): Promise<string | null> {
    const target = await this.chooseTarget(suggestedName, 'html', docPath)
    if (!target) return null
    const docDir = docPath ? dirname(resolve(docPath)) : null
    const standalone = await inlineLocalImages(html, docDir, (p) => this.images.read(p))
    await this.fs.writeFile(target, standalone, 'lf', false)
    return target
  }

  async exportPdf(html: string, suggestedName: string, docPath: string | null): Promise<string | null> {
    const target = await this.chooseTarget(suggestedName, 'pdf', docPath)
    if (!target) return null
    const docDir = docPath ? dirname(resolve(docPath)) : null
    const standalone = await inlineLocalImages(html, docDir, (p) => this.images.read(p))
    await this.fs.writeBinary(target, await this.deps.renderPdf(standalone))
    return target
  }

  private async chooseTarget(name: string, ext: 'html' | 'pdf', docPath: string | null): Promise<string | null> {
    const chosen = await this.deps.showSaveDialog({ defaultName: suggestedFileName(name, ext), ext })
    if (!chosen) return null
    const finalPath = withExtension(chosen, ext)
    if (docPath) {
      const doc = resolve(docPath)
      if (resolve(chosen) === doc || resolve(finalPath) === doc) throw new Error('Cannot overwrite the source document')
    }
    this.fs.grant(finalPath)
    return finalPath
  }
}
