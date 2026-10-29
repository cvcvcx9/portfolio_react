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
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing'
import { Ocean, RippleSim, SUN_DIR, heightAt, skyDome } from './ocean'
import { BOTTOM, Jelly } from './jelly'
import { Callout, Droplets, Flecks, Lanterns, Pulse, Sparks, SpeedLines, ZoomBlurEffect } from './fx'
import { ARCH_R, Course, type Arch } from './course'
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
/** Forward speed each arch flown through adds, and how long its glow and sparkle trail last (seconds). */
const GATE_BOOST = 2.5
const BOOST_TIME = 0.8
/** Share of the forward speed kept after flying around an arch instead of through it. */
const MISS_KEEP = 0.85
/** Within this distance before an arch, the flight bends toward its middle (radians per second). */
const ASSIST_RANGE = 16
const ASSIST_RATE = 0.75
const COACH = ['클릭하면 점프!', '꼭대기에서 한 번 더 클릭 → 내리꽂기!', '고리 쪽을 클릭하면 그쪽으로 꺾어요']
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
  // 0: teach the jump, 1: the slam, 2: steering toward the arches, 3: done.
  let coachStage = store.get('jelly-coached-steer') === '1' ? 3 : store.get('jelly-coached-slam') === '1' ? 2 : 0
  const showCoach = () => {
    coach.hidden = coachStage >= COACH.length
    if (coachStage < COACH.length) coachText.textContent = COACH[coachStage]
  }
  showCoach()
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

  // A run starts with the first jump and ends when the jelly comes to rest. Nothing is scored.
  let running = false
  let peak = 0
  let streak = 0
  let tier = 0
  const tierColor = TIER_COLORS[0].clone()
  const lineColor = new Color()
  let flash = 0
  let blurKick = 0
  // Arches flown through in a row; every third one moves the arches to the next colour.
  let chain = 0
  let gates = 0
  let misses = 0
  const chainColor = () => TIER_COLORS[Math.min(TIER_COLORS.length - 1, Math.floor(chain / 3))]
  // After an arch: seconds of boost left and its colour.
  let boostT = 0
  const boostColor = new Color()
  let sparkAcc = 0

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
  function jump(steer: number) {
    const h = horizontalSpeed()
    const dir = travelDir().applyAxisAngle(UP, -steer * 0.3)
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
      showCoach()
    }
  }

  /** In the air: dive straight down; the impact turns into forward speed. */
  function slam(steer: number) {
    const s = heightAt(pos.x, pos.z, t)
    slamFrom = Math.max(0, pos.y - BOTTOM - s)
    const toApex = vel.y > 0 ? vel.y / gravity() : 0
    slamPerfect = vel.y > 0 ? toApex < APEX_WINDOW : apexAt >= 0 && t - apexAt < APEX_WINDOW
    slamEarly = vel.y > 0 && !slamPerfect
    if (steer) {
      const dir = travelDir().applyAxisAngle(UP, -steer * 0.25)
      const h = horizontalSpeed()
      vel.x = dir.x * h
      vel.z = dir.z * h
    }
    vel.y = Math.min(vel.y, 0) - SLAM_VY
    slamming = true
    sfx.whoosh()
    if (coachStage === 1) {
      coachStage = 2
      showCoach()
      store.set('jelly-coached-slam', '1')
    }
  }

  function press(steer: number) {
    sfx.unlock()
    if (mode === 'float') jump(steer)
    else if (!slamming) slam(steer)
    else return
    if (coachStage === 2 && Math.abs(steer) >= 0.35) {
      coachStage = 3
      showCoach()
      store.set('jelly-coached-steer', '1')
    }
  }

  function contact(s: number) {
    const vh = horizontalSpeed()
    const vy = -vel.y
    const hit = new Vector3(pos.x, s, pos.z)
    const travel = vh > 0.1 ? new Vector3(vel.x / vh, 0, vel.z / vh) : new Vector3()
    const strength = Math.min(vy / 8, 1.5)
    jelly.impact(new Vector3(0, -1, 0), Math.min(0.3 + strength * 0.55, 1), t)

    if (slamming) {
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
        callout.show(pos, '완벽!', t, new Vector3(0, coach.hidden ? 1.4 : 2.1, 0))
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
   * Crossed an arch. Through it: the chain grows, the arch bursts and pays out speed.
   * Around it: the chain breaks and some speed is lost.
   */
  function gate(pass: boolean, arch: Arch) {
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
      showCoach()
      store.set('jelly-coached-steer', '1')
    }
    const color = chainColor()
    const dir = travelDir()
    const speed = Math.min(Math.max(horizontalSpeed(), START_SPEED) + GATE_BOOST, MAX_SPEED)
    vel.x = dir.x * speed
    vel.z = dir.z * speed
    boostT = BOOST_TIME
    boostColor.copy(color)
    // Sparkles fly off along the arch's curve.
    for (let i = 0; i < 20; i++) {
      const a = 0.15 + (i / 19) * (Math.PI - 0.3)
      const at = arch.pos.clone().addScaledVector(arch.right, Math.cos(a) * ARCH_R)
      at.y = Math.sin(a) * ARCH_R
      sparks.burst(at, color, lowPower ? 1 : 2, 3, 0.6, 1.3)
    }
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

  /** Near misses get help: close before the next arch, the flight bends toward its middle. */
  function assist(dt: number) {
    const a = course.next
    const h = horizontalSpeed()
    if (!a || h < 2) return
    const rx = pos.x - a.pos.x
    const rz = pos.z - a.pos.z
    const s = rx * a.dir.x + rz * a.dir.z
    const lat = rx * a.right.x + rz * a.right.z
    if (s < -ASSIST_RANGE || s > -0.5 || Math.abs(lat) > ARCH_R + 1.4) return
    // Aim at a point a little past the middle of the arch.
    const tx = a.pos.x + a.dir.x * 3 - pos.x
    const tz = a.pos.z + a.dir.z * 3 - pos.z
    const cx = vel.x / h
    const cz = vel.z / h
    const angle = Math.atan2(cz * tx - cx * tz, cx * tx + cz * tz)
    vel.applyAxisAngle(UP, Math.max(-ASSIST_RATE * dt, Math.min(ASSIST_RATE * dt, angle)))
  }

  // ── Input ──
  const steerFrom = (clientX: number) => {
    const r = canvas.getBoundingClientRect()
    const c = screenOf(pos)
    const x = (clientX - r.left - c.x) / (r.width * 0.22)
    return Math.abs(x) < 0.1 ? 0 : Math.max(-1, Math.min(1, x))
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    press(steerFrom(e.clientX))
  })
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY }
  })
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
      press(Number(keys.right) - Number(keys.left))
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
        vel.y -= gravity() * h
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

  // ── Camera: chases from behind, drops lower and tilts into turns as speed grows ──
  const camPos = new Vector3(0.9, 2.5, 7.2)
  const camLook = new Vector3(0, 0.4, -5)
  const right = new Vector3()
  function updateCamera(dt: number) {
    const h = horizontalSpeed()
    if (h > 0.8) heading.lerp(new Vector3(vel.x / h, 0, vel.z / h), 1 - Math.exp(-dt * 2.5)).normalize()
    const portrait = canvas.clientWidth < canvas.clientHeight
    const back = (portrait ? 9 : 7.2) + Math.min(h * 0.03, 1.2)
    const lift = Math.max(0, pos.y - FLOAT_LIFT)
    right.crossVectors(heading, UP)
    const desired = pos.clone().addScaledVector(heading, -back).addScaledVector(right, 0.9)
    desired.y = (portrait ? 3 : 2.5) - Math.min(h * 0.015, 0.7) + lift * 0.45
    // Stiffer at speed, so the jelly does not drift away from the camera.
    camPos.lerp(desired, 1 - Math.exp(-dt * (3.5 + h * 0.3)))
    const look = pos.clone().addScaledVector(heading, 5 + h * 0.1)
    look.y = 0.35 + lift * 0.6
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
    const rollTarget = reducedMotion ? 0 : Math.max(-0.14, Math.min(0.14, -turnRate * 0.2))
    camRoll += (rollTarget - camRoll) * Math.min(1, dt * 4)
    camera.rotateZ(camRoll)
    const speedZoom = Math.min(h * 0.45, reducedMotion ? 5 : 16)
    const fov = (portrait ? 60 : 50) + speedZoom + fovKick
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
    ;(window as unknown as { __jelly?: () => object }).__jelly = () => ({
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
      archX: course.next ? screenOf(course.next.pos.clone().setY(1)).x : null,
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
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now
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
    step(dt)
    assist(dt)
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
    course.update(dt, t, pos, travelDir(), chainColor(), gate)

    // Boost after an arch: the jelly glows and sparkles stream off it.
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
    vignette.darkness = 0.5 + rush * 0.22
    if (flash > 0) {
      flash = flash < 0.004 ? 0 : flash * Math.exp(-dt * 3.2)
      flashEl.style.opacity = flash.toFixed(3)
    }
    sfx.wind(Math.min(1, v / 47))

    if (!coach.hidden) {
      const c = screenOf(pos.clone().add(new Vector3(0, 1.25, 0)))
      coach.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`
    }
    composer.render(dt)

    // Keep it smooth on slow GPUs: step the pixel ratio down once frames stay long.
    slow = dt > 1 / 40 ? slow + dt : Math.max(0, slow - dt * 0.5)
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
