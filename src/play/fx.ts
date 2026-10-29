import {
  Color,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Camera,
  type Scene,
} from 'three'

const UP = new Vector3(0, 1, 0)
const dummy = new Object3D()
const q = new Quaternion()

type Height = (x: number, z: number) => number

// ── Spray: stretched droplets that leave tiny ripples where they fall back ──
export class Droplets {
  private mesh: InstancedMesh
  private items: { p: Vector3; v: Vector3; s: number }[] = []

  constructor(
    scene: Scene,
    private max: number,
  ) {
    this.mesh = new InstancedMesh(
      new SphereGeometry(1, 10, 8),
      new MeshStandardMaterial({ color: '#e9fbff', emissive: new Color('#8fd8ff'), emissiveIntensity: 0.35, roughness: 0.05, metalness: 0 }),
      max,
    )
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  /** `travel` is the horizontal flight direction (zero for a plunge); `power` scales the spray. */
  burst(at: Vector3, travel: Vector3, count: number, power: number) {
    const side = new Vector3().crossVectors(UP, travel)
    const skip = travel.lengthSq() > 0.01
    for (let i = 0; i < count && this.items.length < this.max; i++) {
      const v = new Vector3()
      if (skip && Math.random() < 0.75) {
        // Two sheets thrown sideways and forward, like a skipping stone's wings.
        const s = Math.random() < 0.5 ? -1 : 1
        v.copy(side).multiplyScalar(s * (0.8 + Math.random() * 2.4) * power)
        v.addScaledVector(travel, (0.4 + Math.random() * 1.6) * power)
        v.y = (1.2 + Math.random() * 2.6) * power
      } else {
        const a = Math.random() * Math.PI * 2
        const r = (0.6 + Math.random() * 2.2) * power
        v.set(Math.cos(a) * r, (2 + Math.random() * 3.5) * power, Math.sin(a) * r)
      }
      this.items.push({ p: at.clone().add(new Vector3((Math.random() - 0.5) * 0.4, 0.05, (Math.random() - 0.5) * 0.4)), v, s: 0.025 + Math.random() * 0.045 })
    }
  }

  update(dt: number, height: Height, onLand: (x: number, z: number, size: number) => void) {
    this.items = this.items.filter((d) => {
      d.v.y -= 9.8 * dt
      d.p.addScaledVector(d.v, dt)
      if (d.v.y < 0 && d.p.y < height(d.p.x, d.p.z)) {
        onLand(d.p.x, d.p.z, d.s)
        return false
      }
      return true
    })
    this.items.forEach((d, i) => {
      dummy.position.copy(d.p)
      const speed = d.v.length()
      q.setFromUnitVectors(UP, d.v.clone().divideScalar(speed || 1))
      dummy.quaternion.copy(q)
      dummy.scale.set(d.s, d.s * (1 + speed * 0.12), d.s)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    })
    this.mesh.count = this.items.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ── Confetti for a new best ──
const CONFETTI = ['#ff6fb1', '#c8ff4a', '#6fe3ff', '#ffc24a', '#ffffff'].map((c) => new Color(c))

export class Confetti {
  private mesh: InstancedMesh
  private items: { p: Vector3; v: Vector3; axis: Vector3; angle: number; spin: number; life: number }[] = []

  constructor(
    scene: Scene,
    private max = 180,
  ) {
    this.mesh = new InstancedMesh(new PlaneGeometry(0.07, 0.12), new MeshBasicMaterial({ side: DoubleSide }), max)
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, CONFETTI[i % CONFETTI.length])
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  burst(at: Vector3) {
    for (let i = 0; i < this.max; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 1 + Math.random() * 3
      this.items.push({
        p: at.clone(),
        v: new Vector3(Math.cos(a) * r, 4 + Math.random() * 4, Math.sin(a) * r),
        axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        angle: Math.random() * 6,
        spin: 6 + Math.random() * 10,
        life: 2.2 + Math.random(),
      })
    }
    this.items = this.items.slice(-this.max)
  }

  update(dt: number) {
    this.items = this.items.filter((c) => {
      c.life -= dt
      c.v.y -= 6 * dt
      c.v.multiplyScalar(1 - 1.6 * dt)
      c.p.addScaledVector(c.v, dt)
      c.angle += c.spin * dt
      return c.life > 0
    })
    this.items.forEach((c, i) => {
      dummy.position.copy(c.p)
      dummy.quaternion.setFromAxisAngle(c.axis, c.angle)
      dummy.scale.setScalar(Math.min(1, c.life * 2))
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    })
    this.mesh.count = this.items.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ── Aim preview: dots along the first arc and a ring where it lands ──
export class Trajectory {
  private dots: InstancedMesh
  private ring: Mesh
  private readonly n = 28

  constructor(scene: Scene) {
    const mat = new MeshBasicMaterial({ color: '#c8ff4a', transparent: true, opacity: 0.9, depthWrite: false })
    this.dots = new InstancedMesh(new SphereGeometry(0.045, 8, 6), mat, this.n)
    this.dots.count = 0
    this.dots.frustumCulled = false
    this.ring = new Mesh(new RingGeometry(0.32, 0.4, 48), new MeshBasicMaterial({ color: '#c8ff4a', transparent: true, opacity: 0.85, depthWrite: false }))
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    scene.add(this.dots, this.ring)
  }

  show(points: Vector3[], land: Vector3 | null, t: number) {
    const step = Math.max(1, Math.floor(points.length / this.n))
    let k = 0
    for (let i = 0; i < points.length && k < this.n; i += step, k++) {
      dummy.position.copy(points[i])
      dummy.quaternion.identity()
      dummy.scale.setScalar(1 - (k / this.n) * 0.5)
      dummy.updateMatrix()
      this.dots.setMatrixAt(k, dummy.matrix)
    }
    this.dots.count = k
    this.dots.instanceMatrix.needsUpdate = true
    this.ring.visible = Boolean(land)
    if (land) {
      this.ring.position.copy(land).setY(land.y + 0.03)
      this.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.08)
    }
  }

  hide() {
    this.dots.count = 0
    this.ring.visible = false
  }
}

// ── Floating score text, anchored to points on the water ──
export class Popups {
  private items: { el: HTMLElement; at: Vector3; until: number }[] = []
  private v = new Vector3()

  constructor(
    private root: HTMLElement,
    private camera: Camera,
  ) {}

  add(at: Vector3, text: string, tone: 'skip' | 'total' | 'record', t: number) {
    const el = document.createElement('div')
    el.className = `play__pop is-${tone}`
    const span = document.createElement('span')
    span.textContent = text
    el.appendChild(span)
    this.root.appendChild(el)
    this.items.push({ el, at: at.clone(), until: t + (tone === 'skip' ? 1.1 : 2.2) })
  }

  update(t: number, width: number, height: number) {
    this.items = this.items.filter((p) => {
      if (t > p.until) {
        p.el.remove()
        return false
      }
      this.v.copy(p.at).project(this.camera)
      const x = (this.v.x * 0.5 + 0.5) * width
      const y = (-this.v.y * 0.5 + 0.5) * height
      p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      p.el.style.visibility = this.v.z < 1 ? 'visible' : 'hidden'
      return true
    })
  }
}
