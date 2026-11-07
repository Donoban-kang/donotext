import { open, stat } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import type { DropEntry } from '../../shared/fsTypes'
import { importFormatOf } from '../../shared/importTypes'
import { looksLikeText } from '../../shared/textFormat'
import type { FsService } from './fsService'

const MAX_ITEMS = 50
const MAX_PATH = 4096
const SNIFF_BYTES = 8192

/** A file with NUL bytes near the start is binary (images, executables) unless the NULs are UTF-16 text's. */
async function looksBinary(path: string): Promise<boolean> {
  const handle = await open(path, 'r')
  try {
    const buf = Buffer.alloc(SNIFF_BYTES)
    const { bytesRead } = await handle.read(buf, 0, SNIFF_BYTES, 0)
    return !looksLikeText(buf.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

/**
 * Turns dropped paths into something the renderer can open. The user's drop is the approval to use these
 * locations, so each accepted file or folder is granted here; binary files are refused without being read.
 */
export async function openDropped(paths: unknown, fs: FsService, grant: (path: string) => Promise<void>): Promise<DropEntry[]> {
  if (!Array.isArray(paths)) throw new Error('Invalid argument: paths')
  const out: DropEntry[] = []
  for (const p of paths.slice(0, MAX_ITEMS)) {
    if (typeof p !== 'string' || p.length > MAX_PATH || !isAbsolute(p)) continue
    const name = basename(p)
    try {
      const info = await stat(p)
      if (info.isDirectory()) {
        await grant(p)
        out.push({ kind: 'folder', root: p })
      } else if (info.isFile()) {
        // PDF and Office documents are binary, but they can be converted: offer them for import instead of refusing
        const format = importFormatOf(name)
        if (format && format !== 'html') {
          await grant(p)
          out.push({ kind: 'importable', path: p, name, format })
          continue
        }
        if (await looksBinary(p)) {
          out.push({ kind: 'rejected', name, reason: 'binary' })
          continue
        }
        await grant(p)
        out.push({ kind: 'file', result: await fs.readFile(p) })
      }
    } catch (e) {
      out.push({ kind: 'rejected', name, reason: e instanceof Error && /too large/i.test(e.message) ? 'tooLarge' : 'unreadable' })
    }
  }
  return out
}
