import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource-variable/jetbrains-mono'
import '../styles/base.css'
import '../styles/layout.css'
import '../styles/play.css'

import {
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
import { Confetti, Droplets, Popups, Trajectory } from './fx'
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

type Mode = 'float' | 'aim' | 'fly' | 'plunge' | 'rest' | 'return'

const HOME = new Vector3(0, 0, 0)
/** Height of the centre above the surface while floating; the belly sits under water. */
const FLOAT_LIFT = 0.24
const G = 9.8
const THROW_RANGE = 7
const IDLE_TEXT = '젤리를 눌러 던지거나, 끌어서 조준하세요.'

function launchVelocity(power: number, aimYaw: number) {
  const vh = 6.5 + power * 7.5
  const vy = 1.8 + power * 2.2
  return new Vector3(Math.sin(aimYaw) * vh, vy, -Math.cos(aimYaw) * vh)
}

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
  const camera = new PerspectiveCamera(45, 1, 0.1, 1500)
  const dome = skyDome(900, true)
  scene.add(dome)

  // Reflections and the jelly's refraction come from the same sky.
  const envScene = new Scene()
  envScene.add(skyDome(50, false))
  scene.environment = new PMREMGenerator(renderer).fromScene(envScene, 0.04).texture

  scene.add(new HemisphereLight('#a48dff', '#05293a', 0.9))
  const sun = new DirectionalLight('#ffc496', 2.3)
  sun.position.copy(SUN_DIR).multiplyScalar(40)
  const fill = new DirectionalLight('#9db2ff', 0.9)
  fill.position.set(4, 6, 10)
  scene.add(sun, fill)

  const canRipple = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
  const ripples = canRipple ? new RippleSim(renderer, -20, -62, 40, 68, lowPower ? 0.25 : 0.125) : null
  const ocean = new Ocean(ripples, lowPower ? 170 : 260)
  scene.add(ocean.mesh)

  const jelly = new Jelly()
  scene.add(jelly.root)
  const droplets = new Droplets(scene, lowPower ? 220 : 520)
  const confetti = new Confetti(scene)
  const trajectory = new Trajectory(scene)
  const popups = new Popups($('[data-pops]'), camera)
  const sfx = new Sfx(store.get('jelly-sound') !== 'off')

  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: lowPower ? 0 : 4 })
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(
    new EffectPass(
      camera,
      new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, intensity: lowPower ? 0.7 : 0.95, radius: 0.7 }),
      new VignetteEffect({ offset: 0.32, darkness: 0.5 }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    ),
  )

  // ── UI ──
  const statusEl = $('[data-status]')
  const skipsEl = $('[data-skips]')
  const bestEl = $('[data-best]')
  const soundBtn = $<HTMLButtonElement>('[data-sound]')
  const coach = $('[data-coach]')
  let coached = store.get('jelly-coached') === '1'
  coach.hidden = coached
  let best = Number(store.get('jelly-best') ?? 0) || 0
  bestEl.textContent = String(best)
  let lastStatus = ''
  const status = (text: string) => {
    if (text === lastStatus) return
    lastStatus = text
    statusEl.textContent = text
  }
  status(IDLE_TEXT)
  const paintSound = () => {
    soundBtn.textContent = sfx.enabled ? '소리 켬' : '소리 끔'
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled))
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
  let modeT = 0
  let t = 0
  const pos = new Vector3(HOME.x, FLOAT_LIFT, HOME.z)
  const vel = new Vector3()
  const prevVel = new Vector3()
  const anchor = HOME.clone()
  let yaw = 0
  let pitch = 0
  let roll = 0
  let spin = 0
  let skips = 0
  let recordRound = false
  let celebrateAt = -1
  let recallBoost = 1
  let strokeT = 0
  let wakeT = 0
  let shake = 0
  let fovKick = 0
  let aimStart: { x: number; y: number } | null = null
  let aimPower = 0
  let aimYaw = 0
  let hovered = false
  let pointer: { x: number; y: number } | null = null

  const setMode = (m: Mode) => {
    mode = m
    modeT = 0
  }
  const distHome = () => Math.hypot(pos.x - HOME.x, pos.z - HOME.z)
  const canThrow = () => (mode === 'float' || mode === 'rest') && distHome() < THROW_RANGE

  const ray = new Raycaster()
  const ndc = new Vector2()
  const screenOf = (p: Vector3) => {
    const v = p.clone().project(camera)
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight }
  }
  const jellyRadiusPx = () => {
    const a = screenOf(pos)
    const b = screenOf(pos.clone().add(new Vector3(0, 0.6, 0)))
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const overJelly = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect()
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (ray.intersectObject(jelly.body, false).length > 0) return true
    const c = screenOf(pos)
    return Math.hypot(c.x - (clientX - r.left), c.y - (clientY - r.top)) < Math.max(56, jellyRadiusPx() * 1.25)
  }

  // ── Actions ──
  function launch(power: number, yawAim: number) {
    sfx.unlock()
    skips = 0
    recordRound = false
    skipsEl.textContent = '0'
    vel.copy(launchVelocity(power, yawAim))
    spin = (9 + power * 12) * (Math.random() < 0.5 ? -1 : 1)
    setMode('fly')
    trajectory.hide()
    jelly.pressTarget = 0
    jelly.kick(6 + power * 4)
    sfx.boing(power)
    const s = heightAt(pos.x, pos.z, t)
    droplets.burst(new Vector3(pos.x, s, pos.z), new Vector3(), Math.round(10 + power * 14), 0.6)
    ripples?.drop(pos.x, pos.z, 0.7, -0.15)
    fovKick = reducedMotion ? 0 : 2.5 + power * 3
    if (!coached) {
      coached = true
      coach.hidden = true
      store.set('jelly-coached', '1')
    }
    status(`던졌습니다 · 힘 ${Math.round(power * 100)}%`)
  }

  const tapThrow = () => launch(0.72 + (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16)

  function recall() {
    if (mode === 'fly' || mode === 'float' || mode === 'aim') return
    recallBoost = 1.8
    setMode('return')
  }

  function contact(s: number) {
    const vh = Math.hypot(vel.x, vel.z)
    const vy = -vel.y
    const angle = Math.atan2(vy, vh)
    const hit = new Vector3(pos.x, s, pos.z)
    const travel = new Vector3(vel.x, 0, vel.z).normalize()
    const strength = Math.min(vy / 5, 1.2)
    ripples?.drop(hit.x, hit.z, 0.45 + strength * 0.35, -(0.1 + strength * 0.14))
    jelly.impact(new Vector3(0, -1, 0), Math.min(0.35 + strength * 0.6, 1), t)
    shake = reducedMotion ? 0 : Math.min(0.14, 0.03 + strength * 0.07)

    // A skip needs speed and a shallow angle, like a flat stone.
    if (vh > 2.4 && angle < 0.5) {
      skips++
      vel.y = vy * (0.52 + Math.random() * 0.12) + vh * 0.045
      const keep = 0.8 + Math.random() * 0.07 - angle * 0.12
      vel.x *= keep
      vel.z *= keep
      pos.y = s + BOTTOM + 0.002
      droplets.burst(hit, travel, Math.round(12 + strength * 22), 0.55 + strength * 0.6)
      sfx.plip(skips)
      jelly.flashExpression('skip', 0.22, t)
      popups.add(hit.clone().add(new Vector3(0, 1.3 + skips * 0.06, 0)), String(skips), 'skip', t)
      skipsEl.textContent = String(skips)
      status(`${skips}번째 튐`)
      spin *= 0.92
      return
    }

    // Plunge: sink, then bob back up.
    setMode('plunge')
    vel.set(vel.x * 0.25, Math.min(vel.y * 0.35, -1.2), vel.z * 0.25)
    ripples?.drop(hit.x, hit.z, 0.95, -0.38)
    droplets.burst(hit, new Vector3(), Math.round(30 + strength * 34), 0.8 + strength * 0.5)
    sfx.bloop()
    shake = reducedMotion ? 0 : 0.12
    if (skips > best) {
      best = skips
      recordRound = true
      store.set('jelly-best', String(best))
      bestEl.textContent = String(best)
      celebrateAt = t + 0.45
    }
    popups.add(hit.clone().setY(s + 1.5), skips ? `${skips}번 튐` : '퐁당!', 'total', t)
    status(skips ? `${skips}번 튀었습니다${recordRound ? ' · 최고 기록!' : ''}` : '퐁당. 바로 가라앉았습니다.')
  }

  // ── Input ──
  canvas.addEventListener('pointerdown', (e) => {
    sfx.unlock()
    if (!overJelly(e.clientX, e.clientY)) return
    if (mode === 'rest' && distHome() >= THROW_RANGE) {
      recall()
      return
    }
    if (!canThrow()) return
    canvas.setPointerCapture(e.pointerId)
    aimStart = { x: e.clientX, y: e.clientY }
    aimPower = 0
    aimYaw = 0
    anchor.set(pos.x, 0, pos.z)
    setMode('aim')
    e.preventDefault()
  })
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY }
    if (mode !== 'aim' || !aimStart) return
    const dx = e.clientX - aimStart.x
    const dy = e.clientY - aimStart.y
    const scale = Math.min(canvas.clientWidth, canvas.clientHeight) * 0.3
    aimPower = Math.min(1, Math.hypot(dx, Math.max(dy, 0)) / scale)
    aimYaw = Math.max(-0.5, Math.min(0.5, Math.atan2(-dx, Math.max(dy, 24))))
  })
  const release = (e: PointerEvent) => {
    if (mode !== 'aim' || !aimStart) return
    const moved = Math.hypot(e.clientX - aimStart.x, e.clientY - aimStart.y)
    aimStart = null
    trajectory.hide()
    jelly.pressTarget = 0
    if (moved < 12) tapThrow()
    else if (aimPower < 0.12) setMode(distHome() < 0.5 ? 'float' : 'rest')
    else launch(aimPower, aimYaw)
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', () => {
    if (mode !== 'aim') return
    aimStart = null
    trajectory.hide()
    jelly.pressTarget = 0
    setMode('float')
  })
  canvas.addEventListener('pointerleave', () => {
    if (mode !== 'aim') pointer = null
  })
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      sfx.unlock()
      if (canThrow()) tapThrow()
      else recall()
    } else if (e.key === 'r' || e.key === 'R') recall()
  })
  $('[data-reset]').addEventListener('click', recall)

  // ── Simulation ──
  const yawToward = (target: number, dt: number, rate: number) => {
    let d = target - yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    yaw += d * Math.min(1, dt * rate)
  }
  const tiltToSurface = (dt: number) => {
    const e = 0.45
    const sx = (heightAt(pos.x + e, pos.z, t) - heightAt(pos.x - e, pos.z, t)) / (2 * e)
    const sz = (heightAt(pos.x, pos.z + e, t) - heightAt(pos.x, pos.z - e, t)) / (2 * e)
    pitch += (-Math.atan(sz) * 0.9 - pitch) * Math.min(1, dt * 4)
    roll += (Math.atan(sx) * 0.9 - roll) * Math.min(1, dt * 4)
  }
  const floatOnSurface = (dt: number, hold: Vector3 | null) => {
    const s = heightAt(pos.x, pos.z, t)
    vel.y += ((s + FLOAT_LIFT - pos.y) * 30 - vel.y * 5.5) * dt
    if (hold) {
      vel.x += ((hold.x - pos.x) * 2 - vel.x * 2.6) * dt
      vel.z += ((hold.z - pos.z) * 2 - vel.z * 2.6) * dt
    } else {
      vel.x *= Math.exp(-2 * dt)
      vel.z *= Math.exp(-2 * dt)
    }
    pos.addScaledVector(vel, dt)
    tiltToSurface(dt)
  }
  const facingCamera = () => Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)

  function step(dt: number) {
    if (mode === 'fly') {
      const n = Math.ceil(dt / (1 / 240))
      const h = dt / n
      for (let i = 0; i < n && mode === 'fly'; i++) {
        vel.y -= G * h
        vel.x *= 1 - 0.04 * h
        vel.z *= 1 - 0.04 * h
        pos.addScaledVector(vel, h)
        const s = heightAt(pos.x, pos.z, t)
        if (vel.y < 0 && pos.y - BOTTOM <= s) contact(s)
      }
      yaw += spin * dt
      pitch += (-0.12 - pitch) * Math.min(1, dt * 4)
      roll += (-vel.x * 0.03 - roll) * Math.min(1, dt * 4)
    } else if (mode === 'plunge') {
      const s = heightAt(pos.x, pos.z, t)
      vel.y += ((s + FLOAT_LIFT - pos.y) * 26 - vel.y * 4.2) * dt
      vel.x *= Math.exp(-2.6 * dt)
      vel.z *= Math.exp(-2.6 * dt)
      pos.addScaledVector(vel, dt)
      spin *= Math.exp(-3.5 * dt)
      yaw += spin * dt
      tiltToSurface(dt)
      if (modeT > 1.1) setMode('rest')
    } else if (mode === 'rest') {
      floatOnSurface(dt, null)
      yawToward(facingCamera(), dt, 2.5)
      if (modeT > 2.4 && !hovered) {
        recallBoost = 1
        setMode('return')
      }
    } else if (mode === 'return') {
      const to = new Vector3(HOME.x - pos.x, 0, HOME.z - pos.z)
      const d = to.length()
      if (d < 0.15) {
        vel.set(0, vel.y, 0)
        setMode('float')
        sfx.pop()
        status(IDLE_TEXT)
      } else {
        to.divideScalar(d)
        const speed = Math.min(2 + d * 0.35, 9) * recallBoost * Math.min(1, 0.3 + modeT * 1.5) * Math.min(1, d / 1.4 + 0.2)
        vel.x += (to.x * speed - vel.x) * Math.min(1, dt * 3)
        vel.z += (to.z * speed - vel.z) * Math.min(1, dt * 3)
        const s = heightAt(pos.x, pos.z, t)
        vel.y += ((s + FLOAT_LIFT - pos.y) * 30 - vel.y * 5.5) * dt
        pos.addScaledVector(vel, dt)
        yawToward(Math.atan2(to.x, to.z), dt, 4)
        tiltToSurface(dt)
        strokeT += dt
        if (strokeT > 0.42) {
          strokeT = 0
          jelly.kick(2.4)
          jelly.impact(new Vector3(-to.x, -0.5, -to.z).normalize(), 0.22, t)
          ripples?.drop(pos.x - to.x * 0.4, pos.z - to.z * 0.4, 0.35, -0.06)
        }
        wakeT += dt
        if (wakeT > 0.14) {
          wakeT = 0
          ripples?.drop(pos.x - to.x * 0.6, pos.z - to.z * 0.6, 0.28, -0.03)
        }
        status('헤엄쳐 돌아오는 중…')
      }
    } else {
      floatOnSurface(dt, mode === 'aim' ? anchor : HOME)
      yawToward(facingCamera(), dt, 3)
    }
  }

  // ── Camera ──
  const camPos = new Vector3(0, 2.4, 7.6)
  const camLook = new Vector3(0, 0.25, -5.5)
  function updateCamera(dt: number) {
    const portrait = canvas.clientWidth < canvas.clientHeight
    const back = portrait ? 9.6 : 7.6
    const height = portrait ? 3 : 2.4
    // Watch from the shore: the camera only drifts a little, so the throw reads as distance.
    const away = Math.max(0, HOME.z - pos.z)
    camPos.lerp(new Vector3(pos.x * 0.25, height + away * 0.05, HOME.z + back - away * 0.22), 1 - Math.exp(-dt * 1.6))
    camLook.lerp(new Vector3(pos.x * 0.7, 0.2 - away * 0.01, Math.min(HOME.z - 5.5, pos.z - 2)), 1 - Math.exp(-dt * 2.4))
    camera.position.copy(camPos)
    if (shake > 0.001) {
      camera.position.x += Math.sin(t * 61) * shake
      camera.position.y += Math.cos(t * 53) * shake * 0.7
      shake *= Math.exp(-dt * 7)
    }
    camera.lookAt(camLook)
    const fov = (portrait ? 58 : 45) + fovKick
    fovKick *= Math.exp(-dt * 2.5)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    dome.position.copy(camera.position)
  }

  // ── Frame ──
  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    renderer.setPixelRatio(pixelRatio)
    composer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  updateCamera(1)

  let last = performance.now()
  let slow = 0
  const force = new Vector3()
  const lookV = new Vector2()

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 20)
    last = now
    t += dt
    modeT += dt

    // Hover and aim feedback.
    hovered = Boolean(pointer && mode !== 'fly' && mode !== 'aim' && canThrow() && overJelly(pointer.x, pointer.y))
    canvas.style.cursor = mode === 'aim' ? 'grabbing' : hovered ? 'grab' : 'default'
    if (mode === 'aim') {
      jelly.pressTarget = 0.1 + aimPower * 0.32
      const { pts, land } = predict(aimPower, aimYaw)
      if (aimPower > 0.12) trajectory.show(pts, land, t)
      else trajectory.hide()
      status(aimPower > 0.12 ? `놓으면 던집니다 · 힘 ${Math.round(aimPower * 20) * 5}%` : '아래로 끌어 힘을 모으세요')
    } else {
      jelly.pressTarget = hovered ? 0.06 : 0
    }
    if (pointer && mode !== 'fly') {
      const c = screenOf(pos)
      const r = canvas.getBoundingClientRect()
      lookV.set((pointer.x - r.left - c.x) / 240, (c.y - (pointer.y - r.top)) / 240).clampLength(0, 1)
      jelly.pointerLook = lookV
    } else {
      jelly.pointerLook = null
    }
    jelly.mood =
      mode === 'aim'
        ? 'charge'
        : mode === 'fly'
          ? 'fly'
          : mode === 'plunge'
            ? 'dizzy'
            : mode === 'return'
              ? 'swim'
              : mode === 'rest' && modeT < 1.5
                ? 'dizzy'
                : hovered
                  ? 'hover'
                  : mode === 'rest' && (recordRound || skips >= 5)
                    ? 'happy'
                    : 'idle'

    prevVel.copy(vel)
    step(dt)
    force.copy(vel).sub(prevVel).divideScalar(Math.max(dt, 1e-4))
    if (mode === 'fly') force.y += G
    jelly.root.position.copy(pos)
    jelly.root.rotation.set(pitch, yaw, roll, 'YXZ')
    jelly.update(dt, t, force, vel, mode === 'fly')

    if (celebrateAt > 0 && t > celebrateAt) {
      celebrateAt = -1
      confetti.burst(pos.clone().add(new Vector3(0, 0.8, 0)))
      sfx.fanfare()
      popups.add(pos.clone().add(new Vector3(0, 3.4, 0)), '최고 기록!', 'record', t)
      jelly.flashExpression('happy', 1.8, t)
    }

    let landed = 0
    droplets.update(
      dt,
      (x, z) => heightAt(x, z, t),
      (x, z, size) => {
        if (landed++ < 6) ripples?.drop(x, z, 0.1 + size * 2, -0.012 - size * 0.25)
      },
    )
    confetti.update(dt)
    ocean.update(dt, t, pos)
    updateCamera(dt)
    popups.update(t, canvas.clientWidth, canvas.clientHeight)
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

  function predict(power: number, yawAim: number) {
    const p = pos.clone()
    const v = launchVelocity(power, yawAim)
    const pts: Vector3[] = []
    let land: Vector3 | null = null
    for (let i = 0; i < 200; i++) {
      const h = 1 / 60
      v.y -= G * h
      p.addScaledVector(v, h)
      const s = heightAt(p.x, p.z, t)
      if (v.y < 0 && p.y - BOTTOM <= s) {
        land = new Vector3(p.x, s, p.z)
        break
      }
      if (i % 2 === 1) pts.push(p.clone().setY(p.y - BOTTOM * 0.5))
    }
    return { pts, land }
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
