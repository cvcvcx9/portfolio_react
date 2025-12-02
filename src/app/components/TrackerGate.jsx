'use client'
import { useEffect, useState } from 'react'
import Script from 'next/script'

export default function TrackerGate() {
  const [consent, setConsent] = useState('pending')
  const [scriptReady, setScriptReady] = useState(false)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('trackerConsent') : null
    if (saved === 'accepted' || saved === 'rejected') setConsent(saved)
    if (typeof window !== 'undefined' && window.MongoDashTracker) setScriptReady(true)
  }, [])

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
    if (consent === 'accepted' && scriptReady) {
      initTracker()
    }
  }, [consent, scriptReady])

  return (
    <>
      {consent === 'pending' && (
        <div className="fixed bottom-4 left-4 right-4 md:right-auto md:max-w-md rounded-lg bg-slate-900 text-white p-4 shadow-lg z-50">
          <p className="font-semibold">사용자 행동 추적을 허용하시겠어요?</p>
          <p className="text-sm text-slate-200">서비스 개선을 위해 페이지 이벤트를 익명 수집합니다.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={accept} className="rounded bg-blue-500 px-3 py-2 text-sm font-semibold">허용</button>
            <button onClick={reject} className="rounded border border-slate-500 px-3 py-2 text-sm">거부</button>
          </div>
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
