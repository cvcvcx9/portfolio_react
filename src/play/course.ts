import { Color, Vector3, type Scene } from 'three'
import { GATE_H, LanternGate } from './gate'
import { Puffer } from './puffer'

// ── The course: lantern gates standing in the sea, curving ahead of the jelly, with puffers in between ──
type Height = (x: number, z: number) => number

const UP = new Vector3(0, 1, 0)
const SPACING = 26
/** From the fourth gate on, this share of the gaps has a puffer waiting halfway. */
const PUFFER_CHANCE = 0.45
const DIM = new Color(1.1, 1.1, 1.2)
const GRAY = new Color(0.22, 0.22, 0.26)
const FLASH = new Color(3, 3, 3)

export type Gate = {
  look: LanternGate
  /** Middle of the gate at sea level, the way through, and the gate's right-hand side. */
  pos: Vector3
  dir: Vector3
  right: Vector3
  /** The jelly's signed distance to the gate's plane last frame: negative while still before it. */
  side: number
  state: 'live' | 'passed' | 'missed'
  age: number
}

export class Course {
  readonly puffers: Puffer[] = []
  private live: Gate[] = []
  private fading: Gate[] = []
  /** Gates laid since the last reset. */
  private placed = 0
  private endPos = new Vector3()
  private endDir = new Vector3(0, 0, -1)
  private turn = 0
  private rel = new Vector3()
  private paint = new Color()

  constructor(
    private scene: Scene,
    private count: number,
  ) {}

  /** The gate to fly through next. */
  get next(): Gate | undefined {
    return this.live[0]
  }

  /** A point on `gate`'s outline (`u` 0–1) in the world, for sparkles. */
  outline(gate: Gate, u: number) {
    gate.look.root.updateMatrixWorld()
    return gate.look.root.localToWorld(LanternGate.outline(u, new Vector3()))
  }

  /** Lays a new course: the first gate `first` metres straight ahead, then gentle curves. The old gates sink away. */
  reset(from: Vector3, dir: Vector3, first = 18) {
    for (const g of this.live) this.retire(g, 'missed')
    for (const p of this.puffers) p.dispose()
    this.live = []
    this.puffers.length = 0
    this.placed = 0
    this.turn = 0
    this.endDir.set(dir.x, 0, dir.z).normalize()
    this.endPos.set(from.x, 0, from.z).addScaledVector(this.endDir, first)
    this.spawn(0)
    this.extend()
  }

  private spawn(delay: number) {
    const look = new LanternGate()
    const dir = this.endDir.clone()
    const g: Gate = { look, pos: this.endPos.clone(), dir, right: new Vector3().crossVectors(dir, UP), side: -1, state: 'live', age: -delay }
    look.root.position.copy(g.pos)
    look.root.rotation.y = Math.atan2(dir.x, dir.z)
    this.scene.add(look.root)
    this.live.push(g)
    this.placed++
  }

  /** Keeps `count` gates ahead; the curve bends a little more or less at each one. */
  private extend() {
    while (this.live.length < this.count) {
      const prev = this.endPos.clone()
      this.turn = Math.max(-0.3, Math.min(0.3, this.turn * 0.7 + (Math.random() - 0.5) * 0.4))
      this.endDir.applyAxisAngle(UP, this.turn)
      this.endPos.addScaledVector(this.endDir, SPACING + (Math.random() - 0.5) * 6)
      this.spawn(this.live.length * 0.1)
      if (this.placed > 3 && Math.random() < PUFFER_CHANCE) {
        // Roughly halfway along the gap, close to the line between the two gates.
        const at = prev.lerp(this.endPos, 0.4 + Math.random() * 0.25)
        at.addScaledVector(this.live[this.live.length - 1].right, (Math.random() - 0.5) * 2.4)
        this.puffers.push(new Puffer(this.scene, at.x, at.z))
      }
    }
  }

  /** Marks the puffer a press right now would dash onto. */
  lock(target: Puffer | null) {
    for (const p of this.puffers) p.locked = p === target
  }

  private retire(g: Gate, state: 'passed' | 'missed') {
    g.state = state
    g.age = 0
    this.fading.push(g)
  }

  /**
   * Checks the jelly against the next gate. `on.gate` fires as the jelly crosses that gate's plane:
   * through the gate (`pass`) or around it; `on.puff` fires as a puffer blows itself up.
   * `travel` is the jelly's direction; `color` is what the next gate glows in.
   */
  update(
    dt: number,
    t: number,
    jelly: Vector3,
    travel: Vector3,
    color: Color,
    height: Height,
    on: { gate: (pass: boolean, gate: Gate) => void; puff: () => void },
  ) {
    const onGate = on.gate
    const g = this.live[0]
    if (g) {
      const rel = this.rel.subVectors(jelly, g.pos)
      const s = rel.x * g.dir.x + rel.z * g.dir.z
      if (g.side < 0 && s >= 0) {
        const pass = LanternGate.passes(rel.x * g.right.x + rel.z * g.right.z, rel.y)
        this.live.shift()
        this.retire(g, pass ? 'passed' : 'missed')
        onGate(pass, g)
        this.extend()
      } else {
        g.side = s
        // Turned away from the course: it counts as a miss, and a new course starts ahead.
        const dist = Math.hypot(rel.x, rel.z)
        const facing = -(rel.x * travel.x + rel.z * travel.z) / Math.max(dist, 1e-3)
        if ((dist > 12 && facing < 0.26) || dist > SPACING * 3) {
          onGate(false, g)
          this.reset(jelly, travel, SPACING)
        }
      }
    }

    // Puffers left far behind are cleared away.
    for (let i = this.puffers.length - 1; i >= 0; i--) {
      const p = this.puffers[i]
      const behind = (p.x - jelly.x) * travel.x + (p.z - jelly.z) * travel.z < -30
      if (!p.update(dt, t, jelly, height, on.puff) || (p.live && behind)) {
        p.dispose()
        this.puffers.splice(i, 1)
      }
    }

    // New gates rise out of the sea; the next one glows in `color` and breathes, the rest wait dimmed.
    this.live.forEach((gate, i) => {
      gate.age += dt
      const rise = 1 - (1 - Math.min(1, Math.max(0, gate.age / 0.7))) ** 3
      const root = gate.look.root
      root.position.y = (rise - 1) * GATE_H * 1.3
      gate.look.tick(t)
      if (i === 0) {
        gate.look.paint(this.paint.copy(color).multiplyScalar(2.4), rise)
        root.scale.setScalar(1 + Math.sin(t * 6) * 0.025)
      } else {
        gate.look.paint(DIM, rise * 0.5)
        root.scale.setScalar(1)
      }
    })
    // Passed gates flash and widen a little as they vanish; missed ones turn grey and sink.
    this.fading = this.fading.filter((gate) => {
      gate.age += dt
      const root = gate.look.root
      gate.look.tick(t)
      let opacity: number
      if (gate.state === 'passed') {
        // Gone quickly: the camera, high and behind, flies through the gate a moment later.
        const p = gate.age / 0.35
        root.scale.setScalar(1 + p * 0.15)
        opacity = Math.max(0, 1 - p) ** 2
        gate.look.paint(FLASH, opacity)
      } else {
        const p = gate.age / 0.8
        root.position.y = -p * GATE_H * 1.4
        opacity = Math.max(0, 0.6 * (1 - p))
        gate.look.paint(GRAY, opacity)
      }
      if (opacity > 0) return true
      this.scene.remove(root)
      gate.look.dispose()
      return false
    })
  }
}
