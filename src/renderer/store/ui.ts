import { create } from 'zustand'
import type { ForkChoice, Toast, UnsavedChoice } from '../app/commands'

export interface ConfirmOptions {
  title: string
  body?: string
  okLabel: string
}

interface DialogState {
  compareOpen: boolean
  setCompareOpen(open: boolean): void
  helpOpen: boolean
  setHelpOpen(open: boolean): void
  settingsOpen: boolean
  setSettingsOpen(open: boolean): void
  unsaved: { name: string; resolve: (c: UnsavedChoice) => void } | null
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  ask(name: string): Promise<UnsavedChoice>
  answer(choice: UnsavedChoice): void
  askConfirm(opts: ConfirmOptions): Promise<boolean>
  linkAsk: { initial: string; resolve: (url: string | null) => void } | null
  askLink(initial: string): Promise<string | null>
  answerLink(url: string | null): void
  forkClose: { name: string; canReplace: boolean; resolve: (c: ForkChoice) => void } | null
  askForkClose(name: string, canReplace: boolean): Promise<ForkChoice>
  answerForkClose(choice: ForkChoice): void
  answerConfirm(ok: boolean): void
}

export const useDialogs = create<DialogState>()((set, get) => ({
  compareOpen: false,
  setCompareOpen: (open) => set({ compareOpen: open }),
  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  unsaved: null,
  confirm: null,
  linkAsk: null,
  askLink(initial) {
    get().linkAsk?.resolve(null)
    return new Promise<string | null>((resolve) => set({ linkAsk: { initial, resolve } }))
  },
  answerLink(url) {
    const cur = get().linkAsk
    set({ linkAsk: null })
    cur?.resolve(url)
  },
  forkClose: null,
  askForkClose(name, canReplace) {
    get().forkClose?.resolve('cancel')
    return new Promise<ForkChoice>((resolve) => set({ forkClose: { name, canReplace, resolve } }))
  },
  answerForkClose(choice) {
    const cur = get().forkClose
    set({ forkClose: null })
    cur?.resolve(choice)
  },
  askConfirm(opts) {
    get().confirm?.resolve(false)
    return new Promise<boolean>((resolve) => set({ confirm: { ...opts, resolve } }))
  },
  answerConfirm(ok) {
    const cur = get().confirm
    set({ confirm: null })
    cur?.resolve(ok)
  },
  ask(name) {
    // A second prompt while one is open cancels the first.
    get().unsaved?.resolve('cancel')
    return new Promise<UnsavedChoice>((resolve) => set({ unsaved: { name, resolve } }))
  },
  answer(choice) {
    const cur = get().unsaved
    set({ unsaved: null })
    cur?.resolve(choice)
  }
}))

export interface ToastItem extends Toast {
  id: number
}

interface ToastState {
  items: ToastItem[]
  push(t: Toast): void
  dismiss(id: number): void
}

let toastSeq = 0

export const useToasts = create<ToastState>()((set, get) => ({
  items: [],
  push(t) {
    const id = ++toastSeq
    set((s) => ({ items: [...s.items, { ...t, id }] }))
    setTimeout(() => get().dismiss(id), 6000)
  },
  dismiss(id) {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
  }
}))
