import { isAbort, q, sleep, whileVisible } from './util'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const FAIL_RUN: [string, string][] = [
  ['p', '$ pytest -q'],
  ['', '..........F.........F..........F....  [100%]'],
  ['r', '✕ 컨트롤러가 DTO를 정의함        a.py:42'],
  ['r', '✕ 컨트롤러가 commit()을 호출함   a.py:88'],
  ['r', '✕ 은퇴한 식별자가 부활함         b.py:17'],
  ['r', '3 failed — 리뷰 전에 배포 게이트에서 멈춤'],
  ['d', ''],
  ['d', '# 에이전트가 규칙을 읽고 고친 뒤'],
  ['p', '$ pytest -q'],
  ['', '....................................  [100%]'],
  ['a', '✓ 전부 통과 — 배포 진행'],
]

export function initCi(root: HTMLElement) {
  const code = q(root, '[data-term] code')
  const btn = q<HTMLButtonElement>(root, '[data-act="run"]')
  let ctrl: AbortController | null = null

  const run = async () => {
    ctrl?.abort()
    ctrl = new AbortController()
    const sig = ctrl.signal
    code.innerHTML = ''
    try {
      for (const [tone, text] of FAIL_RUN) {
        const html = tone ? `<span class="${tone}">${esc(text)}</span>` : esc(text)
        if (text.startsWith('.')) {
          // the dots line streams like a real test run
          let shown = ''
          for (const ch of text) {
            shown += ch
            code.innerHTML = code.innerHTML.replace(/​[\s\S]*$/, '') + '​' + colorDots(shown)
            await sleep(ch === '.' || ch === 'F' ? 14 : 0, sig)
          }
          code.innerHTML = code.innerHTML.replace('​', '') + '\n'
        } else {
          code.innerHTML += html + '\n'
          await sleep(text ? 320 : 120, sig)
        }
      }
    } catch (e) {
      if (!isAbort(e)) throw e
    }
  }

  btn.addEventListener('click', run)
  let started = false
  whileVisible(root, (visible) => {
    if (visible && !started) {
      started = true
      run()
    }
  })
}

function colorDots(s: string) {
  return esc(s).replace(/F/g, '<span class="r">F</span>')
}
