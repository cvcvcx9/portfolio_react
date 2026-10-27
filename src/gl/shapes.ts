import { Vector3 } from 'three'

export type ShapeName = 'planet' | 'split' | 'bound' | 'subtract' | 'loop' | 'grid' | 'console' | 'agent' | 'constellation'

export type Tone = 'ice' | 'ember' | 'acid' | 'white'

export interface Anchor {
  pos: Vector3
  text: string
  tone: Tone
}

export interface Shape {
  name: ShapeName
  /** xyz + tag per particle (tag: 0 base · 1 ice · 2 ember · 3 dim · 4 acid · 5 white) */
  data: Float32Array
  anchors: Anchor[]
  spin: number
  glow: [number, number, number]
}

const T = { base: 0, ice: 1, ember: 2, dim: 3, acid: 4, white: 5 }

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Rand = () => number

function gauss(r: Rand) {
  let u = 0
  while (u === 0) u = r()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

function unitVector(r: Rand, out = new Vector3()) {
  return out.set(gauss(r), gauss(r), gauss(r)).normalize()
}

class Writer {
  data: Float32Array
  i = 0
  constructor(readonly count: number) {
    this.data = new Float32Array(count * 4)
  }
  put(x: number, y: number, z: number, tag: number) {
    if (this.i >= this.count) return
    const o = this.i * 4
    this.data[o] = x
    this.data[o + 1] = y
    this.data[o + 2] = z
    this.data[o + 3] = tag
    this.i++
  }
  get left() {
    return this.count - this.i
  }
}

/** Counting sort by a left-to-right key so morphs read as flows instead of random swaps. */
function sortSpatially(data: Float32Array, count: number) {
  const B = 2048
  let min = Infinity
  let max = -Infinity
  const key = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const k = data[i * 4] + data[i * 4 + 2] * 0.18 + data[i * 4 + 1] * 0.04
    key[i] = k
    if (k < min) min = k
    if (k > max) max = k
  }
  const span = max - min || 1
  const bucket = new Uint16Array(count)
  const counts = new Uint32Array(B + 1)
  for (let i = 0; i < count; i++) {
    const b = Math.min(B - 1, Math.floor(((key[i] - min) / span) * B))
    bucket[i] = b
    counts[b + 1]++
  }
  for (let b = 0; b < B; b++) counts[b + 1] += counts[b]
  const out = new Float32Array(data.length)
  for (let i = 0; i < count; i++) {
    const dst = counts[bucket[i]]++ * 4
    out[dst] = data[i * 4]
    out[dst + 1] = data[i * 4 + 1]
    out[dst + 2] = data[i * 4 + 2]
    out[dst + 3] = data[i * 4 + 3]
  }
  return out
}

function rotateXYZ(x: number, y: number, z: number, rx: number, ry: number, rz: number): [number, number, number] {
  // X
  let cy = Math.cos(rx)
  let sy = Math.sin(rx)
  let y1 = y * cy - z * sy
  let z1 = y * sy + z * cy
  // Y
  const cyy = Math.cos(ry)
  const syy = Math.sin(ry)
  const x2 = x * cyy + z1 * syy
  const z2 = -x * syy + z1 * cyy
  // Z
  cy = Math.cos(rz)
  sy = Math.sin(rz)
  const x3 = x2 * cy - y1 * sy
  y1 = x2 * sy + y1 * cy
  return [x3, y1, z2]
}

function anchor(x: number, y: number, z: number, text: string, tone: Tone): Anchor {
  return { pos: new Vector3(x, y, z), text, tone }
}

