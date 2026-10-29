import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type Scene,
} from 'three'
import { Effect, EffectAttribute } from 'postprocessing'

const UP = new Vector3(0, 1, 0)
const dummy = new Object3D()
const q = new Quaternion()
const WHITE = new Color(1, 1, 1)

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

  /** `travel` is the horizontal flight direction (zero for a plunge); `power` scales the spray, `size` the drops. */
  burst(at: Vector3, travel: Vector3, count: number, power: number, size = 1) {
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
      this.items.push({ p: at.clone().add(new Vector3((Math.random() - 0.5) * 0.4, 0.05, (Math.random() - 0.5) * 0.4)), v, s: (0.025 + Math.random() * 0.045) * size })
    }
  }

  /** `eye` is the camera position: spray the camera flies through would cover the screen, so it is hidden. */
  update(dt: number, height: Height, onLand: (x: number, z: number, size: number) => void, eye: Vector3) {
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
      const s = d.s * Math.min(1, Math.max(0, (d.p.distanceTo(eye) - 2) / 4))
      dummy.scale.set(s, s * (1 + speed * 0.12), s)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    })
    this.mesh.count = this.items.length
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ── Foam flecks resting on the water: at speed they stretch into streaks ──
export class Flecks {
  private mesh: InstancedMesh
  private pts: Vector3[] = []

  constructor(
    scene: Scene,
    private n: number,
    private radius = 26,
  ) {
    this.mesh = new InstancedMesh(
      new SphereGeometry(1, 6, 4),
      new MeshBasicMaterial({ color: '#d4f1ff', transparent: true, opacity: 0.5, depthWrite: false }),
      n,
    )
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  /** `eye` is the camera position: flecks right under it would fill the screen, so they are hidden. */
  update(center: Vector3, eye: Vector3, heading: Vector3, speed: number, height: Height) {
    const r = this.radius
    const yaw = Math.atan2(heading.x, heading.z)
    const stretch = 1 + Math.min(speed * 0.16, 7)
    ;(this.mesh.material as MeshBasicMaterial).opacity = 0.45 + Math.min(speed * 0.008, 0.3)
    for (let i = 0; i < this.n; i++) {
      let p = this.pts[i]
      if (!p) {
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random()) * r
        p = this.pts[i] = new Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d)
      }
      if ((p.x - center.x) ** 2 + (p.z - center.z) ** 2 > r * r) {
        // Respawn on the far side, in a cone ahead of the travel direction.
        const a = yaw + (Math.random() - 0.5) * 2.2
        const d = r * (0.75 + Math.random() * 0.22)
        p.set(center.x + Math.sin(a) * d, 0, center.z + Math.cos(a) * d)
      }
      p.y = height(p.x, p.z) + 0.02
      dummy.position.copy(p)
      dummy.quaternion.setFromAxisAngle(UP, yaw)
      const near = Math.hypot(p.x - eye.x, p.z - eye.z)
      const s = (0.03 + (i % 7) * 0.008) * Math.min(1, Math.max(0, (near - 4) / 4))
      dummy.scale.set(s, s * 0.3, s * stretch)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}

// ── Floating lanterns: fixed marks on the open sea. Rushing past them is what makes the speed visible ──
const LANTERN_H = 0.4
/** Lanterns keep at least this far to either side of the jelly's path. */
const LANTERN_LANE = 3.4

export class Lanterns {
  private body: InstancedMesh
  private glow: InstancedMesh
  private items: { p: Vector3; phase: number; ahead: number }[] = []
  private right = new Vector3()
  private toEye = new Vector3()

