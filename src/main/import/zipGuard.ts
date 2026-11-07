import JSZip from 'jszip'

const MAX_ENTRIES = 20_000
const MAX_UNPACKED_BYTES = 600 * 1024 * 1024

export class UnsafeArchiveError extends Error {}

/** Opens an Office file (a zip) and refuses archives that would unpack to an unreasonable size. */
export async function openOfficeZip(bytes: Uint8Array): Promise<JSZip> {
  const zip = await JSZip.loadAsync(bytes)
  let entries = 0
  let unpacked = 0
  zip.forEach((_path, file) => {
    entries++
    unpacked += (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
  })
  if (entries > MAX_ENTRIES || unpacked > MAX_UNPACKED_BYTES) throw new UnsafeArchiveError('archive too large')
  return zip
}
