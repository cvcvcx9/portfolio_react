import gsap from 'gsap'
import { env, $ } from './env'

/** Dot + lagging ring. Grows over links; shows a word for elements with data-cursor. */
export function initCursor() {
  if (!env.finePointer) return
  const root = $('.cursor')
  const dot = $('.cursor__dot')
  const ring = $('.cursor__ring')
  const label = $('.cursor__ring em')
  if (!root || !dot || !ring || !label) return
  document.documentElement.classList.add('has-cursor')

  let x = -100
  let y = -100
  let rx = x
  let ry = y
  window.addEventListener(
    'pointermove',
    (e) => {
      x = e.clientX
      y = e.clientY
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => {
    x = -100
    y = -100
  })

  gsap.ticker.add((_t, deltaMs) => {
    const k = 1 - Math.exp((-Math.min(deltaMs, 50) / 1000) * 18)
    rx += (x - rx) * k
    ry += (y - ry) * k
    dot.style.transform = `translate3d(${x}px,${y}px,0)`
    ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`
  })

  const interactive = 'a, button, summary, label, [role="slider"], [data-cursor], .fl-row, .verb'
  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element).closest<HTMLElement>(interactive)
    const word = el?.dataset.cursor ?? ''
    root.classList.toggle('is-hover', Boolean(word))
    root.classList.toggle('is-link', Boolean(el) && !word)
    label.textContent = word
  })
}
