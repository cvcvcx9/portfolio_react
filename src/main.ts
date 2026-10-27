import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource-variable/jetbrains-mono'
import 'lenis/dist/lenis.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/sections.css'
import './styles/demos.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { Stage } from './gl/stage'
import { env, $ } from './ui/env'
import { initScroll } from './ui/scroll'
import { initReveals } from './ui/reveal'
import { initChrome } from './ui/chrome'
import { initCursor } from './ui/cursor'
import { initStageLink } from './ui/stagelink'
import { initDemos } from './demos'

gsap.registerPlugin(ScrollTrigger, SplitText)

function createStage(): Stage | null {
  const canvas = $<HTMLCanvasElement>('#stage')
  const labelsRoot = $('.labels')
  if (!canvas || !labelsRoot) return null
  try {
    const stage = new Stage({ canvas, labelsRoot, reducedMotion: env.reducedMotion, lowPower: env.lowPower })
    canvas.addEventListener('webglcontextlost', () => document.documentElement.classList.add('no-webgl'))
    return stage
  } catch (err) {
    console.warn('[stage] WebGL disabled:', err)
    document.documentElement.classList.add('no-webgl')
    return null
  }
}

function boot() {
  const scroller = initScroll()
  const stage = createStage()

  if (stage) {
    gsap.ticker.add((_time, deltaMs) => {
      stage.setScrollVelocity(scroller.velocity())
      stage.update(deltaMs / 1000)
    })
    window.addEventListener('pointermove', (e) => stage.setPointer(e.clientX, e.clientY), { passive: true })
    let lastWidth = window.innerWidth
    let raf = 0
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Mobile toolbars change only the height; the canvas uses 100lvh, so skip those.
        if (env.lowPower && window.innerWidth === lastWidth) return
        lastWidth = window.innerWidth
        stage.resize()
      })
    })
  }

  initStageLink(stage)
  initReveals()
  initChrome(scroller, stage)
  initCursor()
  initDemos()

  document.fonts?.ready.then(() => ScrollTrigger.refresh())
  window.addEventListener('load', () => {
    ScrollTrigger.refresh()
    // late font subsets and SplitText re-splits can still shift layout
    window.setTimeout(() => ScrollTrigger.refresh(), 1200)
  })
}

boot()
