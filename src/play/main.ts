import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource-variable/jetbrains-mono'
import '../styles/base.css'
import '../styles/layout.css'
import '../styles/play.css'

import {
  Color,
  DirectionalLight,
  HalfFloatType,
  HemisphereLight,
  PerspectiveCamera,
  PMREMGenerator,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import { Ocean, RippleSim, SUN_DIR, heightAt, skyDome } from './ocean'
import { BOTTOM, Jelly } from './jelly'
import { Callout, Droplets, Flecks, Lanterns, Pulse, Sparks, SpeedLines, Tether, ZoomBlurEffect } from './fx'
import { Course, type Gate } from './course'
import { GATE_HALF } from './gate'
import type { Puffer } from './puffer'
import { Sfx } from './audio'

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode: keep the value for this visit only */
    }
  },
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const lowPower = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4

type Mode = 'float' | 'air'

const UP = new Vector3(0, 1, 0)
/** Height of the centre above the surface while floating; the belly sits under water. */
const FLOAT_LIFT = 0.24
const G = 12
const JUMP_VY = 6.2
/** Forward speed of the very first hop, and what a jump from the water adds. */
const START_SPEED = 3.6
const JUMP_PUSH = 1.4
/** Downward speed a slam starts with. */
const SLAM_VY = 12
/** A slam this close to the top of the arc (seconds, either side) is perfect. */
const APEX_WINDOW = 0.12
const MAX_SPEED = 60
const STOP_SPEED = 0.5
/** Forward speed each gate flown through adds, and how long its glow and sparkle trail last (seconds). */
const GATE_BOOST = 2.5
const BOOST_TIME = 0.8
/** Share of the forward speed kept after flying around a gate instead of through it. */
const MISS_KEEP = 0.85
/** Within this distance before a gate, the flight bends toward its middle (radians per second). */
const ASSIST_RANGE = 16
const ASSIST_RATE = 0.75
/**
 * A press aims the flight at the spot it points to, read on a plane this high (about a gate's middle). The flight turns toward it
 * at AIM_RATE (radians per second); a jump from the water turns up to JUMP_TURN at once. Held arrow keys turn at KEY_RATE.
 */
const AIM_Y = 1
/** A spot beside or behind the jelly keeps its side and is moved this far ahead; one right next to the jelly aims straight on. */
const AIM_NEAR = 6
const AIM_RATE = 2.6
const JUMP_TURN = 0.6
const KEY_RATE = 1.8
/** A puffer up to this far ahead (further at speed) and this close to the path is locked on; a press then dashes onto it. */
const LOCK_AHEAD = 8
const LOCK_AHEAD_PER_SPEED = 0.3
const LOCK_SIDE = 3.5
/**
 * Locking on slows time to SLOW_SCALE for SLOW_TIME seconds (real time), at most once per SLOW_GAP so a chain of puffers keeps its pace.
 * Popping a puffer all but stops time for HIT_STOP.
 */
