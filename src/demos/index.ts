import { initDeploy } from './deploy'
import { initSync } from './sync'
import { initRetry } from './retry'
import { initFingerprint } from './fingerprint'
import { initOpday } from './opday'
import { initCi } from './ci'
import { initInspector } from './inspector'

const registry: Record<string, (root: HTMLElement) => void> = {
  deploy: initDeploy,
  sync: initSync,
  retry: initRetry,
  fingerprint: initFingerprint,
  opday: initOpday,
  ci: initCi,
  inspector: initInspector,
}

/** Demos initialize the first time they come near the viewport. */
export function initDemos() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        io.unobserve(el)
        const init = registry[el.dataset.demo ?? '']
        try {
          init?.(el)
        } catch (err) {
          console.warn(`[demo:${el.dataset.demo}]`, err)
        }
      }
    },
    { rootMargin: '300px 0px' },
  )
  document.querySelectorAll<HTMLElement>('[data-demo]').forEach((el) => io.observe(el))
}