// ── planet: data sphere + tilted ring ─────────────────────────
function planet(count: number): Float32Array {
  const r = mulberry32(11)
  const w = new Writer(count)
  const nShell = Math.floor(count * 0.74)
  const nRing = Math.floor(count * 0.2)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < nShell; i++) {
    const y = 1 - (i / (nShell - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th = golden * i
    const x = Math.cos(th) * rad
    const z = Math.sin(th) * rad
    const bump = 1 + 0.045 * Math.sin(x * 6.0 + y * 3.0) * Math.cos(z * 5.0 - y * 2.0)
    const R = 2.0 * bump + gauss(r) * 0.03
    w.put(x * R, y * R, z * R, r() < 0.025 ? T.white : T.base)
  }
  for (let i = 0; i < nRing; i++) {
    const a = r() * Math.PI * 2
    const rr = 2.55 + Math.pow(r(), 1.7) * 0.75
    const [x, y, z] = rotateXYZ(Math.cos(a) * rr, gauss(r) * 0.025, Math.sin(a) * rr, 0.36, 0, 0.24)
    w.put(x, y, z, r() < 0.14 ? T.white : T.ice)
  }
  const v = new Vector3()
  while (w.left > 0) {
    unitVector(r, v).multiplyScalar(2.6 + r() * 3.4)
    w.put(v.x, v.y, v.z, T.dim)
  }
  return sortSpatially(w.data, count)
}

// ── split: the same sphere breaks into four measurable parts ──
const SPLIT_CENTERS = [
  new Vector3(-1.55, 1.08, 0),
  new Vector3(1.55, 1.08, 0),
  new Vector3(-1.55, -1.08, 0),
  new Vector3(1.55, -1.08, 0),
]

function split(count: number, planetData: Float32Array): Float32Array {
  const r = mulberry32(23)
  const out = new Float32Array(count * 4)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    const o = i * 4
    const x = planetData[o]
    const y = planetData[o + 1]
    const z = planetData[o + 2]
    const tag = planetData[o + 3]
    const q = (x >= 0 ? 1 : 0) + (y < 0 ? 2 : 0)
    const c = SPLIT_CENTERS[q]
    v.set(x, y, z).normalize()
    if (tag === T.dim) {
      v.multiplyScalar(3.2 + r() * 2.6)
      out[o] = v.x
      out[o + 1] = v.y
      out[o + 2] = v.z - 1.5
      out[o + 3] = T.dim
      continue
    }
    // Each quadrant becomes a small planet of its own: full shell + thin ring.
    const isRing = tag === T.ice || (tag === T.white && Math.hypot(x, y, z) > 2.3)
    if (isRing) {
      const a = r() * Math.PI * 2
      const R = 1.02 + gauss(r) * 0.03
      const [rx, ry, rz] = rotateXYZ(Math.cos(a) * R, gauss(r) * 0.015, Math.sin(a) * R, 0.38, 0, 0.2)
      out[o] = c.x + rx
      out[o + 1] = c.y + ry
      out[o + 2] = c.z + rz
      out[o + 3] = T.white
    } else {
      unitVector(r, v).multiplyScalar(0.74 + gauss(r) * 0.025)
      out[o] = c.x + v.x
      out[o + 1] = c.y + v.y
      out[o + 2] = c.z + v.z
      out[o + 3] = T.ember
    }
  }
  return out
}

// ── bound: a boundary (cube) around a pure core, infra kept outside ──
function bound(count: number): Float32Array {
  const r = mulberry32(37)
  const w = new Writer(count)
  const h = 1.7
  const corners: [number, number, number][] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * h, sy * h, sz * h])
  const edges: [number, number][] = []
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const d = corners[a].reduce((s, v, k) => s + (v !== corners[b][k] ? 1 : 0), 0)
      if (d === 1) edges.push([a, b])
    }
  const nEdges = Math.floor(count * 0.46)
  for (let i = 0; i < nEdges; i++) {
    const [a, b] = edges[i % edges.length]
    const t = r()
    const A = corners[a]
    const B = corners[b]
    w.put(
      A[0] + (B[0] - A[0]) * t + gauss(r) * 0.018,
      A[1] + (B[1] - A[1]) * t + gauss(r) * 0.018,
      A[2] + (B[2] - A[2]) * t + gauss(r) * 0.018,
      r() < 0.12 ? T.white : T.ice,
    )
  }
  const nCore = Math.floor(count * 0.32)
  const v = new Vector3()
  for (let i = 0; i < nCore; i++) {
    unitVector(r, v).multiplyScalar(Math.cbrt(r()) * 0.72)
    w.put(v.x, v.y, v.z, r() < 0.08 ? T.white : T.acid)
  }
  while (w.left > 0) {
    unitVector(r, v).multiplyScalar(3.05 + r() * 0.9)
    w.put(v.x * 1.15, v.y * 0.75, v.z * 0.8 - 0.6, r() < 0.7 ? T.ember : T.dim)
  }
  return sortSpatially(w.data, count)
}

