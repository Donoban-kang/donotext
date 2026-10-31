import { watch, type FSWatcher } from 'chokidar'
import type { FileChange } from '../../shared/ipc'

export interface WatchOptions {
  /** How long a file must stay unchanged before its change event fires. */
  stabilityMs?: number
}

/** Watches the exact set of paths it is given and reports changes to the renderer. */
export class WatchService {
  private watcher: FSWatcher | null = null
  private paths = new Set<string>()

  constructor(
    private readonly onEvent: (e: FileChange) => void,
    private readonly opts: WatchOptions = {}
  ) {}

  setPaths(next: string[]): void {
    const want = new Set(next)
    if (want.size === 0) {
      void this.close()
      return
    }
    if (!this.watcher) {
      this.watcher = watch([...want], {
        ignoreInitial: true,
        depth: 3,
        awaitWriteFinish: { stabilityThreshold: this.opts.stabilityMs ?? 200, pollInterval: 50 }
      })
      this.watcher.on('change', (path) => this.onEvent({ path, kind: 'change' }))
      this.watcher.on('unlink', (path) => this.onEvent({ path, kind: 'unlink' }))
      this.watcher.on('unlinkDir', (path) => this.onEvent({ path, kind: 'unlink' }))
      this.watcher.on('add', (path) => this.onEvent({ path, kind: 'add' }))
      this.watcher.on('addDir', (path) => this.onEvent({ path, kind: 'add' }))
      this.watcher.on('error', () => {})
    } else {
      const add = [...want].filter((p) => !this.paths.has(p))
      const remove = [...this.paths].filter((p) => !want.has(p))
      if (add.length) this.watcher.add(add)
      if (remove.length) void this.watcher.unwatch(remove)
    }
    this.paths = want
  }

  async close(): Promise<void> {
    const w = this.watcher
    this.watcher = null
    this.paths = new Set()
    await w?.close()
  }
}
