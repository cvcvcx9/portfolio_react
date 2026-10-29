import { Color, Mesh, MeshBasicMaterial, TorusGeometry, Vector3, type Scene } from 'three'

// ── The course: glowing arches standing in the sea, curving ahead of the jelly ──
const UP = new Vector3(0, 1, 0)
/** Arch radius. Its centre sits at sea level, so it stands over the water as a half ring. */
export const ARCH_R = 2.6
const SPACING = 26
const DIM = new Color(1.1, 1.1, 1.2)
const GRAY = new Color(0.22, 0.22, 0.26)

export type Arch = {
  mesh: Mesh<TorusGeometry, MeshBasicMaterial>
  /** Centre at sea level, the way through, and the arch's right-hand side. */
  pos: Vector3
  dir: Vector3
  right: Vector3
  /** The jelly's signed distance to the arch's plane last frame: negative while still before it. */
  side: number
  state: 'live' | 'passed' | 'missed'
  age: number
}

export class Course {
  private live: Arch[] = []
  private fading: Arch[] = []
  // A little more than half a ring, so both feet go under the water.
  private geo = new TorusGeometry(ARCH_R, 0.11, 10, 72, Math.PI + 0.6).rotateZ(-0.3)
  private endPos = new Vector3()
  private endDir = new Vector3(0, 0, -1)
  private turn = 0
  private rel = new Vector3()

  constructor(
    private scene: Scene,
    private count: number,
  ) {}

  /** The arch to fly through next. */
  get next(): Arch | undefined {
    return this.live[0]
  }

  /** Lays a new course: the first arch `first` metres straight ahead, then gentle curves. The old arches sink away. */
  reset(from: Vector3, dir: Vector3, first = 18) {
    for (const a of this.live) this.retire(a, 'missed')
    this.live = []
    this.turn = 0
    this.endDir.set(dir.x, 0, dir.z).normalize()
    this.endPos.set(from.x, 0, from.z).addScaledVector(this.endDir, first)
    this.spawn(0)
    this.extend()
  }

  private spawn(delay: number) {
    const mesh = new Mesh(this.geo, new MeshBasicMaterial({ color: DIM.clone(), transparent: true, opacity: 0, depthWrite: false }))
    const dir = this.endDir.clone()
    const a: Arch = { mesh, pos: this.endPos.clone(), dir, right: new Vector3().crossVectors(dir, UP), side: -1, state: 'live', age: -delay }
    mesh.position.copy(a.pos)
    mesh.rotation.y = Math.atan2(dir.x, dir.z)
    this.scene.add(mesh)
    this.live.push(a)
  }

  /** Keeps `count` arches ahead; the curve bends a little more or less at each one. */
  private extend() {
    while (this.live.length < this.count) {
      this.turn = Math.max(-0.3, Math.min(0.3, this.turn * 0.7 + (Math.random() - 0.5) * 0.4))
      this.endDir.applyAxisAngle(UP, this.turn)
      this.endPos.addScaledVector(this.endDir, SPACING + (Math.random() - 0.5) * 6)
      this.spawn(this.live.length * 0.1)
    }
  }

  private retire(a: Arch, state: 'passed' | 'missed') {
    a.state = state
    a.age = 0
    this.fading.push(a)
  }

  /**
   * Checks the jelly against the next arch. `onGate` fires as the jelly crosses that arch's plane:
   * through the arch (`pass`) or around it. `travel` is the jelly's direction; `color` is what the next arch glows in.
   */
  update(dt: number, t: number, jelly: Vector3, travel: Vector3, color: Color, onGate: (pass: boolean, arch: Arch) => void) {
    const a = this.live[0]
    if (a) {
      const rel = this.rel.subVectors(jelly, a.pos)
      const s = rel.x * a.dir.x + rel.z * a.dir.z
      if (a.side < 0 && s >= 0) {
        const lat = rel.x * a.right.x + rel.z * a.right.z
        const pass = Math.hypot(lat, rel.y) < ARCH_R - 0.25
        this.live.shift()
        this.retire(a, pass ? 'passed' : 'missed')
        onGate(pass, a)
        this.extend()
      } else {
        a.side = s
        // Turned away from the course: it counts as a miss, and a new course starts ahead.
        const dist = Math.hypot(rel.x, rel.z)
        const facing = -(rel.x * travel.x + rel.z * travel.z) / Math.max(dist, 1e-3)
        if ((dist > 12 && facing < 0.26) || dist > SPACING * 3) {
          onGate(false, a)
          this.reset(jelly, travel, SPACING)
        }
      }
    }

    // New arches rise out of the sea; the next one glows in `color` and breathes, the rest wait dimmed.
    this.live.forEach((arch, i) => {
      arch.age += dt
      const rise = 1 - (1 - Math.min(1, Math.max(0, arch.age / 0.7))) ** 3
      arch.mesh.position.y = (rise - 1) * ARCH_R * 1.3
      const m = arch.mesh.material
      if (i === 0) {
        m.color.copy(color).multiplyScalar(2.4)
        m.opacity = rise
        arch.mesh.scale.setScalar(1 + Math.sin(t * 6) * 0.025)
      } else {
        m.color.copy(DIM)
        m.opacity = rise * 0.5
        arch.mesh.scale.setScalar(1)
      }
    })
    // Passed arches flash and widen as they vanish; missed ones turn grey and sink.
    this.fading = this.fading.filter((arch) => {
      arch.age += dt
      const m = arch.mesh.material
      if (arch.state === 'passed') {
        const p = arch.age / 0.35
        arch.mesh.scale.setScalar(1 + p * 0.4)
        m.color.setRGB(3, 3, 3)
        m.opacity = Math.max(0, 1 - p)
      } else {
        const p = arch.age / 0.8
        arch.mesh.position.y = -p * ARCH_R * 1.4
        m.color.copy(GRAY)
        m.opacity = Math.max(0, 0.6 * (1 - p))
      }
      if (m.opacity > 0) return true
      this.scene.remove(arch.mesh)
      m.dispose()
      return false
    })
  }
}