// ── subtract: everything falls away except the one short path ──
function subtract(count: number): Float32Array {
  const r = mulberry32(41)
  const w = new Writer(count)
  const nLine = Math.floor(count * 0.15)
  for (let i = 0; i < nLine; i++) {
    const t = r()
    w.put(-2.6 + t * 5.2, gauss(r) * 0.014, gauss(r) * 0.014, r() < 0.1 ? T.white : T.ice)
  }
  const nEnds = Math.floor(count * 0.04)
  const v = new Vector3()
  for (let i = 0; i < nEnds; i++) {
    unitVector(r, v).multiplyScalar(Math.cbrt(r()) * 0.17)
    const sx = i % 2 === 0 ? -2.6 : 2.6
    w.put(sx + v.x, v.y, v.z, T.white)
  }
  while (w.left > 0) {
    w.put((r() - 0.5) * 24, (r() - 0.5) * 13, -6.5 - r() * 3.5, T.dim)
  }
  return sortSpatially(w.data, count)
}

// ── loop: a closed, flowing verification loop ──
function loop(count: number): Float32Array {
  const r = mulberry32(53)
  const w = new Writer(count)
  const R = 2.15
  const nRing = Math.floor(count * 0.88)
  for (let i = 0; i < nRing; i++) {
    const a = r() * Math.PI * 2
    const b = r() * Math.PI * 2
    const tube = 0.06 + Math.abs(gauss(r)) * 0.05
    const rr = R + Math.cos(b) * tube
    w.put(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(b) * tube, r() < 0.08 ? T.white : T.acid)
  }
  while (w.left > 0) {
    const a = r() * Math.PI * 2
    const rr = R + gauss(r) * 0.45
    w.put(Math.cos(a) * rr, Math.sin(a) * rr, gauss(r) * 0.5, T.dim)
  }
  return sortSpatially(w.data, count)
}

// ── grid: an abstract power network, energized vs de-energized sections ──
const GRID_LINES = [
  { y: 1.35, z: -0.5 },
  { y: 0.45, z: 0.15 },
  { y: -0.45, z: -0.15 },
  { y: -1.35, z: 0.5 },
]
const GRID_TILT: [number, number, number] = [-0.38, 0.0, 0.0]
const STATION_X = Array.from({ length: 8 }, (_, k) => -4.2 + k * 1.2)

function energized(line: number, seg: number) {
  return (seg + line * 2) % 3 !== 0
}

function grid(count: number): Float32Array {
  const r = mulberry32(67)
  const w = new Writer(count)
  const put = (x: number, y: number, z: number, tag: number) => {
    const [a, b, c] = rotateXYZ(x, y, z, ...GRID_TILT)
    w.put(a, b, c, tag)
  }
  const nLines = Math.floor(count * 0.62)
  for (let i = 0; i < nLines; i++) {
    const li = i % GRID_LINES.length
    const L = GRID_LINES[li]
    const x = -4.2 + r() * 8.4
    const seg = Math.min(6, Math.floor((x + 4.2) / 1.2))
    put(x, L.y + gauss(r) * 0.012, L.z + gauss(r) * 0.012, energized(li, seg) ? T.ember : T.acid)
  }
  const nStations = Math.floor(count * 0.14)
  const v = new Vector3()
  for (let i = 0; i < nStations; i++) {
    const li = i % GRID_LINES.length
    const sx = STATION_X[Math.floor(i / GRID_LINES.length) % STATION_X.length]
    unitVector(r, v).multiplyScalar(Math.cbrt(r()) * 0.075)
    put(sx + v.x, GRID_LINES[li].y + v.y, GRID_LINES[li].z + v.z, T.white)
  }
  const nConn = Math.floor(count * 0.08)
  const feeders = [-3.0, 0.6, 3.0]
  for (let i = 0; i < nConn; i++) {
    const fx = feeders[i % feeders.length]
    const li = Math.floor(r() * 3)
    const t = r()
    const A = GRID_LINES[li]
    const B = GRID_LINES[li + 1]
    put(fx, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t, T.dim)
  }
  while (w.left > 0) put((r() - 0.5) * 12, (r() - 0.5) * 7, -4 + r() * 5, T.dim)
  return sortSpatially(w.data, count)
}

