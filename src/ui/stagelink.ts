import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Side, Stage } from '../gl/stage'
import type { ShapeName } from '../gl/shapes'
import { env, $, $$ } from './env'

const STEP_COLORS = ['var(--ember)', 'var(--ice)', 'var(--text)', 'var(--acid)']

/**
 * Elements with data-shape drive the particle field. The active one is the last element whose top
 * has crossed the 56% line, so gaps between elements keep the previous shape instead of going blank.
 */
function shapes(stage: Stage | null) {
  let heroActive = true
  const els = $$('[data-shape]')
  let raf = 0
  const resolve = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      const line = window.innerHeight * 0.56
      let active = els[0]
      for (const el of els) {
        if (el.getBoundingClientRect().top > line) break
        active = el
      }
      heroActive = active.classList.contains('hero')
      stage?.setShape(
        active.dataset.shape as ShapeName,
        (active.dataset.side as Side) ?? 'center',
        Number(active.dataset.dim ?? 1),
        Number(active.dataset.dimM ?? 0.4),
      )
    })
  }
  for (const el of els) ScrollTrigger.create({ trigger: el, start: 'top 56%', onEnter: resolve, onLeaveBack: resolve })
  resolve()

  // Hero verbs preview their principle's shape.
  for (const verb of $$('[data-preview]')) {
    const shape = verb.dataset.preview as ShapeName
    const on = () => {
      if (!heroActive) return
      verb.classList.add('is-preview')
      stage?.preview(shape)
    }
    const off = () => {
      verb.classList.remove('is-preview')
      stage?.preview(null)
    }
    verb.addEventListener('pointerenter', on)
    verb.addEventListener('pointerleave', off)
    verb.addEventListener('focus', on)
    verb.addEventListener('blur', off)
  }
}

function stepsIndex() {
  const dots = $$('[data-step-dot]')
  for (const step of $$('[data-step]')) {
    const i = Number(step.dataset.step)
    ScrollTrigger.create({
      trigger: step,
      start: 'top 56%',
      end: 'bottom 56%',
      onToggle: (self) => {
        if (!self.isActive) return
        dots.forEach((d, k) => {
          d.classList.toggle('is-active', k === i)
          d.style.setProperty('--sc', STEP_COLORS[k])
        })
      },
    })
  }
}

/** The agent pipeline list and the 3D knot labels light up together. */
function pipeline(stage: Stage | null) {
  const list = $('[data-pipeline]')
  if (!list) return
  const items = $$('li', list)
  let index = 0
  let timer = 0
  const show = (i: number) => {
    items.forEach((li, k) => li.classList.toggle('is-active', k === i))
    if (stage?.activeShape === 'agent') stage.highlightLabel(i)
  }
  const start = () => {
    if (timer) return
    show(index)
    if (env.reducedMotion) return
    timer = window.setInterval(() => {
      index = (index + 1) % items.length
      show(index)
    }, 2300)
  }
  const stop = () => {
    window.clearInterval(timer)
    timer = 0
    stage?.highlightLabel(-1)
  }
  ScrollTrigger.create({ trigger: list, start: 'top 75%', end: 'bottom 25%', onToggle: (s) => (s.isActive ? start() : stop()) })
  items.forEach((li, k) =>
    li.addEventListener('pointerenter', () => {
      index = k
      show(k)
    }),
  )
}

export function initStageLink(stage: Stage | null) {
  shapes(stage)
  stepsIndex()
  pipeline(stage)
  if (!env.finePointer) document.documentElement.classList.add('no-hover')
}
