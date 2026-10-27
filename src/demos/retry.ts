import { isAbort, q, say, sleep } from './util'

// Lane geometry mirrors .retry__track (padding 10, rows 44, gap 34).
const APP_Y = 32
const SERVER_Y = 110
const ATTEMPTS = [
  { x: 17, at: '0.00s', lost: true },
  { x: 45, at: '0.55s', lost: true, wait: '0.5s 후 재시도' },
  { x: 80, at: '1.60s', lost: false, wait: '1s 후 재시도' },
]

export function initRetry(root: HTMLElement) {
  const track = q(root, '[data-track]')
  const guard = q<HTMLInputElement>(root, '[data-guard]')
  const evidenceEl = q(root, '[data-count-evidence]')
  const eventsEl = q(root, '[data-count-events]')
  const responseEl = q(root, '[data-count-response]')
  const stepsEl = q(root, '[data-steps]')
  const submitBtn = q<HTMLButtonElement>(root, '[data-act="submit"]')
  const resetBtn = q<HTMLButtonElement>(root, '[data-act="reset"]')
  const log = q(root, '[data-log]')

  let ctrl: AbortController | null = null
  let evidence = 0
  let events = 0

  const add = (cls: string, style: Partial<CSSStyleDeclaration>, text = '') => {
    const el = document.createElement('span')
    el.className = cls
    Object.assign(el.style, style)
    el.textContent = text
    track.appendChild(el)
    return el
  }

  const line = (time: string, text: string, tone: '' | 'is-bad' | 'is-ok' | 'is-warn' = '') => {
    const li = document.createElement('li')
    if (tone) li.className = tone
    li.innerHTML = `<time>${time}</time><span>${text}</span>`
    stepsEl.appendChild(li)
    stepsEl.scrollTop = stepsEl.scrollHeight
  }

  const counters = (final = false) => {
    evidenceEl.textContent = String(evidence)
    eventsEl.textContent = String(events)
    for (const el of [evidenceEl, eventsEl]) {
      el.classList.toggle('is-bad', final && Number(el.textContent) > 1)
      el.classList.toggle('is-good', final && Number(el.textContent) === 1)
    }
  }

  const grow = async (el: HTMLElement, sig: AbortSignal) => {
    el.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 320, easing: 'ease-out', fill: 'both' })
    await sleep(330, sig)
  }

  const reset = () => {
    ctrl?.abort()
    ctrl = null
    track.querySelectorAll('.retry__dot, .retry__arrow, .retry__gap').forEach((el) => el.remove())
    stepsEl.innerHTML = ''
    evidence = 0
    events = 0
    counters()
    responseEl.textContent = '—'
    responseEl.className = ''
    submitBtn.disabled = false
    say(log, '응답이 두 번 유실되는 상황입니다. 가드를 끄고도 실행해 보세요.')
  }

  const run = async () => {
    reset()
    ctrl = new AbortController()
    const sig = ctrl.signal
    submitBtn.disabled = true
    const guarded = guard.checked
    let completed = false
    try {
      for (let i = 0; i < ATTEMPTS.length; i++) {
        const a = ATTEMPTS[i]
        if (a.wait) {
          add('retry__gap', { left: `${(ATTEMPTS[i - 1].x + a.x) / 2}%` }, a.wait)
          await sleep(i === 1 ? 500 : 900, sig)
        }
        add('retry__dot', { left: `${a.x}%`, top: `${APP_Y}px` }, String(i + 1))
        await grow(add('retry__arrow', { left: `${a.x}%`, top: `${APP_Y + 12}px`, height: `${SERVER_Y - APP_Y - 24}px` }), sig)
        line(a.at, `요청 #${i + 1} → 서버 · 계획 행 잠금(FOR NO KEY UPDATE)`)
        await sleep(260, sig)
        line(a.at, '검증: 권한 ✓ 순서 ✓ 반려 ✓ 계약 ✓')
        await sleep(260, sig)
        if (guarded && completed) {
          add('retry__dot retry__dot--skip', { left: `${a.x}%`, top: `${SERVER_Y}px` }, '↺')
          line(a.at, '이미 COMPLETED → 저장 본문 건너뜀, 완료 응답', 'is-ok')
        } else {
          add('retry__dot retry__dot--write', { left: `${a.x}%`, top: `${SERVER_Y}px` }, 'W')
          evidence++
          events++
          counters()
          line(a.at, completed ? 'INSERT 증빙 · INSERT 스텝 이벤트 (중복!)' : 'INSERT 증빙 · INSERT 스텝 이벤트 → COMPLETED', completed ? 'is-bad' : '')
          completed = true
        }
        await sleep(280, sig)
        const up = add('retry__arrow retry__arrow--up', { left: `${a.x + 3}%`, top: `${APP_Y + 12}px`, height: `${SERVER_Y - APP_Y - 24}px` })
        await grow(up, sig)
        if (a.lost) {
          up.classList.add('is-lost')
          line(a.at, '응답 유실 ✕ — 앱은 결과를 모릅니다', 'is-warn')
          await sleep(320, sig)
        } else {
          responseEl.textContent = '200 · 완료'
          line(a.at, '응답 수신 ✓', 'is-ok')
        }
      }
      counters(true)
      say(
        log,
        guarded
          ? '증빙 1 · 이벤트 1. 별도의 요청 키 없이 기존 잠금과 도메인 상태로 중복을 흡수했습니다.'
          : `증빙 ${evidence} · 이벤트 ${events}. 재시도마다 같은 업무가 다시 실행됐습니다.`,
        guarded ? 'ok' : 'bad',
      )
    } catch (e) {
      if (!isAbort(e)) throw e
      return
    }
    submitBtn.disabled = false
  }

  submitBtn.addEventListener('click', run)
  resetBtn.addEventListener('click', reset)
  guard.addEventListener('change', reset)
  reset()
}