function gridAnchors(): Anchor[] {
  const top = GRID_LINES[0]
  const mid = (seg: number) => -4.2 + seg * 1.2 + 0.6
  // segment 5 is energized and segment 6 is de-energized on the top line (see `energized`); both sit right of the headings
  const a = rotateXYZ(mid(5), top.y + 0.32, top.z, ...GRID_TILT)
  const b = rotateXYZ(mid(6), top.y - 0.32, top.z, ...GRID_TILT)
  return [anchor(a[0], a[1], a[2], '급전 · 전원 인가', 'ember'), anchor(b[0], b[1], b[2], '단전 · 작업 가능', 'acid')]
}

// ── console: the Flow Lab screen, app cards + request inspector rows ──
const CONSOLE_ROT: [number, number, number] = [0.1, -0.38, 0]

function consoleShape(count: number): Float32Array {
  const r = mulberry32(79)
  const w = new Writer(count)
  const put = (x: number, y: number, z: number, tag: number) => {
    const [a, b, c] = rotateXYZ(x, y, z, ...CONSOLE_ROT)
    w.put(a, b, c, tag)
  }
  const W = 2.45
  const H = 1.55
  const nFrame = Math.floor(count * 0.1)
  for (let i = 0; i < nFrame; i++) {
    const t = r() * (W * 4 + H * 4)
    let x: number
    let y: number
    if (t < W * 2) {
      x = -W + t
      y = H
    } else if (t < W * 2 + H * 2) {
      x = W
      y = H - (t - W * 2)
    } else if (t < W * 4 + H * 2) {
      x = W - (t - W * 2 - H * 2)
      y = -H
    } else {
      x = -W
      y = -H + (t - W * 4 - H * 2)
    }
    put(x + gauss(r) * 0.008, y + gauss(r) * 0.008, 0, T.white)
  }
  const rect = (x0: number, x1: number, y0: number, y1: number, n: number, tag: number) => {
    for (let i = 0; i < n; i++) put(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), gauss(r) * 0.01, tag)
  }
  rect(-2.25, 0.05, 0.55, 1.32, Math.floor(count * 0.16), T.base)
  rect(-2.25, -1.15, -0.45, 0.38, Math.floor(count * 0.09), T.base)
  rect(-1.05, 0.05, -0.45, 0.38, Math.floor(count * 0.09), T.base)
  for (let k = 0; k < 4; k++) rect(-2.25 + k * 0.59, -2.25 + k * 0.59 + 0.5, -1.32, -0.72, Math.floor(count * 0.025), T.ice)
  rect(0.4, 2.27, 1.16, 1.34, Math.floor(count * 0.04), T.white)
  const rowTags = [T.ice, T.ice, T.ember, T.ice, T.acid, T.ice, T.ice, T.acid, T.ice, T.ice]
  const nRows = Math.floor(count * 0.26)
  for (let i = 0; i < nRows; i++) {
    const row = i % rowTags.length
    const y = 0.95 - row * 0.24
    const len = 1.1 + ((row * 37) % 7) * 0.11
    put(0.42 + r() * len, y + gauss(r) * 0.022, gauss(r) * 0.01, rowTags[row])
  }
  while (w.left > 0) put((r() - 0.5) * 9, (r() - 0.5) * 6, -2.5 - r() * 3, T.dim)
  return sortSpatially(w.data, count)
}

