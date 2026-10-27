import { Matrix4, PerspectiveCamera, Vector3 } from 'three'
import type { Anchor } from './shapes'

const TONE: Record<Anchor['tone'], string> = {
  ice: 'var(--ice)',
  ember: 'var(--ember)',
  acid: 'var(--acid)',
  white: 'var(--text)',
}

/** DOM labels pinned to 3D anchors of the active shape. */
export class Labels {
  private els: HTMLElement[] = []
  private anchors: Anchor[] = []
  private showAt = 0
  private visible = false
  private tmp = new Vector3()

  constructor(private root: HTMLElement) {}

  set(anchors: Anchor[], delay: number) {
    this.anchors = anchors
    this.showAt = performance.now() + delay
    while (this.els.length < anchors.length) {
      const el = document.createElement('div')
      el.className = 'glabel'
      this.root.appendChild(el)
      this.els.push(el)
    }
    this.els.forEach((el, i) => {
      el.classList.remove('is-on')
      const a = anchors[i]
      if (a) {
        el.textContent = a.text
        el.style.setProperty('--c', TONE[a.tone])
      }
    })
  }

  setVisible(v: boolean) {
    this.visible = v
  }

  highlight(index: number) {
    this.els.forEach((el, i) => el.classList.toggle('is-hot', i === index))
  }

  update(matrixWorld: Matrix4, camera: PerspectiveCamera, w: number, h: number) {
    const ready = this.visible && performance.now() >= this.showAt
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i]
      const a = this.anchors[i]
      if (!a || !ready) {
        el.classList.remove('is-on')
        continue
      }
      const p = this.tmp.copy(a.pos).applyMatrix4(matrixWorld).project(camera)
      const inView = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05
      const x = (p.x * 0.5 + 0.5) * w
      const y = (-p.y * 0.5 + 0.5) * h
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`
      el.classList.toggle('is-on', inView)
    }
  }
}
