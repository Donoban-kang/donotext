import { create } from 'zustand'
import type { Toast, UnsavedChoice } from '../app/commands'

export interface ConfirmOptions {
  title: string
  body?: string
  okLabel: string
}

interface DialogState {
  unsaved: { name: string; resolve: (c: UnsavedChoice) => void } | null
  confirm: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  ask(name: string): Promise<UnsavedChoice>
  answer(choice: UnsavedChoice): void
  askConfirm(opts: ConfirmOptions): Promise<boolean>
  answerConfirm(ok: boolean): void
}

export const useDialogs = create<DialogState>()((set, get) => ({
  unsaved: null,
  confirm: null,
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
