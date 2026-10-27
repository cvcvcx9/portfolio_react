import { q, say, whileVisible } from './util'

const START = 12
const TRAVEL_MS = 850
const CHECKPOINT_MS = 2500

export function initSync(root: HTMLElement) {
  const dbRevEl = q(root, '[data-db-rev]')
  const dbStateEl = q(root, '[data-db-state]')
  const clientBox = q(root, '[data-client]')
  const clientRevEl = q(root, '[data-client-rev]')
  const clientStateEl = q(root, '[data-client-state]')
  const matchEl = q(root, '[data-match]')
  const wire = q(root, '[data-wire]')
  const commitBtn = q<HTMLButtonElement>(root, '[data-act="commit"]')
  const dropBtn = q<HTMLButtonElement>(root, '[data-act="drop"]')
  const resetBtn = q<HTMLButtonElement>(root, '[data-act="reset"]')
  const cpToggle = q<HTMLInputElement>(root, '[data-checkpoint]')
  const log = q(root, '[data-log]')

  let dbRev = START
  let dbOn = true
  let clientRev = START
  let clientOn = true
  let dropNext = false
  let inflight = 0
  let recovering = false
  let epoch = 0
  let timer = 0

  const label = (on: boolean) => (on ? '구간 A · 급전' : '구간 A · 단전')
  const flash = (el: HTMLElement) => {
    el.classList.remove('is-flash')
    void el.offsetWidth
    el.classList.add('is-flash')
    window.setTimeout(() => el.classList.remove('is-flash'), 450)
  }

  const render = () => {
    dbRevEl.textContent = `r${dbRev}`
    dbStateEl.textContent = label(dbOn)
    clientRevEl.textContent = `r${clientRev}`
    clientStateEl.textContent = label(clientOn)
    const same = clientRev === dbRev
    clientBox.classList.toggle('is-stale', !same && inflight === 0 && !recovering)
    clientBox.classList.toggle('is-recover', recovering)
    matchEl.textContent = recovering ? '재연결 중…' : same ? '일치' : inflight > 0 ? '전달 중…' : `불일치 · r${clientRev} vs r${dbRev}`
  }

  const recover = (why: string) => {
    if (recovering) return
    recovering = true
    const myEpoch = epoch
    say(log, `${why} → 재연결 → 첫 이벤트로 sync.snapshot 수신`, 'warn')
    render()
    window.setTimeout(() => {
      if (myEpoch !== epoch) return
      clientRev = dbRev
      clientOn = dbOn
      recovering = false
      render()
      flash(clientBox)
      say(log, `snapshot r${dbRev} 적용 → 화면이 정본과 일치합니다.`, 'ok')
    }, 750)
  }

  const send = (kind: 'delta' | 'cp', rev: number, on: boolean, lost: boolean) => {
    const myEpoch = epoch
    const dot = document.createElement('span')
    dot.className = `msg${kind === 'cp' ? ' msg--cp' : ''}`
    dot.textContent = kind === 'cp' ? `cp r${rev}` : `r${rev}`
    wire.appendChild(dot)
    const dist = Math.max(40, wire.clientWidth - dot.offsetWidth)
    const frames: Keyframe[] = lost
      ? [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: `translateX(${dist * 0.5}px)`, opacity: 1, offset: 0.55 },
          { transform: `translateX(${dist * 0.55}px) scale(1.6)`, opacity: 0 },
        ]
      : [{ transform: 'translateX(0)' }, { transform: `translateX(${dist}px)` }]
    if (lost) window.setTimeout(() => dot.classList.add('msg--lost'), TRAVEL_MS * 0.5)
    if (kind === 'delta') inflight++
    render()
    const anim = dot.animate(frames, { duration: kind === 'cp' ? TRAVEL_MS * 0.8 : TRAVEL_MS, easing: 'cubic-bezier(.45,.05,.3,1)' })
    anim.onfinish = () => {
      dot.remove()
      if (myEpoch !== epoch) return
      if (kind === 'delta') inflight--
      if (lost) {
        say(log, `r${rev} 발행 유실. 이후 변경이 없으면 번호 차이로도 알 수 없습니다.`, 'bad')
        render()
        return
      }
      if (kind === 'cp') {
        if (clientRev < rev) recover(`checkpoint r${rev} > 적용 r${clientRev}: 뒤처짐 감지`)
        return
      }
      if (rev === clientRev + 1) {
        clientRev = rev
        clientOn = on
        flash(clientBox)
        say(log, `delta r${rev} 적용 (연속 revision).`)
      } else if (rev > clientRev + 1) {
        recover(`r${clientRev + 1}을 건너뛴 r${rev} 도착: 번호 차이로 누락 감지`)
      }
      render()
    }
  }

  const commit = () => {
    dbRev++
    dbOn = !dbOn
    flash(q(root, '.sync__box--db'))
    const lost = dropNext
    dropNext = false
    dropBtn.setAttribute('aria-pressed', 'false')
    say(log, `업무 변경과 revision r${dbRev}을 같은 트랜잭션에 commit → commit 후 발행`)
    render()
    send('delta', dbRev, dbOn, lost)
  }

  const tick = () => {
    if (!cpToggle.checked || recovering) return
    send('cp', dbRev, dbOn, false)
  }

  const reset = () => {
    epoch++
    wire.querySelectorAll('.msg').forEach((m) => m.remove())
    dbRev = START
    dbOn = true
    clientRev = START
    clientOn = true
    inflight = 0
    recovering = false
    dropNext = false
    dropBtn.setAttribute('aria-pressed', 'false')
    render()
    say(log, '‘다음 발행 유실’을 켜고 상태를 한 번만 바꿔 보세요. 그다음 checkpoint를 끄고 다시 해 보세요.')
  }

  commitBtn.addEventListener('click', commit)
  dropBtn.addEventListener('click', () => {
    dropNext = !dropNext
    dropBtn.setAttribute('aria-pressed', String(dropNext))
  })
  resetBtn.addEventListener('click', reset)
  cpToggle.addEventListener('change', () => {
    wire.classList.toggle('no-cp', !cpToggle.checked)
    say(
      log,
      cpToggle.checked
        ? '공유 checkpoint가 Primary revision을 주기적으로 알립니다. 마지막 유실도 찾습니다.'
        : 'checkpoint 없이 마지막 발행이 유실되면, 화면은 다음 변경이 올 때까지 틀린 채로 남습니다.',
      cpToggle.checked ? 'ok' : 'warn',
    )
  })

  whileVisible(root, (visible) => {
    window.clearInterval(timer)
    timer = visible ? window.setInterval(tick, CHECKPOINT_MS) : 0
  })
  render()
}
