import { useState, useEffect } from 'react'
import { usePWAInstall, useIsIOS } from '../../hooks/usePWAInstall'

const DISMISSED_KEY = 'padelranking_install_dismissed'

export default function InstallBanner({ splashDone }) {
  const { canInstall, triggerInstall } = usePWAInstall()
  const isIOS = useIsIOS()
  const [visible, setVisible]   = useState(false)
  const [slideIn, setSlideIn]   = useState(false)
  const [hiding,  setHiding]    = useState(false)

  const isDismissed = !!localStorage.getItem(DISMISSED_KEY)
  const shouldShow  = splashDone && !isDismissed && (canInstall || isIOS)

  useEffect(() => {
    if (!shouldShow) return
    const t = setTimeout(() => {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setSlideIn(true)))
    }, 1500)
    return () => clearTimeout(t)
  }, [shouldShow])

  function dismiss() {
    setHiding(true)
    setTimeout(() => {
      localStorage.setItem(DISMISSED_KEY, '1')
      setVisible(false)
    }, 350)
  }

  async function handleInstall() {
    const outcome = await triggerInstall()
    if (outcome === 'accepted' || outcome === null) dismiss()
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[150] px-4 pb-6 pt-2"
      style={{ pointerEvents: 'none' }}
    >
      <div
        className="max-w-md mx-auto bg-[#111111] border border-[#CCFF00]/30 rounded-2xl p-4 shadow-[0_-4px_40px_#00000080]"
        style={{
          pointerEvents:  'auto',
          transform:      slideIn && !hiding ? 'translateY(0)' : 'translateY(110%)',
          opacity:        slideIn && !hiding ? 1 : 0,
          transition:     'transform 380ms cubic-bezier(0.34,1.56,0.64,1), opacity 300ms ease',
        }}
      >
        {isIOS ? (
          /* ── iOS manual instructions ── */
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xl">📱</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-snug">
                Добави на началния екран
              </p>
              <p className="text-gray-400 text-xs mt-1 leading-relaxed">
                Натисни{' '}
                <span className="inline-flex items-center gap-0.5 text-[#CCFF00] font-semibold">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Сподели
                </span>{' '}
                →{' '}
                <span className="text-[#CCFF00] font-semibold">Add to Home Screen</span>
              </p>
            </div>
            <button onClick={dismiss} className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          /* ── Chrome / Android install prompt ── */
          <div>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center flex-shrink-0 text-xl">
                📱
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm">
                  Добави Padel Ranking на началния екран
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  Използвай като истинско приложение — бързо и офлайн
                </p>
              </div>
              <button onClick={dismiss} className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 py-2.5 bg-[#CCFF00] text-black font-bold text-sm rounded-xl hover:bg-[#b8e600] active:scale-95 transition-all"
              >
                Добави
              </button>
              <button
                onClick={dismiss}
                className="px-4 py-2.5 bg-[#1e1e1e] text-gray-400 text-sm rounded-xl border border-[#2a2a2a] hover:text-white transition-colors"
              >
                По-късно
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
