/**
 * Decides whether a window may close. The renderer owns the "save changes?" question, so the first
 * close attempt is held back and the renderer is asked; it answers with respond(). A crashed or
 * hung page can no longer answer, so it must never keep the window from closing.
 */
export class CloseGate {
  private allowed = false
  private unavailable = false

  attempt(): 'allow' | 'ask' {
    return this.allowed || this.unavailable ? 'allow' : 'ask'
  }

  /** The renderer's answer. Returns true when the window should now close. */
  respond(canClose: boolean): boolean {
    this.allowed = canClose
    return canClose
  }

  markUnavailable(): void {
    this.unavailable = true
  }

  reset(): void {
    this.allowed = false
    this.unavailable = false
  }
}