function consoleAnchors(): Anchor[] {
  const a = rotateXYZ(-1.1, 1.62, 0, ...CONSOLE_ROT)
  const b = rotateXYZ(1.35, 1.62, 0, ...CONSOLE_ROT)
  return [anchor(a[0], a[1], a[2], '두 역할 세션', 'ice'), anchor(b[0], b[1], b[2], '요청 기록 패널', 'acid')]
}

// ── agent: the six-step loop, knots stay put while the ring flows ──
const AGENT_STEPS = ['계약 확정', '흐름표', '영향 조사', '실패 테스트', '구현 · 스모크', '검증 보고']
const AGENT_R = 1.85

function knotAngle(k: number) {
  return Math.PI / 2 - (k * Math.PI * 2) / AGENT_STEPS.length
}

function agent(count: number): Float32Array {
  const r = mulberry32(83)
  const w = new Writer(count)
  const nRing = Math.floor(count * 0.66)
  for (let i = 0; i < nRing; i++) {
    const a = r() * Math.PI * 2
    const rr = AGENT_R + gauss(r) * 0.035
    w.put(Math.cos(a) * rr, Math.sin(a) * rr, gauss(r) * 0.035, r() < 0.1 ? T.acid : T.ice)
  }
  const nKnots = Math.floor(count * 0.24)
  const v = new Vector3()
  for (let i = 0; i < nKnots; i++) {
    const k = i % AGENT_STEPS.length
    const a = knotAngle(k)
    unitVector(r, v).multiplyScalar(Math.cbrt(r()) * 0.17)
    w.put(Math.cos(a) * AGENT_R + v.x, Math.sin(a) * AGENT_R + v.y, v.z, T.white)
  }
  while (w.left > 0) {
    const a = r() * Math.PI * 2
    const rr = Math.sqrt(r()) * 1.7
    w.put(Math.cos(a) * rr, Math.sin(a) * rr, gauss(r) * 0.3, T.dim)
  }
  return sortSpatially(w.data, count)
}

function agentAnchors(): Anchor[] {
  return AGENT_STEPS.map((text, k) => {
    const a = knotAngle(k)
    const R = AGENT_R + 0.42
    return anchor(Math.cos(a) * R, Math.sin(a) * R, 0, text, k === AGENT_STEPS.length - 1 ? 'acid' : 'white')
  })
}

// ── constellation: earlier work, connected in time order ──
const STARS: { name: string; pos: [number, number, number]; size: number; tag: number; tone: Tone }[] = [
  { name: '선택의왕', pos: [-2.21, -0.8, -0.2], size: 0.22, tag: T.base, tone: 'white' },
  { name: '깻냥', pos: [-1.57, 0.95, 0.4], size: 0.26, tag: T.ice, tone: 'ice' },
  { name: '갓생루팅', pos: [-0.94, -1.15, -0.3], size: 0.28, tag: T.ember, tone: 'ember' },
  { name: '손누리', pos: [-0.31, 1.25, 0.2], size: 0.25, tag: T.ice, tone: 'ice' },
  { name: 'ERP 자동화', pos: [0.31, -0.55, 0.5], size: 0.24, tag: T.acid, tone: 'acid' },
  { name: 'MSA 실험', pos: [0.94, 1.05, -0.4], size: 0.2, tag: T.base, tone: 'white' },
  { name: 'MongoDash', pos: [1.57, -1.2, 0.1], size: 0.22, tag: T.ice, tone: 'ice' },
  { name: 'Malang', pos: [2.21, 0.55, 0.3], size: 0.34, tag: T.acid, tone: 'acid' },
]

function constellation(count: number): Float32Array {
  const r = mulberry32(97)
  const w = new Writer(count)
  const v = new Vector3()
  const nStars = Math.floor(count * 0.66)
  for (let i = 0; i < nStars; i++) {
    const s = STARS[i % STARS.length]
    unitVector(r, v).multiplyScalar(Math.pow(r(), 0.6) * s.size)
    w.put(s.pos[0] + v.x, s.pos[1] + v.y, s.pos[2] + v.z, r() < 0.12 ? T.white : s.tag)
  }
  const nLinks = Math.floor(count * 0.22)
  for (let i = 0; i < nLinks; i++) {
    const k = i % (STARS.length - 1)
    const A = STARS[k].pos
    const B = STARS[k + 1].pos
    const t = r()
    w.put(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + gauss(r) * 0.01, A[2] + (B[2] - A[2]) * t, T.dim)
  }
  while (w.left > 0) {
    unitVector(r, v).multiplyScalar(3 + r() * 4)
    w.put(v.x * 1.4, v.y, v.z - 2, T.dim)
  }
  return sortSpatially(w.data, count)
}

