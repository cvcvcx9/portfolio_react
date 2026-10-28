import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { env, $, $$ } from './env'
import type { Scroller } from './scroll'
import type { Stage } from '../gl/stage'

function nav() {
  const bar = $('[data-nav]')
  if (!bar) return
  ScrollTrigger.create({
    start: 40,
    end: 'max',
    onToggle: (self) => bar.classList.toggle('is-scrolled', self.isActive),
  })
}

function menu(scroller: Scroller) {
  const toggle = $<HTMLButtonElement>('[data-menu-toggle]')
  const panel = $('[data-menu]')
  if (!toggle || !panel) return
  const set = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open))
    panel.hidden = !open
    if (open) scroller.stop()
    else scroller.start()
  }
  toggle.addEventListener('click', () => set(Boolean(panel.hidden)))
  for (const a of $$('a', panel)) a.addEventListener('click', () => set(false))
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) set(false)
  })
}

function chapters() {
  const railItems = $$('[data-rail-item]')
  const navLinks = $$<HTMLAnchorElement>('.nav__links a[href^="#"]')
  for (const section of $$('[data-chapter]')) {
    const id = section.dataset.chapter!
    ScrollTrigger.create({
      trigger: section,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => {
        if (!self.isActive) return
        railItems.forEach((a) => a.classList.toggle('is-active', a.dataset.railItem === id))
        navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`))
      },
    })
  }
  const progress = $('.rail__progress b')
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => progress?.style.setProperty('--p', self.progress.toFixed(4)),
  })
}

function hud(stage: Stage | null) {
  const root = $('[data-hud]')
  if (!root || !stage) return
  const count = $('[data-hud-count]', root)
  const shape = $('[data-hud-shape]', root)
  const entropy = $('[data-hud-entropy]', root)
  if (count) count.textContent = `${stage.count.toLocaleString('en-US')} PARTICLES`
  window.setInterval(() => {
    const info = stage.info()
    if (shape) shape.textContent = info.shape.toUpperCase()
    if (entropy) entropy.textContent = info.entropy.toFixed(2)
    root.classList.toggle('is-hidden', !info.focus)
  }, 220)
}

function marquee(scroller: Scroller) {
  const track = $('[data-marquee] .marquee__track')
  if (!track) return
  track.innerHTML += track.innerHTML
  if (env.reducedMotion) return
  let x = 0
  let width = track.scrollWidth / 2
  window.addEventListener('resize', () => (width = track.scrollWidth / 2))
  gsap.ticker.add((_t, deltaMs) => {
    const dt = Math.min(deltaMs, 50) / 1000
    const speed = 42 + Math.min(Math.abs(scroller.velocity()) * 9, 520)
    x -= speed * dt
    if (-x >= width) x += width
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`
  })
}

function copyMail() {
  const btn = $<HTMLButtonElement>('[data-copy]')
  const hint = $('[data-copy-hint]')
  if (!btn || !hint) return
  btn.addEventListener('click', async () => {
    const text = btn.dataset.copy!
    try {
      await navigator.clipboard.writeText(text)
      hint.textContent = '복사했습니다 ✓'
    } catch {
      window.location.href = `mailto:${text}`
      return
    }
    window.setTimeout(() => (hint.textContent = '눌러서 복사'), 2200)
  })
}

function records() {
  for (const d of $$<HTMLDetailsElement>('[data-record]')) {
    d.addEventListener('toggle', () => requestAnimationFrame(() => ScrollTrigger.refresh()))
  }
}

export function initChrome(scroller: Scroller, stage: Stage | null) {
  nav()
  menu(scroller)
  chapters()
  hud(stage)
  marquee(scroller)
  copyMail()
  records()
}
