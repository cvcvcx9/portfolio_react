'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Script from 'next/script'

export default function TrackerGate() {
  const pathname = usePathname()
  const isHome = pathname === '/'
  const [consent, setConsent] = useState('pending')
  const [expanded, setExpanded] = useState(false)
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    if (isHome) return
    const saved = typeof window !== 'undefined' ? localStorage.getItem('trackerConsent') : null
    if (saved === 'accepted' || saved === 'rejected') setConsent(saved)
    if (typeof window !== 'undefined' && window.MongoDashTracker) setScriptReady(true)
  }, [isHome])

  const accept = () => { localStorage.setItem('trackerConsent', 'accepted'); setConsent('accepted') }
  const reject = () => { localStorage.setItem('trackerConsent', 'rejected'); setConsent('rejected') }

  const initTracker = () => {
    if (typeof window === 'undefined') return
    if (window.tracker) return
    if (!window.MongoDashTracker) return
    window.tracker = new window.MongoDashTracker({ apiEndpoint: 'https://api.cvcvcx9.org/api/track' })
    window.tracker.init()
  }

  useEffect(() => {
    if (isHome) return
    if (consent === 'accepted' && scriptReady) {
      initTracker()
    }
  }, [consent, scriptReady, isHome])

  if (isHome) return null

  return (
    <>
      {consent === 'pending' && (
        <div className="fixed bottom-3 left-3 z-50 text-[11px] md:bottom-4 md:left-4 md:text-xs">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 font-medium text-slate-500 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
              aria-label="익명 분석 설정 열기"
            >
              익명 분석 설정
            </button>
          ) : (
            <div className="max-w-[280px] rounded-lg border border-slate-200 bg-white/95 p-3 text-slate-700 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-200">
              <p className="font-semibold text-slate-900 dark:text-white">익명 분석 설정</p>
              <p className="mt-1 leading-relaxed text-slate-500 dark:text-slate-400">
                서비스 개선을 위해 페이지 이벤트만 익명 수집합니다.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={accept}
                  className="rounded-md bg-slate-900 px-3 py-1.5 font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  허용
                </button>
                <button
                  type="button"
                  onClick={reject}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 dark:hover:border-slate-400 dark:hover:text-white"
                >
                  거부
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="ml-auto rounded-md px-2 py-1.5 font-semibold text-slate-400 transition hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="익명 분석 설정 닫기"
                >
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {consent === 'accepted' && (
        <Script
          src="/js/tracker.js"
          strategy="afterInteractive"
          onLoad={() => {
            setScriptReady(true)
            initTracker()
          }}
        />
      )}

    </>
  )
}
