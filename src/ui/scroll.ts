import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { env, $$ } from './env'

export interface Scroller {
  lenis: Lenis | null
  velocity(): number
  to(target: string | number | HTMLElement): void
  stop(): void
  start(): void
}

const NAV_OFFSET = 76

export function initScroll(): Scroller {
  let lenis: Lenis | null = null
  if (!env.reducedMotion) {
    lenis = new Lenis({ autoRaf: false, lerp: 0.095, smoothWheel: true })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((time) => lenis?.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)
  }

  const to = (target: string | number | HTMLElement) => {
    const el = typeof target === 'string' ? (target === '#top' ? 0 : document.querySelector<HTMLElement>(target)) : target
    if (el === null) return
    if (lenis) {
      lenis.scrollTo(el, { offset: typeof el === 'number' ? 0 : -NAV_OFFSET, duration: 1.4 })
    } else if (typeof el === 'number') {
      window.scrollTo({ top: el })
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET })
    }
  }

  for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
    a.addEventListener('click', (e) => {
      const hash = a.getAttribute('href')
      if (!hash || hash === '#') return
      if (hash !== '#top' && !document.querySelector(hash)) return
      e.preventDefault()
      to(hash)
      history.replaceState(null, '', hash === '#top' ? location.pathname : hash)
    })
  }

  return {
    lenis,
    velocity: () => (lenis ? lenis.velocity : 0),
    to,
    stop: () => lenis?.stop(),
    start: () => lenis?.start(),
  }
}