  constructor(
    scene: Scene,
    private n: number,
    private radius = 56,
  ) {
    // A square paper box on a wooden base, lit from inside: paper sides, an open glowing top, bright enough to bloom.
    const geo = new CylinderGeometry(0.24, 0.24, LANTERN_H, 4, 6)
    const pos = geo.getAttribute('position')
    const nrm = geo.getAttribute('normal')
    const paper = new Color('#ffd9a0')
    const frame = new Color('#c0682a')
    const wood = new Color('#2a1206')
    const inside = new Color('#fff1d6')
    const c = new Color()
    const colors: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / (LANTERN_H / 2)
      if (nrm.getY(i) > 0.5) c.copy(inside)
      else if (nrm.getY(i) < -0.5 || y < -0.9) c.copy(wood)
      else c.copy(paper).lerp(frame, Math.max(0, (y - 0.6) / 0.4))
      colors.push(c.r, c.g, c.b)
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    this.body = new InstancedMesh(geo, new MeshBasicMaterial({ vertexColors: true, color: new Color(2.6, 1.7, 1) }), n)

    // Its light on the water, stretched toward the viewer like reflections at dusk.
    this.glow = new InstancedMesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: new Color(1, 0.5, 0.16) } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            vec2 d = (vUv - 0.5) * 2.0;
            gl_FragColor = vec4(uColor, exp(-(d.x * d.x * 6.0 + d.y * d.y * 2.5)) * 0.55);
          }`,
      }),
      n,
    )
    for (const m of [this.body, this.glow]) {
      m.frustumCulled = false
      scene.add(m)
    }
  }

  /**
   * `center` is the middle of the window kept around the jelly; `eye` is the camera.
   * `onPass` fires as a lantern goes by the camera: `side` is -1 (left) or 1 (right), `near` is 0–1.
   */
  update(t: number, center: Vector3, eye: Vector3, heading: Vector3, jelly: Vector3, height: Height, onPass: (side: number, near: number) => void) {
    const r = this.radius
    this.right.crossVectors(heading, UP)
    for (let i = 0; i < this.n; i++) {
      let it = this.items[i]
      if (!it) {
        const a = Math.random() * Math.PI * 2
        const d = Math.sqrt(Math.random()) * r
        const p = new Vector3(center.x + Math.cos(a) * d, 0, center.z + Math.sin(a) * d)
        const lat = (p.x - jelly.x) * this.right.x + (p.z - jelly.z) * this.right.z
        if (Math.abs(lat) < LANTERN_LANE) p.addScaledVector(this.right, (Math.sign(lat) || 1) * LANTERN_LANE - lat)
        it = this.items[i] = { p, phase: Math.random() * Math.PI * 2, ahead: 0 }
      }
      const p = it.p
      if ((p.x - center.x) ** 2 + (p.z - center.z) ** 2 > r * r) {
        // Respawn far ahead, a little to either side of the path.
        const lat = (Math.random() < 0.5 ? -1 : 1) * (LANTERN_LANE + Math.random() ** 2 * 22)
        const along = Math.sqrt(r * r * 0.92 - lat * lat) * (0.85 + Math.random() * 0.13)
        p.copy(center).addScaledVector(heading, along).addScaledVector(this.right, lat)
        it.ahead = 1
      }
      const s = height(p.x, p.z)
      // The jelly nudges lanterns aside instead of sitting inside one.
      const dx = p.x - jelly.x
      const dz = p.z - jelly.z
      const dj = Math.hypot(dx, dz)
      if (dj < 1.2 && dj > 1e-3 && jelly.y - s < 1) {
        p.x += (dx / dj) * (1.2 - dj)
        p.z += (dz / dj) * (1.2 - dj)
      }

      const ahead = (p.x - eye.x) * heading.x + (p.z - eye.z) * heading.z
      if (it.ahead > 0 && ahead <= 0) {
        const side = (p.x - eye.x) * this.right.x + (p.z - eye.z) * this.right.z
        if (Math.abs(side) < 8) onPass(Math.sign(side), 1 - Math.abs(side) / 8)
      }
      it.ahead = ahead

      // Fade in at the far edge and out right next to the camera.
      const far = Math.min(1, Math.max(0, (r - Math.hypot(p.x - center.x, p.z - center.z)) / (r * 0.18)))
      const near = Math.min(1, Math.max(0, (Math.hypot(p.x - eye.x, p.z - eye.z) - 1.5) / 2.5))
      const k = far * near
      dummy.position.set(p.x, s + LANTERN_H * 0.32 + Math.sin(t * 1.6 + it.phase) * 0.035, p.z)
      dummy.rotation.set(Math.sin(t * 1.3 + it.phase) * 0.08, it.phase, Math.cos(t * 1.1 + it.phase) * 0.08)
      dummy.scale.setScalar(k)
      dummy.updateMatrix()
      this.body.setMatrixAt(i, dummy.matrix)

      const len = 2.4
      this.toEye.set(eye.x - p.x, 0, eye.z - p.z).normalize()
      dummy.position.set(p.x + this.toEye.x * len * 0.42, s + 0.06, p.z + this.toEye.z * len * 0.42)
      dummy.rotation.set(0, Math.atan2(this.toEye.x, this.toEye.z), 0)
      dummy.scale.set(0.9 * k, 1, len * k)
      dummy.updateMatrix()
      this.glow.setMatrixAt(i, dummy.matrix)
    }
    this.body.instanceMatrix.needsUpdate = true
    this.glow.instanceMatrix.needsUpdate = true
  }
}

// ── Sparkles: bits flying off each arch flown through, and a short trail while the boost lasts ──
export class Sparks {
  private mesh: InstancedMesh
  private items: { p: Vector3; v: Vector3; life: number; total: number; s: number; color: Color }[] = []

  constructor(
    scene: Scene,
    private max: number,
  ) {
    this.mesh = new InstancedMesh(new OctahedronGeometry(1, 0), new MeshBasicMaterial({ color: new Color(2.4, 2.4, 2.4) }), max)
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, WHITE)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  /** Throws `count` sparkles out from `at` at up to `speed` m/s; they last about `life` seconds. */
  burst(at: Vector3, color: Color, count: number, speed: number, life = 0.6, size = 1) {
    for (let i = 0; i < count && this.items.length < this.max; i++) {
      const v = new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize()
      const l = life * (0.6 + Math.random() * 0.4)
      const s = (0.035 + Math.random() * 0.05) * size
      this.items.push({ p: at.clone(), v: v.multiplyScalar(speed * (0.4 + Math.random() * 0.6)), life: l, total: l, s, color })
    }
  }

  /** `eye` is the camera position: sparkles right in front of it are hidden. */
  update(dt: number, eye: Vector3) {
    this.items = this.items.filter((s) => {
      s.life -= dt
      return s.life > 0
    })
    this.items.forEach((s, i) => {
      s.v.multiplyScalar(Math.exp(-dt * 3))
      s.p.addScaledVector(s.v, dt)
      dummy.position.copy(s.p)
      dummy.rotation.set(s.life * 9, s.life * 7, 0)
      dummy.scale.setScalar(s.s * (s.life / s.total) * Math.min(1, Math.max(0, (s.p.distanceTo(eye) - 1.5) / 2.5)))
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
      this.mesh.setColorAt(i, s.color)
    })
    this.mesh.count = this.items.length
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor!.needsUpdate = true
  }
}

// ── A ring around the jelly: small at the top of each arc (the cue to slam), huge when a faster tier is reached ──
export class Pulse {
  private mesh: Mesh
  private age = 9
  private grow: number
  private life: number

  /** `grow` is how much the ring widens over `life` seconds; an `overlay` ring glows over everything. */
  constructor(scene: Scene, color: string, { grow = 0.9, life = 0.38, width = 0.08, overlay = false } = {}) {
    this.grow = grow
    this.life = life
    this.mesh = new Mesh(
      new RingGeometry(0.7 - width / 2, 0.7 + width / 2, 96),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: !overlay,
        blending: overlay ? AdditiveBlending : NormalBlending,
      }),
    )
    this.mesh.renderOrder = overlay ? 4 : 3
    this.mesh.visible = false
    scene.add(this.mesh)
  }

  fire(color?: Color) {
    if (color) (this.mesh.material as MeshBasicMaterial).color.copy(color)
    this.age = 0
  }

  update(dt: number, at: Vector3, camera: Camera) {
    this.age += dt
    const p = Math.min(this.age / this.life, 1)
    this.mesh.visible = p < 1
    if (!this.mesh.visible) return
    this.mesh.position.copy(at)
    this.mesh.quaternion.copy(camera.quaternion)
    this.mesh.scale.setScalar(1 + (1 - (1 - p) ** 3) * this.grow)
    ;(this.mesh.material as MeshBasicMaterial).opacity = 0.8 * (1 - p)
  }
}

// ── Speed lines: thin streaks rushing out from the vanishing point, stronger with speed ──
export class SpeedLines {
  private ctx: CanvasRenderingContext2D
  private lines = Array.from({ length: 72 }, () => ({
    a: Math.random() * Math.PI * 2,
    r: Math.random(),
    len: 0.3 + Math.random() * 0.7,
    w: 0.6 + Math.random() * 1.1,
  }))
  private drawn = false

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  /** `amount` 0–1; (cx, cy) is the vanishing point in CSS pixels; `color` is a CSS colour. */
  update(dt: number, amount: number, cx: number, cy: number, color: string) {
    const dpr = Math.min(window.devicePixelRatio, 1.5)
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr)
      this.canvas.height = Math.round(h * dpr)
    }
    const g = this.ctx
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (amount < 0.01) {
      if (this.drawn) g.clearRect(0, 0, w, h)
      this.drawn = false
      return
    }
    g.clearRect(0, 0, w, h)
    const reach = Math.hypot(w, h) * 0.6
    g.lineCap = 'round'
    g.strokeStyle = color
    for (const l of this.lines) {
      l.r += dt * (0.5 + amount * 2.4) * (0.6 + l.len * 0.6)
      if (l.r > 1) {
        l.r = 0
        l.a = Math.random() * Math.PI * 2
      }
      const r0 = reach * (0.36 + l.r * 0.64)
      const r1 = r0 + reach * 0.05 * l.len * (0.5 + amount * 2.2)
      g.globalAlpha = amount * 0.42 * Math.sin(l.r * Math.PI)
      g.lineWidth = l.w
      g.beginPath()
      g.moveTo(cx + Math.cos(l.a) * r0, cy + Math.sin(l.a) * r0)
      g.lineTo(cx + Math.cos(l.a) * r1, cy + Math.sin(l.a) * r1)
      g.stroke()
    }
    g.globalAlpha = 1
    this.drawn = true
  }
}

// ── Zoom blur: at speed the screen edges smear outward from the point you are racing toward ──
const ZOOM_FRAG = /* glsl */ `
uniform vec2 center;
uniform float strength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - center;
  // The middle of the screen, where the jelly is, stays sharp.
  float s = strength * smoothstep(0.16, 0.8, length(d * vec2(aspect, 1.0)));
  if (s < 0.0005) {
    outputColor = inputColor;
    return;
  }
  vec4 sum = inputColor;
  for (int i = 1; i < SAMPLES; i++) {
    sum += texture2D(inputBuffer, uv - d * s * float(i) / float(SAMPLES - 1));
  }
  outputColor = sum / float(SAMPLES);
}`

export class ZoomBlurEffect extends Effect {
  constructor(samples: number) {
    super('ZoomBlurEffect', ZOOM_FRAG, {
      attributes: EffectAttribute.CONVOLUTION,
      defines: new Map([['SAMPLES', String(samples)]]),
      uniforms: new Map<string, Uniform>([
        ['center', new Uniform(new Vector2(0.5, 0.5))],
        ['strength', new Uniform(0)],
      ]),
    })
  }

  /** Screen point (0–1, origin at the bottom left) the blur streams out from. */
  get center(): Vector2 {
    return this.uniforms.get('center')!.value as Vector2
  }

  get strength(): number {
    return this.uniforms.get('strength')!.value as number
  }

  set strength(value: number) {
    this.uniforms.get('strength')!.value = value
  }
}

// ── "완벽!" over the jelly; a new one replaces the old so they never pile up ──
export class Callout {
  private item: { el: HTMLElement; at: Vector3; offset: Vector3; until: number } | null = null
  private v = new Vector3()

  constructor(
    private root: HTMLElement,
    private camera: Camera,
  ) {}

  /** Pass a live vector (e.g. the jelly position) to keep the text attached to something moving. */
  show(at: Vector3, text: string, t: number, offset = new Vector3()) {
    this.item?.el.remove()
    const el = document.createElement('div')
    el.className = 'play__pop'
    const span = document.createElement('span')
    span.textContent = text
    el.appendChild(span)
    this.root.appendChild(el)
    this.item = { el, at, offset, until: t + 1.1 }
  }

  update(t: number, width: number, height: number) {
    const p = this.item
    if (!p) return
    if (t > p.until) {
      p.el.remove()
      this.item = null
      return
    }
    this.v.copy(p.at).add(p.offset).project(this.camera)
    const x = (this.v.x * 0.5 + 0.5) * width
    const y = (-this.v.y * 0.5 + 0.5) * height
    p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    p.el.style.visibility = this.v.z < 1 ? 'visible' : 'hidden'
  }
}
