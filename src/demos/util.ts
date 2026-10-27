export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const id = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id)
        reject(new DOMException('aborted', 'AbortError'))
      },
      { once: true },
    )
  })

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

export function q<T extends Element = HTMLElement>(root: ParentNode, sel: string): T {
  const el = root.querySelector(sel)
  if (!el) throw new Error(`missing ${sel}`)
  return el as T
}

export function qa<T extends Element = HTMLElement>(root: ParentNode, sel: string): T[] {
  return Array.from(root.querySelectorAll(sel)) as T[]
}

export type Tone = 'ok' | 'bad' | 'warn' | ''

export function say(el: HTMLElement, text: string, tone: Tone = '') {
  el.innerHTML = tone ? `<span class="${tone}">${text}</span>` : text
}

/** Run `fn` while `el` is on screen; pauses otherwise. */
export function whileVisible(el: Element, onChange: (visible: boolean) => void) {
  const io = new IntersectionObserver((entries) => entries.forEach((e) => onChange(e.isIntersecting)), { threshold: 0.15 })
  io.observe(el)
}