const SLOW_SCALE = 0.3
const SLOW_TIME = 0.3
const SLOW_GAP = 1.2
const HIT_STOP = 0.07
/** The dash flies straight at the puffer, faster than the flight and never slower than DASH_MIN; it gives up after DASH_TIME. */
const DASH_MIN = 40
const DASH_GAIN = 2
const DASH_TIME = 0.5
/** A slam that hits the water this close to a puffer still pops it. */
const STOMP_R = 2.2
/** Popping a puffer hops the jelly up (low enough to stay under the next gate's string) and adds this much forward speed. */
const STOMP_VY = 6
const STOMP_BOOST = 5
/** Share of the forward speed kept after bumping into a puffer. */
const BUMP_KEEP = 0.55
const PUFFER_COLOR = new Color('#ffa23a')
/** Camera height above the sea and distance behind the jelly; portrait screens sit higher and further back. */
const CAM_UP = 6.2
const CAM_BACK = 7.8
const CAM_UP_PORTRAIT = 7.6
const CAM_BACK_PORTRAIT = 9.2
/** How fast the camera turns (per second), and the share of its direction taken from the course rather than the jelly. */
const CAM_TURN = 1.6
const CAM_ON_COURSE = 0.65
const COACH = ['클릭하면 점프!', '꼭대기에서 한 번 더 클릭 → 내리꽂기!', '가고 싶은 쪽을 누르면 그쪽으로 꺾어요']
const STOMP_HINT = '조준이 뜨면 클릭 → 복어에게 돌진!'
/** Speed tiers in m/s (about 40, 80, 120 and 160 km/h). Breaking into one sets off a burst; each has its own colour. */
const TIERS = [11, 22, 33, 44]
const TIER_COLORS = ['#e6f4ff', '#6fe3ff', '#c8ff4a', '#ffc24a', '#ff6fb1'].map((c) => new Color(c))
const WHITE = new Color('#ffffff')
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function start() {
  const canvas = $<HTMLCanvasElement>('[data-play]')
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  } catch {
    canvas.hidden = true
    $('[data-fallback]').hidden = false
    return
  }
  let pixelRatio = Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2)
  renderer.setPixelRatio(pixelRatio)

  const scene = new Scene()
  const camera = new PerspectiveCamera(50, 1, 0.1, 1500)
  const dome = skyDome(900, true)
  scene.add(dome)

  // Reflections and the jelly's refraction come from the same sky.
  const envScene = new Scene()
  envScene.add(skyDome(50, false))
  scene.environment = new PMREMGenerator(renderer).fromScene(envScene, 0.04).texture

  scene.add(new HemisphereLight('#a48dff', '#05293a', 0.9))
  const sun = new DirectionalLight('#ffc496', 2.3)
  const fill = new DirectionalLight('#9db2ff', 0.9)
  scene.add(sun, fill, sun.target, fill.target)

  const canRipple = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
  const ripples = canRipple ? new RippleSim(renderer, 48, lowPower ? 0.25 : 0.125) : null
  const ocean = new Ocean(ripples, lowPower ? 170 : 260)
  scene.add(ocean.mesh)

  const jelly = new Jelly()
  scene.add(jelly.root)
  const droplets = new Droplets(scene, lowPower ? 260 : 600)
  const flecks = new Flecks(scene, lowPower ? 160 : 320)
  const lanterns = new Lanterns(scene, lowPower ? 26 : 44)
  const course = new Course(scene, lowPower ? 5 : 6)
  const sparks = new Sparks(scene, lowPower ? 240 : 420)
  const pulse = new Pulse(scene, '#c8ff4a')
  const burst = new Pulse(scene, '#ffffff', { grow: 9, life: 0.6, width: 0.03, overlay: true })
  const lines = new SpeedLines($<HTMLCanvasElement>('[data-lines]'))
  const tether = new Tether(scene)
  const callout = new Callout($('[data-pops]'), camera)
  const sfx = new Sfx(store.get('jelly-sound') !== 'off')

  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: lowPower ? 0 : 4 })
  const zoom = new ZoomBlurEffect(lowPower ? 6 : 10)
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 })
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(
    new EffectPass(
      camera,
      zoom,
      new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, intensity: lowPower ? 0.7 : 0.95, radius: 0.7 }),
      vignette,
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    ),
  )

  // ── UI ──
  const flashEl = $('[data-flash]')
  const soundBtn = $<HTMLButtonElement>('[data-sound]')
  const coach = $('[data-coach]')
  const coachText = coach.querySelector('span')!
  // 0: teach the jump, 1: the slam, 2: steering toward the gates, 3: done.
  // The stomp tip takes over while a puffer waits ahead, until the first stomp.
  let coachStage = store.get('jelly-coached-steer') === '1' ? 3 : store.get('jelly-coached-slam') === '1' ? 2 : 0
  let coachedStomp = store.get('jelly-coached-stomp') === '1'
  let coachShown: string | undefined = '-'
  const paintSound = () => {
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled))
    soundBtn.setAttribute('aria-label', sfx.enabled ? '소리 끄기' : '소리 켜기')
  }
  paintSound()
  soundBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled
    store.set('jelly-sound', sfx.enabled ? 'on' : 'off')
    sfx.unlock()
    paintSound()
  })

  // ── State ──
  let mode: Mode = 'float'
  let t = 0
  const pos = new Vector3(0, FLOAT_LIFT, 0)
  const vel = new Vector3()
  const prevVel = new Vector3()
  const heading = new Vector3(0, 0, -1)
  let yaw = 0
  let pitch = 0
  let roll = 0
  let slamming = false
  let slamFrom = 0
  let slamPerfect = false
  let slamEarly = false
  let rising = false
  let apexAt = -1
  let stillT = 0
  let wakeT = 0
  let shake = 0
  let fovKick = 0
  let camRoll = 0
  let lastHeadingYaw = Math.atan2(heading.x, heading.z)
  let hovered = false
  let pointer: { x: number; y: number } | null = null
  const keys = { left: false, right: false }
  // The spot the flight is turning toward, and whether the press that set it is still held down.
  let aim: Vector3 | null = null
  let holding = false

  // A run starts with the first jump and ends when the jelly comes to rest. Nothing is scored.
  let running = false
  let peak = 0
  let streak = 0
  let tier = 0
  const tierColor = TIER_COLORS[0].clone()
  const lineColor = new Color()
  let flash = 0
  let blurKick = 0
  // Gates flown through in a row; every third one moves the gates to the next colour.
  let chain = 0
  let gates = 0
  let misses = 0
  const chainColor = () => TIER_COLORS[Math.min(TIER_COLORS.length - 1, Math.floor(chain / 3))]
  // After a gate: seconds of boost left and its colour.
  let boostT = 0
  const boostColor = new Color()
  let sparkAcc = 0
  // Puffers: the one a slam right now would land on, and the one the current slam is diving onto.
  let target: Puffer | null = null
  let diveAt: Puffer | null = null
  const diveDir = new Vector3()
  let diveSpeed = 0
  let dashSpeed = 0
  let dashT = 0
  let stomps = 0
  let bumps = 0
  // Bullet time after a lock-on and the stop when a puffer pops (seconds of real time left), and how fast time runs now.
  let slowT = 0
  let stopT = 0
  let timeScale = 1
  let realT = 0
  let slowAt = -SLOW_GAP
  const slowed = new WeakSet<Puffer>()

  const ray = new Raycaster()
  const ndc = new Vector2()
  const screenOf = (p: Vector3) => {
    const v = p.clone().project(camera)
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight }
  }
  const overJelly = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return ray.intersectObject(jelly.body, false).length > 0
  }
  const horizontalSpeed = () => Math.hypot(vel.x, vel.z)
  /** Arcs get snappier with speed, so the bounce rhythm quickens as you accelerate. */
  const gravity = () => G * (1 + Math.min(horizontalSpeed() * 0.01, 0.5))
  const travelDir = () => {
    const h = horizontalSpeed()
    return h > 0.3 ? new Vector3(vel.x / h, 0, vel.z / h) : heading.clone()
  }

  // ── Actions ──
  /** From the water: hop forward. */
  function jump() {
    const h = horizontalSpeed()
    const dir = travelDir().applyAxisAngle(UP, Math.max(-JUMP_TURN, Math.min(JUMP_TURN, aimAngle())))
    const speed = Math.min(h < STOP_SPEED ? START_SPEED : h + JUMP_PUSH, MAX_SPEED)
    vel.set(dir.x * speed, JUMP_VY + Math.min(speed * 0.03, 1.2), dir.z * speed)
    mode = 'air'
    slamming = false
    rising = true
    stillT = 0
    if (!running) {
      running = true
      peak = 0
      streak = 0
    }
    jelly.kick(6)
    sfx.jump(speed)
    const s = heightAt(pos.x, pos.z, t)
    ripples?.drop(pos.x, pos.z, 0.6, -0.12)
    droplets.burst(new Vector3(pos.x, s, pos.z), new Vector3(), Math.round(10 + speed * 0.6), 0.55)
    fovKick = reducedMotion ? 0 : 1.5
    if (coachStage === 0) {
      coachStage = 1
    }
  }

  /** In the air: dive straight down; the impact turns into forward speed. */
  function slam() {
    const s = heightAt(pos.x, pos.z, t)
    slamFrom = Math.max(0, pos.y - BOTTOM - s)
    const toApex = vel.y > 0 ? vel.y / gravity() : 0
    slamPerfect = vel.y > 0 ? toApex < APEX_WINDOW : apexAt >= 0 && t - apexAt < APEX_WINDOW
    slamEarly = vel.y > 0 && !slamPerfect
    vel.y = Math.min(vel.y, 0) - SLAM_VY
    slamming = true
    // Locked on a puffer: bullet time ends and the jelly zips straight onto it, trailing its colour.
    if (target) {
      diveAt = target
      diveDir.copy(travelDir())
      diveSpeed = horizontalSpeed()
      dashSpeed = Math.max(diveSpeed * DASH_GAIN, DASH_MIN)
      dashT = 0
      aimDash(target)
      slowT = 0
      boostT = BOOST_TIME * 0.6
      boostColor.copy(PUFFER_COLOR)
      jelly.kick(5)
      sfx.zip()
      if (!reducedMotion) {
        blurKick = 1.4
        fovKick += 5
      }
    } else {
      sfx.whoosh()
    }
    if (coachStage === 1) {
      coachStage = 2
      store.set('jelly-coached-slam', '1')
    }
  }

  function press() {
    sfx.unlock()
    if (mode === 'float') jump()
    else if (!slamming) slam()
  }

  /** Signed angle from the flight to the aim (positive turns left); 0 without an aim. */
  function aimAngle() {
    if (!aim) return 0
    const d = travelDir()
    const tx = aim.x - pos.x
    const tz = aim.z - pos.z
    return Math.atan2(d.z * tx - d.x * tz, d.x * tx + d.z * tz)
  }

  /** Turns the flight toward the aim, or along with held arrow keys. The aim is dropped once reached or left behind. */
  function steer(dt: number) {
    const k = Number(keys.right) - Number(keys.left)
    if (k) {
      aim = null
      vel.applyAxisAngle(UP, -k * KEY_RATE * dt)
      return
    }
    // Held down: the same spot on the screen keeps pointing ahead as the camera moves on.
    if (holding && pointer) aimAt(pointer.x, pointer.y)
    if (!aim || diveAt) return
    const d = travelDir()
    if ((aim.x - pos.x) * d.x + (aim.z - pos.z) * d.z < 2) {
      aim = null
      return
    }
    const a = aimAngle()
    vel.applyAxisAngle(UP, Math.max(-AIM_RATE * dt, Math.min(AIM_RATE * dt, a)))
  }

  function contact(s: number) {
    const vh = horizontalSpeed()
    const vy = -vel.y
    const hit = new Vector3(pos.x, s, pos.z)
    const travel = vh > 0.1 ? new Vector3(vel.x / vh, 0, vel.z / vh) : new Vector3()
    const strength = Math.min(vy / 8, 1.5)
    jelly.impact(new Vector3(0, -1, 0), Math.min(0.3 + strength * 0.55, 1), t)

    if (slamming) {
      const near = course.puffers.find((p) => p.live && Math.hypot(p.x - hit.x, p.z - hit.z) < STOMP_R)
      if (near) {
        pos.y = s + BOTTOM + 0.01
        stomp(near)
        return
      }
      // The higher the slam started, the harder the hit and the bigger the forward push.
      slamming = false
      let boost = 0.6 + Math.min(slamFrom / 1.8, 1.2) * 2.6
      if (slamPerfect) boost *= 1.5
      if (slamEarly) boost *= 0.5
      streak = slamPerfect ? streak + 1 : 0
      const speed = Math.min(vh * 0.97 + boost, MAX_SPEED)
      const dir = travelDir()
      vel.x = dir.x * speed
      vel.z = dir.z * speed
      vel.y = Math.min(vy * 0.55, Math.max(4.6, 7.2 - speed * 0.05))
      rising = true
      pos.y = s + BOTTOM + 0.01

      ripples?.drop(hit.x, hit.z, 0.7 + strength * 0.3, -(0.2 + strength * 0.12))
      droplets.burst(hit, new Vector3(), Math.round(24 + strength * 18), 0.9 + strength * 0.35)
      // Rooster tail: spray thrown back along the path.
      droplets.burst(hit, travel.clone().negate(), Math.round(14 + speed * 0.9), 0.7 + Math.min(speed * 0.03, 1), 0.6)
      shake = reducedMotion ? 0 : slamPerfect ? 0.2 : 0.14
      fovKick = reducedMotion ? 0 : slamPerfect ? 7 : 4
      blurKick = reducedMotion ? 0 : slamPerfect ? 1 : 0.6
      sfx.boom(strength)
      if (slamPerfect) {
        sfx.perfect(streak)
        // Above the coach bubble while it is still showing.
        callout.show(pos, '완벽!', t, new Vector3(0, coach.hidden ? 1.4 : 2.5, 0))
      }
      jelly.flashExpression(slamPerfect ? 'happy' : 'skip', 0.35, t)
      return
    }

    // No slam: the water pushes back like a trampoline that loses a little each time.
    streak = 0
    ripples?.drop(hit.x, hit.z, 0.45 + strength * 0.35, -(0.1 + strength * 0.14))
    droplets.burst(hit, travel, Math.round(8 + strength * 16 + vh * 0.5), 0.45 + strength * 0.5 + Math.min(vh * 0.02, 0.5))
    shake = reducedMotion ? 0 : Math.min(0.1, 0.02 + strength * 0.05)
    if (vy > 1.2) {
      vel.y = vy * 0.6
      vel.x *= 0.93
      vel.z *= 0.93
      rising = true
      pos.y = s + BOTTOM + 0.01
      sfx.plip(Math.round(vy))
      jelly.flashExpression('skip', 0.2, t)
      return
    }
    mode = 'float'
    vel.y = -vy * 0.2
    vel.x *= 0.75
    vel.z *= 0.75
    sfx.plop()
  }

  /** The run is over: no score, just a dizzy face if it went anywhere. */
  function endRun() {
    running = false
    aim = null
    if (peak > 6) {
      jelly.flashExpression('dizzy', 1.4, t)
      sfx.bloop()
    }
    streak = 0
    chain = 0
  }

  /** A faster tier: a ring bursts off the jelly, the screen edges glow and the camera punches out. */
  function breakThrough() {
    const color = TIER_COLORS[tier]
    flashEl.style.setProperty('--flash', `#${color.getHexString()}`)
    flash = reducedMotion ? 0.3 : 0.75
    ripples?.drop(pos.x, pos.z, 1.6, -0.3)
    if (!reducedMotion) {
      burst.fire(color)
      fovKick += 6
      blurKick = 1.4
      shake = Math.max(shake, 0.14)
    }
    sfx.tierUp(tier)
    jelly.flashExpression('happy', 0.6, t)
  }

  /**
   * Crossed a gate. Through it: the chain grows, the gate bursts and pays out speed.
   * Around it: the chain breaks and some speed is lost.
   */
  function crossed(pass: boolean, g: Gate) {
    if (!pass) {
      if (!running) return
      misses++
      chain = 0
      vel.x *= MISS_KEEP
      vel.z *= MISS_KEEP
      shake = Math.max(shake, reducedMotion ? 0 : 0.06)
      sfx.miss()
      jelly.flashExpression('dizzy', 0.6, t)
      return
    }
    gates++
    chain++
    if (coachStage === 2 && chain >= 3) {
      // Three in a row: steering has been learned.
      coachStage = 3
      store.set('jelly-coached-steer', '1')
    }
    const color = chainColor()
    const dir = travelDir()
    const speed = Math.min(Math.max(horizontalSpeed(), START_SPEED) + GATE_BOOST, MAX_SPEED)
    vel.x = dir.x * speed
    vel.z = dir.z * speed
    boostT = BOOST_TIME
    boostColor.copy(color)
    // Sparkles fly off along the gate's outline.
    for (let i = 0; i < 20; i++) sparks.burst(course.outline(g, i / 19), color, lowPower ? 1 : 2, 3, 0.6, 1.3)
    jelly.kick(4)
    jelly.flashExpression('happy', 0.4, t)
    sfx.gate(chain)
    flashEl.style.setProperty('--flash', `#${color.getHexString()}`)
    flash = Math.max(flash, reducedMotion ? 0.12 : 0.22)
    if (!reducedMotion) {
      fovKick += 3
      blurKick = Math.max(blurKick, 0.8)
    }
  }

  /** Near misses get help: close before the next gate, the flight bends toward its middle. */
  function assist(dt: number) {
    const a = course.next
    const h = horizontalSpeed()
    if (!a || h < 2 || aim) return
    const rx = pos.x - a.pos.x
    const rz = pos.z - a.pos.z
    const s = rx * a.dir.x + rz * a.dir.z
    const lat = rx * a.right.x + rz * a.right.z
    if (s < -ASSIST_RANGE || s > -0.5 || Math.abs(lat) > GATE_HALF + 1.1) return
    // Aim at a point a little past the middle of the gate.
    const tx = a.pos.x + a.dir.x * 3 - pos.x
    const tz = a.pos.z + a.dir.z * 3 - pos.z
    const cx = vel.x / h
    const cz = vel.z / h
    const angle = Math.atan2(cz * tx - cx * tz, cx * tx + cz * tz)
    vel.applyAxisAngle(UP, Math.max(-ASSIST_RATE * dt, Math.min(ASSIST_RATE * dt, angle)))
  }

  /** The nearest puffer ahead, close to the path, that a slam now would dash onto. */
  function findTarget(): Puffer | null {
    if (mode !== 'air' || slamming) return null
    const dir = travelDir()
    let best: Puffer | null = null
    let bestAhead = LOCK_AHEAD + horizontalSpeed() * LOCK_AHEAD_PER_SPEED
    for (const p of course.puffers) {
      if (!p.live) continue
      const rx = p.x - pos.x
      const rz = p.z - pos.z
      const ahead = rx * dir.x + rz * dir.z
      if (ahead > 0.5 && ahead < bestAhead && Math.abs(rx * dir.z - rz * dir.x) < LOCK_SIDE) {
        best = p
        bestAhead = ahead
      }
    }
    return best
  }

  /** Points the dash at the upper half of `p`. */
  function aimDash(p: Puffer) {
    const tx = p.x - pos.x
    const ty = p.center.y + p.radius * 0.5 - pos.y
    const tz = p.z - pos.z
    const d = Math.hypot(tx, ty, tz) || 1
    vel.set((tx / d) * dashSpeed, (ty / d) * dashSpeed, (tz / d) * dashSpeed)
  }

  /** Slammed onto a puffer: it pops, and the jelly springs off it high and fast. */
  function stomp(p: Puffer) {
    const dir = diveAt === p ? diveDir.clone() : travelDir()
    const base = diveAt === p ? diveSpeed : horizontalSpeed()
    diveAt = null
    p.pop()
    stopT = HIT_STOP
    stomps++
    if (!coachedStomp) {
      coachedStomp = true
      store.set('jelly-coached-stomp', '1')
    }
    const speed = Math.min(Math.max(base, START_SPEED) + STOMP_BOOST * (slamPerfect ? 1.3 : 1), MAX_SPEED)
    vel.set(dir.x * speed, STOMP_VY, dir.z * speed)
    mode = 'air'
    slamming = false
    rising = true
    streak = slamPerfect ? streak + 1 : 0
    sparks.burst(p.center, PUFFER_COLOR, lowPower ? 26 : 44, 7, 0.7, 1.6)
    droplets.burst(new Vector3(p.x, heightAt(p.x, p.z, t), p.z), new Vector3(), 30, 1.1)
    ripples?.drop(p.x, p.z, 1.2, -0.32)
    jelly.impact(new Vector3(0, -1, 0), 0.9, t)
    jelly.flashExpression('happy', 0.5, t)
    sfx.pop()
    if (slamPerfect) {
      sfx.perfect(streak)
      callout.show(pos, '완벽!', t, new Vector3(0, coach.hidden ? 1.4 : 2.5, 0))
    }
    flashEl.style.setProperty('--flash', `#${PUFFER_COLOR.getHexString()}`)
    flash = Math.max(flash, reducedMotion ? 0.15 : 0.35)
    if (!reducedMotion) {
      burst.fire(PUFFER_COLOR)
      shake = Math.max(shake, 0.18)
      fovKick += 6
      blurKick = 1.2
    }
  }

  /** Ran into a puffer without slamming: knocked aside and slowed down, and the chain breaks. */
  function bump(p: Puffer) {
    const away = new Vector3(pos.x - p.x, 0, pos.z - p.z)
    if (away.lengthSq() < 1e-4) away.copy(travelDir()).negate()
    away.normalize()
    p.knock(travelDir())
    bumps++
    chain = 0
    streak = 0
    vel.x = vel.x * BUMP_KEEP + away.x * 3
    vel.z = vel.z * BUMP_KEEP + away.z * 3
    vel.y = Math.max(vel.y, 3.5)
    mode = 'air'
    rising = true
    jelly.impact(away.clone().negate(), 1, t)
    jelly.flashExpression('dizzy', 0.8, t)
    sfx.bonk()
    flashEl.style.setProperty('--flash', '#ff4d3d')
    flash = Math.max(flash, reducedMotion ? 0.15 : 0.35)
    shake = Math.max(shake, reducedMotion ? 0 : 0.12)
  }

  /** Every frame: keep a dash on its puffer, settle touches, and light up the puffer a slam would dash onto. */
  function meetPuffers(dt: number) {
    dashT += dt
    if (diveAt && (!slamming || !diveAt.live || dashT > DASH_TIME)) {
      // The dash ran out: carry on as a plain slam.
      if (slamming) vel.y = -SLAM_VY
      diveAt = null
    }
    if (diveAt) aimDash(diveAt)
    for (const p of course.puffers) {
      if (!p.live || pos.distanceTo(p.center) > 0.55 + p.radius) continue
      if (slamming) stomp(p)
      else bump(p)
      break
    }
    // A fresh lock-on: two blips and a moment of bullet time to react in, once per puffer.
    const next = findTarget()
    if (next && next !== target && !slowed.has(next)) {
      slowed.add(next)
      sfx.lock()
      if (realT - slowAt >= SLOW_GAP) {
        slowAt = realT
        slowT = SLOW_TIME
      }
    }
    target = next
    // The puffer being dashed onto stays marked until it pops.
    course.lock(diveAt ?? target)
  }

  // ── Input: a press jumps or slams and aims the flight at the spot it points to; held down, it keeps aiming as it moves ──
  const aimPlane = new Plane(UP, -AIM_Y)
  const hit = new Vector3()
  /** Aims at the spot under (clientX, clientY). */
  function aimAt(clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(aimPlane, hit)) {
      // Above the horizon: far out along the same bearing.
      const d = ray.ray.direction
      const len = Math.hypot(d.x, d.z) || 1
      hit.set(camera.position.x + (d.x / len) * 80, AIM_Y, camera.position.z + (d.z / len) * 80)
    }
    // The jelly flies above the plane, so a press beside it on the screen lands beside or even behind it on the plane.
    const d = travelDir()
    const rx = hit.x - pos.x
    const rz = hit.z - pos.z
    let ahead = rx * d.x + rz * d.z
    const side = rz * d.x - rx * d.z
    if (ahead < AIM_NEAR) {
      if (Math.abs(side) < 1) {
        aim = null
        return
      }
      ahead = AIM_NEAR
    }
    aim = (aim ?? new Vector3()).set(pos.x + d.x * ahead - d.z * side, AIM_Y, pos.z + d.z * ahead + d.x * side)
    if (coachStage === 2 && Math.abs(aimAngle()) >= 0.2) {
      coachStage = 3
      store.set('jelly-coached-steer', '1')
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    canvas.setPointerCapture(e.pointerId)
    pointer = { x: e.clientX, y: e.clientY }
    holding = true
    aimAt(e.clientX, e.clientY)
    press()
  })
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY }
  })
  const release = () => {
    holding = false
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('pointerleave', () => {
    pointer = null
  })
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true
    if ((e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && !e.repeat) {
      e.preventDefault()
      press()
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false
  })

  // ── Simulation ──
  const yawToward = (target: number, dt: number, rate: number) => {
    const d = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw))
    yaw += d * Math.min(1, dt * rate)
  }
  const tiltToSurface = (dt: number) => {
    const e = 0.45
    const sx = (heightAt(pos.x + e, pos.z, t) - heightAt(pos.x - e, pos.z, t)) / (2 * e)
    const sz = (heightAt(pos.x, pos.z + e, t) - heightAt(pos.x, pos.z - e, t)) / (2 * e)
    pitch += (-Math.atan(sz) * 0.9 - pitch) * Math.min(1, dt * 4)
    roll += (Math.atan(sx) * 0.9 - roll) * Math.min(1, dt * 4)
  }
  // The face always turns toward the camera; the body leans into the direction of travel.
  const facingCamera = () => Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)

  function step(dt: number) {
    if (mode === 'air') {
      const n = Math.ceil(dt / (1 / 240))
      const h = dt / n
      for (let i = 0; i < n && mode === 'air'; i++) {
        if (!diveAt) vel.y -= gravity() * h
        vel.x *= 1 - 0.015 * h
        vel.z *= 1 - 0.015 * h
        pos.addScaledVector(vel, h)
        if (rising && vel.y <= 0) {
          rising = false
          apexAt = t
          if (!slamming) pulse.fire()
        }
        const s = heightAt(pos.x, pos.z, t)
        if (vel.y < 0 && pos.y - BOTTOM <= s) contact(s)
      }
      const lean = Math.min(horizontalSpeed() * 0.012, 0.3)
      pitch += (-lean - pitch) * Math.min(1, dt * 5)
      roll += (0 - roll) * Math.min(1, dt * 5)
      yawToward(facingCamera(), dt, 4)
    } else {
      const s = heightAt(pos.x, pos.z, t)
      vel.y += ((s + FLOAT_LIFT - pos.y) * 30 - vel.y * 5.5) * dt
      // Gliding on the water: friction slowly takes the speed away.
      const drag = Math.exp(-1.3 * dt)
      vel.x *= drag
      vel.z *= drag
      pos.addScaledVector(vel, dt)
      tiltToSurface(dt)
      yawToward(facingCamera(), dt, 3)
      const h = horizontalSpeed()
      if (h > 1.5) {
        wakeT += dt
        if (wakeT > 0.1) {
          wakeT = 0
          ripples?.drop(pos.x, pos.z, 0.4, -0.04)
        }
      }
      stillT = h < STOP_SPEED ? stillT + dt : 0
      if (running && stillT > 0.8) endRun()
    }
    if (running) peak = Math.max(peak, horizontalSpeed())
  }

  // ── Camera: from behind and above. It turns slowly along the course rather than with every swerve, and drops a little with speed ──
  const camPos = new Vector3(0.6, CAM_UP, CAM_BACK)
  const camLook = new Vector3(0, 0.3, -5)
  const right = new Vector3()
  const facing = new Vector3()
  function updateCamera(dt: number) {
    const h = horizontalSpeed()
    // Along the course, leaning toward the jelly's own direction; once the jelly turns well away from the course, it follows the jelly alone.
    const travel = travelDir()
    facing.copy(travel)
    const next = course.next
    if (running && next) {
      const k = CAM_ON_COURSE * clamp01((travel.x * next.dir.x + travel.z * next.dir.z - 0.3) / 0.4)
      facing.multiplyScalar(1 - k).addScaledVector(next.dir, k).normalize()
    }
    if (h > 0.8) heading.lerp(facing, 1 - Math.exp(-dt * CAM_TURN)).normalize()
    const portrait = canvas.clientWidth < canvas.clientHeight
    const back = (portrait ? CAM_BACK_PORTRAIT : CAM_BACK) + Math.min(h * 0.03, 1.2)
    const lift = Math.max(0, pos.y - FLOAT_LIFT)
    right.crossVectors(heading, UP)
    const desired = pos.clone().addScaledVector(heading, -back).addScaledVector(right, 0.6)
    desired.y = (portrait ? CAM_UP_PORTRAIT : CAM_UP) - Math.min(h * 0.012, 0.5) + lift * 0.3
    // Stiffer at speed, so the jelly does not drift away from the camera.
    camPos.lerp(desired, 1 - Math.exp(-dt * (3.5 + h * 0.3)))
    const look = pos.clone().addScaledVector(heading, 6.5 + h * 0.06)
    look.y = 0.3 + lift * 0.4
    camLook.lerp(look, 1 - Math.exp(-dt * 6))
    camera.position.copy(camPos)
    // Hits shake the camera; top speed adds a steady rumble.
    const rumble = reducedMotion ? 0 : clamp01((h - 15) / 30) * 0.02
    camera.position.x += Math.sin(t * 61) * shake + Math.sin(t * 89) * rumble
    camera.position.y += Math.cos(t * 53) * shake * 0.7 + Math.cos(t * 77) * rumble * 0.6
    shake *= Math.exp(-dt * 7)
    camera.lookAt(camLook)
    // Lean into turns.
    const headingYaw = Math.atan2(heading.x, heading.z)
    const turnRate = Math.atan2(Math.sin(headingYaw - lastHeadingYaw), Math.cos(headingYaw - lastHeadingYaw)) / Math.max(dt, 1e-4)
    lastHeadingYaw = headingYaw
    const rollTarget = reducedMotion ? 0 : Math.max(-0.08, Math.min(0.08, -turnRate * 0.15))
    camRoll += (rollTarget - camRoll) * Math.min(1, dt * 4)
    camera.rotateZ(camRoll)
    const speedZoom = Math.min(h * 0.45, reducedMotion ? 5 : 16)
    // Bullet time narrows the view a little.
    const fov = (portrait ? 60 : 50) + speedZoom + fovKick - (reducedMotion ? 0 : (1 - timeScale) * 6)
    fovKick *= Math.exp(-dt * 3)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    dome.position.copy(camera.position)
    // The lights travel with the jelly so its shading never changes with distance.
    sun.position.copy(pos).addScaledVector(SUN_DIR, 40)
    sun.target.position.copy(pos)
    fill.position.copy(pos).add(new Vector3(4, 6, 10))
    fill.target.position.copy(pos)
  }

  // Read-only state for automated play tests, only with ?debug in the URL.
  if (location.search.includes('debug')) {
    const camDir = new Vector3()
    ;(window as unknown as { __jelly?: () => object }).__jelly = () => ({
      camYaw: (camera.getWorldDirection(camDir), Math.atan2(camDir.x, camDir.z)),
      headingYaw: Math.atan2(heading.x, heading.z),
      travelYaw: Math.atan2(travelDir().x, travelDir().z),
      gateAhead: course.next ? (course.next.pos.x - pos.x) * travelDir().x + (course.next.pos.z - pos.z) * travelDir().z : null,
      gateY: course.next ? screenOf(course.next.pos.clone().setY(1)).y : null,
      mode,
      vy: vel.y,
      slamming,
      speed: horizontalSpeed(),
      streak,
      tier,
      chain,
      gates,
      misses,
      jellyX: screenOf(pos).x,
      gateX: course.next ? screenOf(course.next.pos.clone().setY(1)).x : null,
      stompReady: target !== null,
      timeScale,
      aiming: aim !== null,
      stomps,
      bumps,
      objects: scene.children.length,
      pixelRatio,
    })
  }

  // ── Frame ──
  function resize() {
    renderer.setPixelRatio(pixelRatio)
    composer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    camera.aspect = canvas.clientWidth / canvas.clientHeight
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  updateCamera(1)
  course.reset(pos, heading)

  let last = performance.now()
  let slow = 0
  const force = new Vector3()
  const lookV = new Vector2()
  const seaCenter = new Vector3()
  const surface = (x: number, z: number) => heightAt(x, z, t)

  function frame(now: number) {
    const real = Math.min((now - last) / 1000, 1 / 20)
    last = now
    // Time drops at once for bullet time or a pop. A pop's stop ends at once; bullet time eases out over a few frames.
    realT += real
    slowT = Math.max(0, slowT - real)
    stopT = Math.max(0, stopT - real)
    const want = stopT > 0 ? 0.04 : slowT > 0 ? SLOW_SCALE : 1
    timeScale = want <= timeScale || timeScale < SLOW_SCALE ? want : Math.min(want, timeScale + real * 6)
    const dt = real * timeScale
    t += dt

    hovered = Boolean(pointer && mode === 'float' && overJelly(pointer.x, pointer.y))
    if (pointer) {
      const c = screenOf(pos)
      const r = canvas.getBoundingClientRect()
      lookV.set((pointer.x - r.left - c.x) / 240, (c.y - (pointer.y - r.top)) / 240).clampLength(0, 1)
      jelly.pointerLook = lookV
    } else {
      jelly.pointerLook = null
    }
    const speed = horizontalSpeed()
    jelly.mood = slamming
      ? 'charge'
      : mode === 'air'
        ? speed > 12
          ? 'happy'
          : 'fly'
        : hovered
          ? 'hover'
          : running && speed > 1.5
            ? 'swim'
            : 'idle'
    jelly.pressTarget = hovered ? 0.06 : 0

    prevVel.copy(vel)
    steer(dt)
    step(dt)
    assist(dt)
    meetPuffers(dt)
    force.copy(vel).sub(prevVel).divideScalar(Math.max(dt, 1e-4))
    if (mode === 'air') force.y += gravity()
    jelly.root.position.copy(pos)
    jelly.root.rotation.set(pitch, yaw, roll, 'YXZ')
    jelly.update(dt, t, force, vel, mode === 'air')

    // Tiers: breaking into the next one is an event, dropping back is quiet.
    const v = horizontalSpeed()
    if (tier < TIERS.length && v >= TIERS[tier]) {
      tier++
      breakThrough()
    } else if (tier > 0 && v < TIERS[tier - 1] * 0.8) {
      tier--
    }
    tierColor.lerp(TIER_COLORS[tier], 1 - Math.exp(-dt * 4))

    let landed = 0
    droplets.update(
      dt,
      surface,
      (x, z, size) => {
        if (landed++ < 6) ripples?.drop(x, z, 0.1 + size * 2, -0.012 - size * 0.25)
      },
      camera.position,
    )
    pulse.update(dt, pos, camera)
    burst.update(dt, pos, camera)
    updateCamera(dt)
    seaCenter.copy(camera.position).addScaledVector(heading, 18)
    ocean.update(dt, t, pos, seaCenter)
    flecks.update(camera.position.clone().addScaledVector(heading, 10), camera.position, heading, v, surface)
    lanterns.update(t, pos.clone().addScaledVector(heading, 20), camera.position, heading, pos, surface, (side, near) => {
      if (v > 8) sfx.pass(near * clamp01((v - 8) / 30), side * 0.8)
    })
    course.update(dt, t, pos, travelDir(), chainColor(), surface, { gate: crossed, puff: () => sfx.puff() })
    const held = diveAt ?? target
    tether.update(pos, held ? held.center : pos, camera.position, t, held ? 1 : 0)

    // Boost after a gate: the jelly glows and sparkles stream off it.
    const boost = clamp01(boostT / BOOST_TIME)
    boostT = Math.max(0, boostT - dt)
    jelly.glow = boost
    sparkAcc += dt * (lowPower ? 80 : 140) * boost
    for (; sparkAcc >= 1; sparkAcc--) sparks.burst(pos, boostColor, 1, 1.4, 0.45, 1.5)
    sparks.update(dt, camera.position)
    callout.update(t, canvas.clientWidth, canvas.clientHeight)

    // Speed you can feel: streaks from the vanishing point, smeared screen edges, a tighter vignette and rising wind.
    // A boost pushes all of them up for a moment.
    const rush = reducedMotion ? 0 : clamp01((v - 7) / 32 + boost * 0.4)
    const vanish = screenOf(pos.clone().addScaledVector(heading, 60))
    lineColor.copy(tierColor).lerp(boostColor, boost * 0.8).lerp(WHITE, 0.35)
    lines.update(dt, rush, vanish.x, vanish.y, lineColor.getStyle())
    zoom.center.set(vanish.x / canvas.clientWidth, 1 - vanish.y / canvas.clientHeight)
    zoom.strength = rush * 0.05 + blurKick * 0.05
    blurKick *= Math.exp(-dt * 5)
    vignette.darkness = 0.5 + rush * 0.22 + (1 - timeScale) * 0.35
    if (flash > 0) {
      flash = flash < 0.004 ? 0 : flash * Math.exp(-dt * 3.2)
      flashEl.style.opacity = flash.toFixed(3)
    }
    sfx.wind(Math.min(1, v / 47) * (0.4 + 0.6 * timeScale))

    // Coach bubble: the current lesson, or the stomp tip while a puffer waits ahead.
    const dir = travelDir()
    const pufferAhead =
      !coachedStomp &&
      course.puffers.some((p) => {
        const ahead = (p.x - pos.x) * dir.x + (p.z - pos.z) * dir.z
        return p.live && ahead > 0 && ahead < 30
      })
    const hint = pufferAhead ? STOMP_HINT : COACH[coachStage]
    if (hint !== coachShown) {
      coachShown = hint
      coach.hidden = !hint
      if (hint) coachText.textContent = hint
    }
    if (!coach.hidden) {
      const c = screenOf(pos.clone().add(new Vector3(0, 1.25, 0)))
      coach.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`
    }
    composer.render(dt)

    // Keep it smooth on slow GPUs: step the pixel ratio down once frames stay long.
    slow = real > 1 / 40 ? slow + real : Math.max(0, slow - real * 0.5)
    if (slow > 2 && pixelRatio > 1) {
      slow = 0
      pixelRatio = Math.max(1, pixelRatio - 0.25)
      resize()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function menu() {
  const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]')
  const panel = document.querySelector<HTMLElement>('[data-menu]')
  if (!toggle || !panel) return
  const set = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open))
    panel.hidden = !open
  }
  toggle.addEventListener('click', () => set(Boolean(panel.hidden)))
  document.addEventListener('keydown', (e) => e.key === 'Escape' && set(false))
}

menu()
start()
