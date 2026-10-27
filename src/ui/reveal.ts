import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { env, $, $$ } from './env'

const once = (trigger: Element, start = 'top 86%') => ({ trigger, start, once: true })

/** Hero: lines rise out of their masks, then the lead and the numbers. */
function heroIntro() {
  const lines = $$('.hero__line')
  for (const line of lines) {
    const inner = document.createElement('span')
    inner.className = 'hero__line-inner'
    while (line.firstChild) inner.appendChild(line.firstChild)
    line.appendChild(inner)
  }
  if (env.reducedMotion) return
  const tl = gsap.timeline({ delay: 0.25 })
  tl.from('.hero .kicker', { autoAlpha: 0, y: 12, duration: 0.8, ease: 'power3.out' })
    .from('.hero__line-inner', { yPercent: 112, duration: 1.25, ease: 'expo.out', stagger: 0.11 }, '-=0.5')
    .from('.hero__lead, .hero__hint', { autoAlpha: 0, y: 20, duration: 1, ease: 'power3.out', stagger: 0.1 }, '-=0.75')
    .from('.stats .stat', { autoAlpha: 0, y: 26, duration: 0.9, ease: 'power3.out', stagger: 0.08 }, '-=0.7')
    .from('.scroll-cue', { autoAlpha: 0, duration: 0.8 }, '-=0.4')
}

function splitHeadings() {
  for (const el of $$('[data-split]')) {
    if (env.reducedMotion) continue
    SplitText.create(el, {
      type: 'lines',
      mask: 'lines',
      autoSplit: true,
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 108,
          duration: 1.15,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: once(el, 'top 88%'),
        })
      },
    })
  }
}

function fades() {
  if (env.reducedMotion) return
  for (const el of $$('[data-reveal]')) {
    if (el.closest('.hero')) continue
    gsap.from(el, { autoAlpha: 0, y: 26, duration: 1, ease: 'power3.out', scrollTrigger: once(el) })
  }
  for (const group of $$('[data-reveal-group]')) {
    if (group.closest('.hero')) continue
    gsap.from(group.children, { autoAlpha: 0, y: 22, duration: 0.9, ease: 'power3.out', stagger: 0.07, scrollTrigger: once(group) })
  }
  // Only panels without their own revealing children: a moving parent would shift the children's trigger positions.
  const panels = '.demo, .notes, .features li, .measure, .leverage, .practices li, .fossils, .colophon, .work, .contact__grid > div, .pipeline__list li'
  for (const el of $$(panels)) {
    gsap.from(el, { autoAlpha: 0, y: 40, duration: 1.1, ease: 'power3.out', scrollTrigger: once(el, 'top 92%') })
  }
  for (const num of $$('.chapter__num')) {
    gsap.fromTo(
      num,
      { yPercent: 18 },
      { yPercent: -22, ease: 'none', scrollTrigger: { trigger: num.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } },
    )
  }
}

/** Bars grow when they enter (CSS reads --grow). */
function bars() {
  const items = $$('.bars span, .fp-bars i, .leverage__list li')
  for (const el of items) {
    if (env.reducedMotion) continue
    el.style.setProperty('--grow', '0')
    ScrollTrigger.create({
      trigger: el,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        const delay = Number(el.dataset.delay ?? 0)
        window.setTimeout(() => el.style.setProperty('--grow', '1'), delay)
      },
    })
  }
  $$('.bars span').forEach((el, i) => (el.dataset.delay = String((i % 4) * 120)))
  $$('.leverage__list li').forEach((el, i) => (el.dataset.delay = String(i * 140)))
}

/** The colophon terminal types itself once. */
function colophon() {
  const pre = $('[data-colophon] code')
  if (!pre || env.reducedMotion) return
  const lines = pre.innerHTML.split('\n')
  pre.innerHTML = ''
  ScrollTrigger.create({
    trigger: pre,
    start: 'top 80%',
    once: true,
    onEnter: () => {
      lines.forEach((line, i) => {
        window.setTimeout(() => {
          pre.innerHTML += (i ? '\n' : '') + line
        }, 260 + i * 330)
      })
    },
  })
}

export function initReveals() {
  heroIntro()
  splitHeadings()
  fades()
  bars()
  colophon()
}
