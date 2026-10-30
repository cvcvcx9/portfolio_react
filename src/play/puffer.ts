import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'

// ── Spiky puffers floating between the gates: dash onto one to pop it, bump into one and it hurts ──
type Height = (x: number, z: number) => number

const UP = new Vector3(0, 1, 0)
const dummy = new Object3D()
const INK = new MeshBasicMaterial({ color: '#1d0a16' })
const SHINE = new MeshBasicMaterial({ color: '#ffffff' })
const SPIKE_MAT = new MeshStandardMaterial({ color: '#fff0c8', roughness: 0.6 })
const FIN_MAT = new MeshStandardMaterial({ color: '#ff9a2e', roughness: 0.5 })
const BALL = new SphereGeometry(1, 14, 10)
const SPIKE = new ConeGeometry(0.07, 0.34, 6).translate(0, 0.17, 0)
const BROW = new BoxGeometry(0.34, 0.07, 0.07)
// Wide end at the back, tip against the body; flattened sideways like a fish tail.
const TAIL = new ConeGeometry(0.3, 0.42, 10).rotateX(Math.PI / 2)
// Lock-on marker: four corner brackets around the target, one unit from the middle.
const RETICLE = new BufferGeometry()
{
  const v: number[] = []
  const rect = (x0: number, y0: number, x1: number, y1: number) => v.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0)
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      rect(Math.min(sx * 0.45, sx), Math.min(sy * 0.88, sy), Math.max(sx * 0.45, sx), Math.max(sy * 0.88, sy))
      rect(Math.min(sx * 0.88, sx), Math.min(sy * 0.45, sy), Math.max(sx * 0.88, sx), Math.max(sy * 0.45, sy))
    }
  }
  RETICLE.setAttribute('position', new Float32BufferAttribute(v, 3))
}

// Orange back, cream belly.
const BODY = new SphereGeometry(1, 30, 22)
{
  const pos = BODY.getAttribute('position')
  const back = new Color('#ffa23a')
  const belly = new Color('#fff1cf')
  const c = new Color()
  const colors: number[] = []
  for (let i = 0; i < pos.count; i++) {
    c.copy(belly).lerp(back, Math.min(1, Math.max(0, (pos.getY(i) + 0.35) / 0.6)))
    colors.push(c.r, c.g, c.b)
  }
  BODY.setAttribute('color', new Float32BufferAttribute(colors, 3))
}

// Spikes all over, except where the face is.
const SPIKE_DIRS: Vector3[] = []
for (let i = 0; i < 44; i++) {
  const y = 1 - ((i + 0.5) / 44) * 2
  const r = Math.sqrt(1 - y * y)
  const n = new Vector3(Math.cos(i * 2.39996) * r, y, Math.sin(i * 2.39996) * r)
  if (n.z > 0.5 && n.y > -0.55 && n.y < 0.7) continue
  SPIKE_DIRS.push(n)
}

/** Body radius when calm and when blown up. */
const CALM_R = 0.42
const PUFFED_R = 0.72
/** It blows itself up once the jelly is this close. */
const WAKE_DIST = 16

