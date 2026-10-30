import {
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type Material,
} from 'three'

export type Expression = 'idle' | 'hover' | 'charge' | 'fly' | 'skip' | 'dizzy' | 'happy' | 'swim'

export const RADIUS = 0.6
/** Distance from the centre to the flattened bottom. */
export const BOTTOM = RADIUS * 0.78
const IMPACTS = 4

/**
 * Soft-body look without a solver: volume-preserving squash along an axis, a lag field that makes the
 * top trail behind accelerations, and surface waves that run out from each impact point.
 */
const DEFORM_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSqAxis;
uniform float uSq;
uniform vec3 uLag;
uniform float uPress;
uniform vec4 uImp[${IMPACTS}];
uniform float uImpAmp[${IMPACTS}];
uniform float uRadius;

vec3 jellyDeform(vec3 p, vec3 n, out vec3 nOut) {
  float a = 1.0 + uSq;
  float b = inversesqrt(max(a, 0.25));
  mat3 A = outerProduct(uSqAxis, uSqAxis);
  mat3 S = mat3(b) + A * (a - b);
  mat3 Sinv = mat3(1.0 / b) + A * (1.0 / a - 1.0 / b);

  vec3 q = p;
  q.y *= 1.0 - uPress * 0.3;
  q.xz *= 1.0 + uPress * 0.15;

  vec3 dir = normalize(p);
  float disp = sin(uTime * 2.3) * 0.012 + sin(uTime * 3.7 + p.x * 4.0 + p.z * 3.0) * 0.006;
  for (int i = 0; i < ${IMPACTS}; i++) {
    float age = uTime - uImp[i].w;
    if (age < 0.0 || age > 2.5) continue;
    float ang = acos(clamp(dot(dir, uImp[i].xyz), -1.0, 1.0));
    float front = 1.0 - smoothstep(age * 9.0, age * 9.0 + 1.0, ang);
    disp += uImpAmp[i] * sin(ang * 7.0 - age * 24.0) * exp(-age * 3.4) * smoothstep(0.0, 0.04, age) * front;
  }
  q += n * disp * uRadius;
  q = S * q;
  float f = clamp((p.y / uRadius + 1.0) * 0.5, 0.0, 1.0);
  q += uLag * f * f;
  nOut = normalize(Sinv * n);
  return q;
}`

/** `lit` materials need the deformed normal before the position; unlit ones only the position. */
function deformable(mat: Material, uniforms: Record<string, { value: unknown }>, key: string, lit: boolean) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    let vs = shader.vertexShader.replace('#include <common>', `#include <common>\n${DEFORM_GLSL}`)
    vs = lit
      ? vs
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal;\nvec3 jellyPos = jellyDeform(position, normal, objectNormal);')
          .replace('#include <begin_vertex>', 'vec3 transformed = jellyPos;')
      : vs.replace('#include <begin_vertex>', 'vec3 jellyN;\nvec3 transformed = jellyDeform(position, normal, jellyN);')
    shader.vertexShader = vs
  }
  mat.customProgramCacheKey = () => key
}

/** An ellipsoid with a softly flattened belly. */
function bodyGeometry(r: number) {
  const g = new SphereGeometry(r, 96, 64)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    if (y < 0) p.setY(i, y * 0.78)
  }
  g.computeVertexNormals()
  return g
}

const tmpQ = new Quaternion()
const tmpV = new Vector3()

export class Jelly {
  readonly root = new Group()
  readonly body: Mesh
  private sprout = new Group()
  private u = {
    uTime: { value: 0 },
    uSqAxis: { value: new Vector3(0, 1, 0) },
    uSq: { value: 0 },
    uLag: { value: new Vector3() },
    uPress: { value: 0 },
    uImp: { value: Array.from({ length: IMPACTS }, () => new Vector4(0, -1, 0, -99)) },
    uImpAmp: { value: new Array(IMPACTS).fill(0) as number[] },
    uRadius: { value: RADIUS },
  }

  private sq = 0
  private sqV = 0
  private stretch = 0
  private axis = new Vector3(0, 1, 0)
  private lag = new Vector3()
  private lagV = new Vector3()
  private press = 0
  pressTarget = 0
  /** 0–1: how brightly the body glows, e.g. right after flying through a gate. */
  glow = 0
  private bodyMat: MeshPhysicalMaterial
  private impIndex = 0
  private sproutAngle = new Vector2()
  private sproutVel = new Vector2()

