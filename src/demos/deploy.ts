import { isAbort, q, qa, say, sleep } from './util'

type Mode = 'before' | 'after'
type StepState = 'active' | 'done' | 'warn' | 'fail' | ''

const OLD = '7f3a2c1'
const NEW = 'b81e9d4'

const CAPTION: Record<Mode, string> = {
  before: '앱 서비스가 host 포트를 직접 열고, 모든 서비스가 start-first로 교체됩니다. 수렴 체크는 타임아웃이 나면 “계속 진행”합니다.',
  after: '엣지(Traefik)가 host 포트를 소유하고, 앱은 overlay 뒤에서 start-first로 교체됩니다. 성공은 UpdateStatus와 서빙 태그로 판정합니다.',
}

const HINT: Record<Mode, string> = {
  before: '‘배포 실행’을 누르세요. 변경 전 구성에서 파이프라인이 무엇을 보고하는지 보세요.',
  after: '‘배포 실행’을 누르세요. ‘readiness 실패 주입’을 켜고 다시 실행해 보세요.',
}

export function initDeploy(root: HTMLElement) {
  const modeBtns = qa<HTMLButtonElement>(root, '[data-mode]')
  const caption = q(root, '[data-deploy-caption]')
  const portOwner = q(root, '[data-port-owner]')
  const edge = q(root, '[data-edge]')
  const oldTask = q(root, '[data-task="old"]')
  const newTask = q(root, '[data-task="new"]')
  const checks = qa(root, '[data-check]')
  const steps = qa(root, '[data-pstep]')
  const converge = q(root, '[data-converge]')
  const result = q(root, '[data-presult]')
  const verdict = q(root, '[data-verdict]')
  const serving = q(root, '[data-serving]')
  const verdictText = q(root, '[data-verdict-text]')
  const deployBtn = q<HTMLButtonElement>(root, '[data-act="deploy"]')
  const failBtn = q<HTMLButtonElement>(root, '[data-act="fail"]')
  const resetBtn = q<HTMLButtonElement>(root, '[data-act="reset"]')
  const log = q(root, '[data-log]')

  let mode: Mode = 'before'
  let injectFail = false
  let ctrl: AbortController | null = null

  const task = (el: HTMLElement, cls: string, state: string) => {
    el.className = `dd__task ${cls}`.trim()
    q(el, '[data-state]').textContent = state
  }
  const step = (name: string, state: StepState) => {
    const el = steps.find((s) => s.dataset.pstep === name)
    if (!el) return
    el.classList.remove('is-active', 'is-done', 'is-warn', 'is-fail')
    if (state) el.classList.add(`is-${state}`)
  }

  const reset = () => {
    ctrl?.abort()
    ctrl = null
    task(oldTask, 'is-run', 'Running')
    task(newTask, '', '—')
    checks.forEach((c) => c.classList.remove('is-ok', 'is-bad'))
    steps.forEach((s) => s.classList.remove('is-active', 'is-done', 'is-warn', 'is-fail'))
    converge.textContent = '—'
    result.textContent = '파이프라인 —'
    result.classList.remove('is-green', 'is-red')
    verdict.classList.remove('is-bad', 'is-good')
    serving.textContent = OLD
    verdictText.textContent = '배포 전'
    edge.classList.toggle('is-on', mode === 'after')
    portOwner.textContent = mode === 'after' ? '엣지 소유' : '앱 소유'
    caption.textContent = CAPTION[mode]
    failBtn.disabled = mode !== 'after'
    deployBtn.disabled = false
    modeBtns.forEach((b) => (b.disabled = false))
    say(log, HINT[mode])
  }

  const finish = (good: boolean, text: string) => {
    verdict.classList.add(good ? 'is-good' : 'is-bad')
    verdictText.textContent = text
  }

  const runBefore = async (sig: AbortSignal) => {
    task(newTask, 'is-pending', 'Pending · host 포트 사용 중')
    say(log, '신 태스크가 Pending입니다. 구 태스크가 host 포트 :443을 쥐고 있어서 단일 노드에서는 영원히 뜰 수 없습니다.', 'warn')
    await sleep(1300, sig)
    step('rollout', 'warn')
    step('converge', 'active')
    for (let s = 0; s <= 180; s += 12) {
      converge.textContent = `대기 ${s}s / 180s`
      await sleep(80, sig)
    }
    converge.textContent = '타임아웃 → 계속 진행'
    step('converge', 'warn')
    await sleep(400, sig)
    result.textContent = '파이프라인 ✓ 성공'
    result.classList.add('is-green')
    await sleep(500, sig)
    finish(false, '불일치 — “무배포 green”')
    say(log, '잡은 초록인데 서빙 중인 코드는 그대로입니다. 판정 불능을 성공으로 처리했습니다. 실제로는 사흘 치 배포가 이렇게 묻혔습니다.', 'bad')
  }

  const runAfter = async (sig: AbortSignal) => {
    task(newTask, 'is-start', 'Starting')
    say(log, '신 태스크를 먼저 띄웁니다. host 포트는 엣지가 쥐고 있어 충돌이 없습니다.')
    for (const c of checks) {
      await sleep(420, sig)
      if (injectFail && c.dataset.check === 'key') {
        c.classList.add('is-bad')
        task(newTask, 'is-fail', 'readiness 503 · 키 조회 실패')
        say(log, 'readiness가 실패한 항목을 이름으로 보고합니다. 트래픽은 아직 구 태스크에 있습니다.', 'warn')
        await sleep(1100, sig)
        task(newTask, 'is-dead', '롤백됨')
        step('rollout', 'fail')
        step('converge', 'active')
        converge.textContent = 'UpdateStatus = rollback_completed'
        await sleep(700, sig)
        step('converge', 'fail')
        result.textContent = '파이프라인 ✕ 실패 (롤백 감지)'
        result.classList.add('is-red')
        finish(true, '정직한 실패 — 구 버전 유지')
        say(log, 'exit code가 아니라 UpdateStatus로 판정해 롤백을 실패로 보고합니다. 결함이 프로덕션 업로드 실패가 아니라 배포 시점의 503으로 드러났습니다.', 'ok')
        return
      }
      c.classList.add('is-ok')
    }
    task(newTask, 'is-run', 'Ready')
    await sleep(500, sig)
    task(oldTask, 'is-drain', 'Draining')
    say(log, 'readiness 통과 → 엣지가 트래픽을 신 태스크로 넘기고, 구 태스크는 처리 중인 요청을 마칩니다.')
    await sleep(900, sig)
    task(oldTask, 'is-dead', '종료')
    step('rollout', 'done')
    step('converge', 'active')
    converge.textContent = 'UpdateStatus = updating'
    await sleep(700, sig)
    converge.textContent = 'UpdateStatus = completed'
    step('converge', 'done')
    result.textContent = '파이프라인 ✓ 성공'
    result.classList.add('is-green')
    serving.textContent = NEW
    finish(true, '일치 — 새 코드가 서빙 중')
    say(log, '성공의 정의: 서빙 중인 이미지 태그 = 머지 커밋 SHA. 롤링 중 연속 요청은 끊기지 않습니다.', 'ok')
  }

  const run = async () => {
    reset()
    ctrl = new AbortController()
    const sig = ctrl.signal
    deployBtn.disabled = true
    failBtn.disabled = true
    modeBtns.forEach((b) => (b.disabled = true))
    try {
      step('build', 'active')
      say(log, `이미지 빌드: app:${NEW} (per-commit 태그)`)
      await sleep(700, sig)
      step('build', 'done')
      step('migrate', 'active')
      say(log, 'expand-only 마이그레이션을 롤링 전에 한 번만 실행합니다. 신·구 코드가 같은 스키마에서 함께 동작합니다.')
      await sleep(800, sig)
      step('migrate', 'done')
      step('rollout', 'active')
      task(newTask, 'is-start', 'Created')
      await sleep(500, sig)
      if (mode === 'before') await runBefore(sig)
      else await runAfter(sig)
    } catch (e) {
      if (!isAbort(e)) throw e
      return
    }
    deployBtn.disabled = false
    failBtn.disabled = mode !== 'after'
    modeBtns.forEach((b) => (b.disabled = false))
  }

  modeBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode as Mode
      modeBtns.forEach((b) => b.setAttribute('aria-checked', String(b === btn)))
      reset()
    }),
  )
  deployBtn.addEventListener('click', run)
  resetBtn.addEventListener('click', reset)
  failBtn.addEventListener('click', () => {
    injectFail = !injectFail
    failBtn.setAttribute('aria-pressed', String(injectFail))
  })
  reset()
}