function constellationAnchors(): Anchor[] {
  return STARS.map((s) => anchor(s.pos[0], s.pos[1] + s.size + 0.3, s.pos[2], s.name, s.tone))
}

// ── registry ──
export function buildShapes(count: number): Record<ShapeName, Shape> {
  const p = planet(count)
  const ice: [number, number, number] = [0.43, 0.89, 1.0]
  return {
    planet: { name: 'planet', data: p, anchors: [], spin: 0, glow: ice },
    split: {
      name: 'split',
      data: split(count, p),
      anchors: [
        anchor(-1.55, 2.12, 0, '스키마 비호환', 'ember'),
        anchor(1.55, 2.12, 0, '스케줄러 중복 · 공백', 'ember'),
        anchor(-1.55, -2.12, 0, '파이프라인 간섭', 'ember'),
        anchor(1.55, -2.12, 0, 'HTTP 재기동', 'ember'),
      ],
      spin: 0,
      glow: [1.0, 0.36, 0.18],
    },
    bound: {
      name: 'bound',
      data: bound(count),
      anchors: [
        anchor(0, -1.0, 0, '순수 도메인 규칙', 'acid'),
        anchor(1.7, 1.7, 1.7, 'AST 구조 테스트', 'ice'),
        anchor(-1.9, -2.15, -0.6, '밖: ORM · DB · HTTP', 'ember'),
      ],
      spin: 0,
      glow: ice,
    },
    subtract: {
      name: 'subtract',
      data: subtract(count),
      anchors: [
        anchor(-2.6, 0.42, 0, '요청', 'white'),
        anchor(2.6, 0.42, 0, '응답', 'white'),
        anchor(0, -0.7, -1.2, '숨은 왕복 · 중복 조회 · 불필요한 인프라', 'ice'),
      ],
      spin: 0,
      glow: [0.62, 0.64, 0.74],
    },
    loop: {
      name: 'loop',
      data: loop(count),
      anchors: [
        anchor(0, 2.72, 0, '실패 테스트', 'acid'),
        anchor(-2.36, -1.36, 0, '수정', 'acid'),
        anchor(2.36, -1.36, 0, '봉인', 'acid'),
      ],
      spin: 0.34,
      glow: [0.78, 1.0, 0.29],
    },
    grid: { name: 'grid', data: grid(count), anchors: gridAnchors(), spin: 0, glow: [1.0, 0.45, 0.25] },
    console: { name: 'console', data: consoleShape(count), anchors: consoleAnchors(), spin: 0, glow: ice },
    agent: { name: 'agent', data: agent(count), anchors: agentAnchors(), spin: 0.16, glow: [0.6, 1.0, 0.5] },
    constellation: {
      name: 'constellation',
      data: constellation(count),
      anchors: constellationAnchors(),
      spin: 0,
      glow: [0.66, 0.6, 1.0],
    },
  }
}

/** Big-bang start: every particle near the origin, flying outward. */
export function burst(count: number): { pos: Float32Array; vel: Float32Array } {
  const r = mulberry32(5)
  const pos = new Float32Array(count * 4)
  const vel = new Float32Array(count * 4)
  const v = new Vector3()
  for (let i = 0; i < count; i++) {
    unitVector(r, v)
    const o = i * 4
    pos[o] = v.x * 0.05
    pos[o + 1] = v.y * 0.05
    pos[o + 2] = v.z * 0.05
    pos[o + 3] = 1
    const s = 3 + r() * 7
    vel[o] = v.x * s
    vel[o + 1] = v.y * s
    vel[o + 2] = v.z * s
    vel[o + 3] = r()
  }
  return { pos, vel }
}
