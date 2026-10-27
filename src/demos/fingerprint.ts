import gsap from 'gsap'
import { env } from '../ui/env'

const NS = 'http://www.w3.org/2000/svg'
const L = 44
const R = 620
const T = 22
const B = 252
const X = (s: number) => L + (s / 3) * (R - L)

function mulberry(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>, parent: Element) {
  const node = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  parent.appendChild(node)
  return node
}

/** Schematic: successes spread out, failures stack exactly on the connect timeout. */
export function initFingerprint(root: HTMLElement) {
  const svg = root.querySelector('[data-fp]')
  if (!svg) return
  const r = mulberry(7)
  for (let s = 0; s <= 3; s += 0.5) el('line', { class: 'grid', x1: X(s), x2: X(s), y1: T, y2: B }, svg)
  el('line', { class: 'axis', x1: L, x2: R, y1: B, y2: B }, svg)
  for (let s = 0; s <= 3; s++) {
    const t = el('text', { class: 'tick', x: X(s), y: B + 22, 'text-anchor': 'middle' }, svg)
    t.textContent = `${s}s`
  }
  const axisLabel = el('text', { class: 'tick', x: R, y: B + 40, 'text-anchor': 'end' }, svg)
  axisLabel.textContent = '요청 시작부터 실패·응답까지 걸린 시간'
  el('line', { class: 'timeout', x1: X(2), x2: X(2), y1: T - 6, y2: B }, svg)
  const tl = el('text', { class: 'timeout-label', x: X(2) + 8, y: T + 6 }, svg)
  tl.textContent = 'connect timeout = 2.000s'

  const ok: SVGCircleElement[] = []
  const fail: SVGCircleElement[] = []
  for (let i = 0; i < 108; i++) {
    const s = Math.min(1.45, Math.max(0.06, Math.exp(Math.log(0.32) + (r() + r() + r() - 1.5) * 0.9)))
    ok.push(el('circle', { class: 'ok', cx: X(s), cy: T + 10 + r() * (B - T - 20), r: 3.2 }, svg))
  }
  for (let i = 0; i < 36; i++) {
    fail.push(el('circle', { class: 'fail', cx: X(2) + (r() - 0.5) * 3.5, cy: T + 12 + (i / 35) * (B - T - 24), r: 3.6 }, svg))
  }
  const legend = el('g', { transform: `translate(${X(2.12)}, ${B - 50})` }, svg)
  el('circle', { class: 'ok', cx: 4, cy: 0, r: 4 }, legend)
  el('text', { class: 'tick', x: 14, y: 4 }, legend).textContent = '응답 · 처리 시간만큼 흩어짐'
  el('circle', { class: 'fail', cx: 4, cy: 22, r: 4 }, legend)
  el('text', { class: 'tick', x: 14, y: 26 }, legend).textContent = '503 · 정확히 +2.000s'

  if (env.reducedMotion) return
  gsap.from(ok, { attr: { cy: B }, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: { each: 0.006, from: 'random' } })
  gsap.from(fail, { attr: { cx: X(0.2) }, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.02, delay: 0.6 })
}