  mood: Expression = 'idle'
  private flash: Expression | null = null
  private flashUntil = 0
  private blinkAt = 1.5
  private blinkUntil = 0
  private look = new Vector2()
  /** Where the pointer is relative to the jelly on screen (unit range); null lets the eyes wander. */
  pointerLook: Vector2 | null = null
  private wander = new Vector2()
  private wanderAt = 0
  private faceKey = ''
  private ctx: CanvasRenderingContext2D
  private faceTex: CanvasTexture

  constructor() {
    const geo = bodyGeometry(RADIUS)
    const bodyMat = new MeshPhysicalMaterial({
      color: '#ff9fcd',
      emissive: new Color('#ff3f93'),
      emissiveIntensity: 0.12,
      roughness: 0.14,
      transmission: 0.7,
      thickness: 0.9,
      ior: 1.38,
      attenuationColor: new Color('#ff2a80'),
      attenuationDistance: 0.6,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      sheen: 0.5,
      sheenColor: new Color('#ffd3e8'),
      sheenRoughness: 0.45,
      envMapIntensity: 1.3,
    })
    deformable(bodyMat, this.u, 'jelly-body', true)
    this.bodyMat = bodyMat
    this.body = new Mesh(geo, bodyMat)

    // A hot core seen through the transmissive body reads as subsurface glow.
    const coreMat = new MeshBasicMaterial({ color: '#ff2f86' })
    deformable(coreMat, this.u, 'jelly-core', false)
    const core = new Mesh(new SphereGeometry(RADIUS * 0.55, 32, 24), coreMat)
    core.position.y = -0.04

    // The face is painted on a canvas and projected from the front, so it squashes with the body.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    this.ctx = canvas.getContext('2d')!
    this.faceTex = new CanvasTexture(canvas)
    this.faceTex.colorSpace = SRGBColorSpace
    const faceMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...this.u, uFace: { value: this.faceTex } },
      vertexShader: /* glsl */ `
        ${DEFORM_GLSL}
        varying vec2 vFaceUv;
        varying float vFront;
        void main() {
          vec3 n;
          vec3 q = jellyDeform(position, normal, n);
          q += n * 0.004;
          vFaceUv = position.xy / (uRadius * 2.0) + 0.5;
          vFront = normalize(position).z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uFace;
        varying vec2 vFaceUv;
        varying float vFront;
        void main() {
          if (vFront < 0.3) discard;
          vec4 c = texture2D(uFace, vFaceUv);
          if (c.a < 0.01) discard;
          gl_FragColor = c;
        }`,
    })
    const face = new Mesh(geo, faceMat)
    face.renderOrder = 2

    this.buildSprout()
    this.root.add(core, this.body, face, this.sprout)
    this.drawFace(0)
  }

  private buildSprout() {
    const green = new MeshPhysicalMaterial({
      color: '#b8f25c',
      emissive: new Color('#6fbf2a'),
      emissiveIntensity: 0.15,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.2,
    })
    const stem = new Mesh(new CylinderGeometry(0.016, 0.024, 0.2, 10), green)
    stem.position.y = 0.1
    const pivot = new Group()
    pivot.add(stem)
    for (const side of [-1, 1]) {
      const leaf = new Mesh(new SphereGeometry(0.12, 20, 12), green)
      leaf.scale.set(1.5, 0.28, 0.9)
      leaf.position.set(side * 0.15, 0.21, 0)
      leaf.rotation.z = side * 0.42
      pivot.add(leaf)
    }
    this.sprout.add(pivot)
  }

  /** A short expression that overrides the mood, e.g. a squint on each bounce. */
  flashExpression(e: Expression, seconds: number, t: number) {
    this.flash = e
    this.flashUntil = t + seconds
  }

  /** Hit from `worldDir` (pointing from the centre toward the contact) with strength 0–1. */
  impact(worldDir: Vector3, strength: number, t: number) {
    tmpQ.copy(this.root.quaternion).invert()
    const local = tmpV.copy(worldDir).applyQuaternion(tmpQ).normalize()
    const i = this.impIndex++ % IMPACTS
    this.u.uImp.value[i].set(local.x, local.y, local.z, t)
    this.u.uImpAmp.value[i] = 0.07 * strength
    this.sqV -= 7 * strength
  }

  /** A soft upward pulse, used for swim strokes and the launch. */
  kick(amount: number) {
    this.sqV += amount
  }

  /**
   * `force` is the non-gravitational acceleration in world space (what the jelly "feels"),
   * `velocity` drives the stretch while airborne.
   */
  update(dt: number, t: number, force: Vector3, velocity: Vector3, airborne: boolean) {
    this.u.uTime.value = t
    tmpQ.copy(this.root.quaternion).invert()
    const localForce = tmpV.copy(force).clampLength(0, 80).applyQuaternion(tmpQ)

    // Squash spring plus a stretch along the flight path.
    this.sqV += (-150 * this.sq - 9 * this.sqV) * dt
    this.sq += this.sqV * dt
    const speed = velocity.length()
    const stretchTarget = airborne ? Math.min(speed * 0.016, 0.2) : 0
    this.stretch += (stretchTarget - this.stretch) * Math.min(1, dt * 10)
    const axisTarget = airborne && speed > 0.5 ? velocity.clone().applyQuaternion(tmpQ).normalize() : new Vector3(0, 1, 0)
    if (axisTarget.y < 0) axisTarget.negate()
    this.axis.lerp(axisTarget, Math.min(1, dt * 8)).normalize()
    this.u.uSqAxis.value.copy(this.axis)
    this.u.uSq.value = Math.max(-0.45, Math.min(0.5, this.sq + this.stretch))

    // The top trails behind whatever pushes the body.
    this.lagV.addScaledVector(this.lag, -70 * dt).addScaledVector(this.lagV, -7 * dt).addScaledVector(localForce, -0.011 * dt * 60)
    this.lag.addScaledVector(this.lagV, dt).clampLength(0, 0.24)
    this.u.uLag.value.copy(this.lag)

    this.press += (this.pressTarget - this.press) * Math.min(1, dt * 12)
    this.u.uPress.value = this.press
    this.bodyMat.emissiveIntensity = 0.12 + this.glow * 2

    // Sprout: sits on the deformed crown and swings on its own spring.
    const a = 1 + this.u.uSq.value
    const b = 1 / Math.sqrt(Math.max(a, 0.25))
    const top = new Vector3(0, RADIUS * (1 - this.press * 0.3) - 0.01, 0)
    const along = top.dot(this.axis)
    top.multiplyScalar(b).addScaledVector(this.axis, along * (a - b)).add(this.lag)
    this.sprout.position.copy(top)
    this.sproutVel.x += (-110 * this.sproutAngle.x - 6 * this.sproutVel.x + localForce.z * 0.9 + this.lagV.z * 30) * dt
    this.sproutVel.y += (-110 * this.sproutAngle.y - 6 * this.sproutVel.y - localForce.x * 0.9 - this.lagV.x * 30) * dt
    this.sproutAngle.addScaledVector(this.sproutVel, dt).clampLength(0, 0.9)
    this.sprout.rotation.set(this.sproutAngle.x + Math.sin(t * 1.7) * 0.04, 0, this.sproutAngle.y + Math.sin(t * 1.3) * 0.05)

    // Eyes: blink, wander, follow the pointer.
    if (t > this.blinkAt) {
      this.blinkUntil = t + 0.12
      this.blinkAt = t + 2.2 + Math.random() * 3.2
      if (Math.random() < 0.2) this.blinkAt = t + 0.3
    }
    if (t > this.wanderAt) {
      this.wanderAt = t + 1.8 + Math.random() * 2.5
      this.wander.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.6)
      if (Math.random() < 0.35) this.wander.set(0, 0)
    }
    this.look.lerp(this.pointerLook ?? this.wander, Math.min(1, dt * 8))
    this.drawFace(t)
  }

  private drawFace(t: number) {
    const e = this.flash && t < this.flashUntil ? this.flash : this.mood
    const blinking = t < this.blinkUntil && (e === 'idle' || e === 'hover' || e === 'fly')
    const lx = Math.round(this.look.x * 5)
    const ly = Math.round(-this.look.y * 4)
    const key = `${e}|${blinking}|${lx}|${ly}|${e === 'dizzy' ? Math.floor(t * 14) : ''}`
    if (key === this.faceKey) return
    this.faceKey = key

    const g = this.ctx
    const ink = '#1d0a16'
    g.clearRect(0, 0, 256, 256)
    const fillEllipse = (x: number, y: number, rx: number, ry: number) => {
      g.beginPath()
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
      g.fill()
    }

    g.fillStyle = `rgba(255, 70, 135, ${e === 'happy' || e === 'hover' || e === 'skip' ? 0.8 : 0.55})`
    fillEllipse(56, 150, 21, 12)
    fillEllipse(200, 150, 21, 12)

    const L = { x: 86 + lx, y: 112 + ly }
    const R = { x: 170 + lx, y: 112 + ly }
    g.strokeStyle = ink
    g.fillStyle = ink
    g.lineWidth = 7
    g.lineCap = 'round'
    g.lineJoin = 'round'

    if (e === 'charge' || e === 'skip') {
      g.beginPath()
      g.moveTo(L.x - 11, L.y - 11)
      g.lineTo(L.x + 9, L.y)
      g.lineTo(L.x - 11, L.y + 11)
      g.moveTo(R.x + 11, R.y - 11)
      g.lineTo(R.x - 9, R.y)
      g.lineTo(R.x + 11, R.y + 11)
      g.stroke()
    } else if (e === 'dizzy') {
      g.lineWidth = 4.5
      for (const c of [L, R]) {
        g.beginPath()
        const spin = t * 9
        for (let a = 0; a < Math.PI * 4.2; a += 0.18) {
          const r = 1.5 + a * 1.25
          const x = c.x + Math.cos(a + spin) * r
          const y = c.y + Math.sin(a + spin) * r
          if (a === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
    } else if (e === 'happy' || e === 'swim') {
      g.beginPath()
      for (const c of [L, R]) {
        g.moveTo(c.x - 12, c.y + 5)
        g.quadraticCurveTo(c.x, c.y - 13, c.x + 12, c.y + 5)
      }
      g.stroke()
    } else if (blinking) {
      g.beginPath()
      for (const c of [L, R]) {
        g.moveTo(c.x - 12, c.y)
        g.quadraticCurveTo(c.x, c.y + 9, c.x + 12, c.y)
      }
      g.stroke()
    } else {
      const [rx, ry] = e === 'fly' ? [15, 20] : e === 'hover' ? [14, 18.5] : [12.5, 16.5]
      fillEllipse(L.x, L.y, rx, ry)
      fillEllipse(R.x, R.y, rx, ry)
      g.fillStyle = '#ffffff'
      for (const c of [L, R]) {
        fillEllipse(c.x + 4, c.y - 6, 4.8, 4.8)
        fillEllipse(c.x - 4, c.y + 6, 2.2, 2.2)
      }
      g.fillStyle = ink
    }

    // Mouth
    const mx = 128 + lx * 0.6
    const my = 146 + ly * 0.6
    if (e === 'fly') {
      fillEllipse(mx, my + 4, 9, 11)
      g.fillStyle = '#ff5f95'
      fillEllipse(mx, my + 9, 5.5, 4)
    } else if (e === 'hover' || e === 'happy' || e === 'skip') {
      g.beginPath()
      g.moveTo(mx - 15, my - 2)
      g.quadraticCurveTo(mx, my + 26, mx + 15, my - 2)
      g.closePath()
      g.fill()
      g.fillStyle = '#ff5f95'
      fillEllipse(mx, my + 8, 6.5, 4)
    } else if (e === 'dizzy') {
      g.lineWidth = 5
      g.beginPath()
      for (let i = 0; i <= 20; i++) {
        const x = mx - 14 + i * 1.4
        const y = my + 4 + Math.sin(i * 0.9 + t * 10) * 3
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
    } else if (e === 'swim' || e === 'charge') {
      g.lineWidth = 5.5
      g.beginPath()
      g.arc(mx - 6, my, 6, 0.1 * Math.PI, 0.95 * Math.PI)
      g.arc(mx + 6, my, 6, 0.05 * Math.PI, 0.9 * Math.PI)
      g.stroke()
    } else {
      g.lineWidth = 6
      g.beginPath()
      g.arc(mx, my - 6, 12, 0.2 * Math.PI, 0.8 * Math.PI)
      g.stroke()
    }
    this.faceTex.needsUpdate = true
  }
}