export class Puffer {
  readonly group = new Group()
  /** Body centre in the world, and the current body radius. */
  readonly center = new Vector3()
  radius = CALM_R
  state: 'calm' | 'puffed' | 'popped' | 'knocked' = 'calm'
  /** Set by the game while a slam started now would land on this puffer. */
  locked = false
  private body = new Group()
  private bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: new Color('#ff5a1f'), emissiveIntensity: 0.12 })
  private spikes = new InstancedMesh(SPIKE, SPIKE_MAT, SPIKE_DIRS.length)
  // Lock-on brackets: always face the camera and draw over everything.
  private ring = new Mesh(
    RETICLE,
    new MeshBasicMaterial({
      color: new Color(2.6, 0.35, 0.3),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    }),
  )
  private lockT = 0
  private spin = 0
  private fins: Mesh[] = []
  private tail = new Mesh(TAIL, FIN_MAT)
  private inflate = 0
  private inflateV = 0
  private spikesAt = -1
  private age = 0
  private vel = new Vector3()
  private yaw = Math.random() * Math.PI * 2
  private phase = Math.random() * Math.PI * 2

  constructor(
    private scene: Scene,
    readonly x: number,
    readonly z: number,
  ) {
    // In place from the start: the jelly checks for touches before this puffer's first update.
    this.center.set(x, CALM_R, z)
    const part = (geo: BoxGeometry | SphereGeometry, mat: MeshBasicMaterial, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
      const m = new Mesh(geo, mat)
      m.position.set(x, y, z)
      m.scale.set(sx, sy, sz)
      this.body.add(m)
      return m
    }
    this.body.add(new Mesh(BODY, this.bodyMat), this.spikes)
    // An angry little face: round eyes under slanted brows, a pouting mouth.
    for (const side of [-1, 1]) {
      part(BALL, INK, side * 0.36, 0.24, 0.86, 0.17)
      part(BALL, SHINE, side * 0.36 + 0.05, 0.3, 0.99, 0.06)
      part(BROW, INK, side * 0.34, 0.5, 0.82, 1).rotation.z = side * 0.45
      const fin = new Mesh(BALL, FIN_MAT)
      fin.position.set(side * 0.96, -0.12, 0.05)
      fin.scale.set(0.06, 0.2, 0.3)
      this.fins.push(fin)
      this.body.add(fin)
    }
    part(BALL, INK, 0, -0.18, 0.96, 0.13, 0.09, 0.05)
    this.tail.position.set(0, 0, -1.12)
    this.tail.scale.set(0.3, 1, 1)
    this.body.add(this.tail)
    this.group.add(this.body)
    this.ring.visible = false
    this.ring.renderOrder = 5
    this.ring.onBeforeRender = (_renderer, _scene, camera) => {
      this.ring.quaternion.copy(camera.quaternion)
      this.ring.rotateZ(this.spin)
      // Never smaller on screen than brackets 7% of the distance across, so far puffers still read as locked.
      const least = camera.position.distanceTo(this.ring.position) * 0.07
      if (this.ring.scale.x < least) this.ring.scale.setScalar(least)
      this.ring.updateMatrixWorld()
    }
    scene.add(this.group, this.ring)
  }

  get live() {
    return this.state === 'calm' || this.state === 'puffed'
  }

  pop() {
    this.state = 'popped'
    this.age = 0
  }

  /** Sent flying along `dir` after the jelly runs into it. */
  knock(dir: Vector3) {
    this.state = 'knocked'
    this.age = 0
    this.vel.set(dir.x * 7, 5, dir.z * 7)
  }

  /** Returns false once the puffer is gone and can be removed. `onPuff` fires as it blows itself up. */
  update(dt: number, t: number, jelly: Vector3, height: Height, onPuff: () => void) {
    this.age += dt
    const s = height(this.x, this.z)
    this.ring.visible = false
    if (this.state === 'knocked') {
      this.vel.y -= 14 * dt
      this.center.addScaledVector(this.vel, dt)
      this.group.position.copy(this.center)
      this.group.rotation.x += dt * 9
      this.group.rotation.z += dt * 6
      return this.center.y > s - 2
    }
    if (this.state === 'popped') {
      // Swells for an instant, then is gone.
      const p = this.age / 0.16
      this.body.scale.setScalar(this.radius * (p < 0.35 ? 1 + p : Math.max(0, 1.35 * (1 - (p - 0.35) / 0.65))))
      return p < 1
    }

    const dx = jelly.x - this.x
    const dz = jelly.z - this.z
    const dist = Math.hypot(dx, dz)
    if (this.state === 'calm' && dist < WAKE_DIST) {
      this.state = 'puffed'
      onPuff()
    }
    this.inflateV += ((this.state === 'puffed' ? 1 : 0) - this.inflate) * 170 * dt - this.inflateV * 11 * dt
    this.inflate += this.inflateV * dt
    const k = Math.max(0, this.inflate)
    this.radius = CALM_R + (PUFFED_R - CALM_R) * k
    this.center.set(this.x, s + 0.12 + 0.3 * k + Math.sin(t * 2.3 + this.phase) * 0.04, this.z)
    // Turns to glare at the jelly and rocks on the swell.
    const want = Math.atan2(dx, dz)
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 4)
    this.group.position.copy(this.center)
    this.group.rotation.set(Math.sin(t * 1.7 + this.phase) * 0.08, this.yaw, Math.cos(t * 1.4 + this.phase) * 0.08)
    this.body.scale.setScalar(this.radius)
    const ext = 0.25 + 0.75 * Math.min(1.2, k)
    if (Math.abs(ext - this.spikesAt) > 0.01) {
      this.spikesAt = ext
      SPIKE_DIRS.forEach((n, i) => {
        dummy.position.copy(n).multiplyScalar(0.92)
        dummy.quaternion.setFromUnitVectors(UP, n)
        dummy.scale.set(1, ext, 1)
        dummy.updateMatrix()
        this.spikes.setMatrixAt(i, dummy.matrix)
      })
      this.spikes.instanceMatrix.needsUpdate = true
    }
    this.fins.forEach((f, i) => (f.rotation.z = Math.sin(t * 14 + i * Math.PI) * 0.5))
    this.tail.rotation.y = Math.sin(t * 9 + this.phase) * 0.35

    // Locked on: red brackets swing in from wide and turned, snap tight around it, and the body flushes red.
    const pulse = 0.5 + 0.5 * Math.sin(t * 16)
    this.lockT = this.locked ? Math.min(1, this.lockT + dt / 0.15) : 0
    const snap = 1 - (1 - this.lockT) ** 3
    this.spin = ((1 - snap) * Math.PI) / 2
    this.ring.visible = this.locked
    this.ring.position.copy(this.center)
    this.ring.scale.setScalar(this.radius * (1.5 + (1 - snap) * 1.8 + (this.lockT >= 1 ? pulse * 0.1 : 0)))
    this.ring.material.opacity = snap
    this.bodyMat.emissiveIntensity = this.locked ? 0.6 + pulse * 0.6 : 0.12
    return true
  }

  dispose() {
    this.scene.remove(this.group, this.ring)
    this.bodyMat.dispose()
    this.ring.material.dispose()
    this.spikes.dispose()
  }
}
