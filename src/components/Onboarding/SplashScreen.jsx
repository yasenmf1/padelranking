import { useState, useEffect } from 'react'

const STORAGE_KEY = 'padelranking_visited'

const FEATURES = [
  {
    icon: '⚡',
    title: 'ELO рейтинг след всеки мач',
    desc:  'Автоматично изчисляване след потвърждение от противника',
  },
  {
    icon: '🏆',
    title: 'Национална ранглиста',
    desc:  'Сравни се с всички играчи в България',
  },
  {
    icon: '👥',
    title: 'Записвай мачове с партньори',
    desc:  'Двойки (2v2) формат с пълна история',
  },
]

export default function SplashScreen() {
  const [visible, setVisible]   = useState(false)
  const [fadeIn,  setFadeIn]    = useState(false)
  const [fadeOut, setFadeOut]   = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
      // Trigger fade-in on next frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFadeIn(true))
      })
    }
  }, [])

  function handleStart() {
    setFadeOut(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }, 450)
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0a0a0a] flex flex-col items-center justify-between px-6 py-10"
      style={{
        opacity:    fadeOut ? 0 : fadeIn ? 1 : 0,
        transition: 'opacity 450ms ease',
      }}
    >
      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 w-full max-w-sm">

        {/* Logo */}
        <div>
          <div
            className="text-7xl mb-5 select-none"
            style={{
              filter:    'drop-shadow(0 0 24px #CCFF0066)',
              transform: fadeIn ? 'scale(1)' : 'scale(0.85)',
              transition: 'transform 500ms ease',
            }}
          >
            🎾
          </div>
          <h1 className="text-4xl font-black text-[#CCFF00] tracking-tight leading-none">
            Padel Ranking
          </h1>
          <p className="text-gray-400 mt-3 text-base leading-snug">
            Национална ранглиста за падел в България
          </p>
        </div>

        {/* Features */}
        <div className="w-full space-y-3">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-4 bg-[#111111] border border-[#2a2a2a] rounded-xl px-4 py-3.5 text-left"
              style={{
                opacity:    fadeIn ? 1 : 0,
                transform:  fadeIn ? 'translateY(0)' : 'translateY(12px)',
                transition: `opacity 400ms ease ${120 + i * 80}ms, transform 400ms ease ${120 + i * 80}ms`,
              }}
            >
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm leading-snug">{f.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-snug">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div
        className="w-full max-w-sm pt-6"
        style={{
          opacity:    fadeIn ? 1 : 0,
          transform:  fadeIn ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 400ms ease 450ms, transform 400ms ease 450ms',
        }}
      >
        <button
          onClick={handleStart}
          className="w-full py-4 rounded-xl bg-[#CCFF00] text-black font-black text-lg tracking-tight hover:bg-[#b8e600] active:scale-95 transition-all shadow-[0_0_32px_#CCFF0044]"
        >
          Влез в играта →
        </button>
        <p className="text-center text-gray-600 text-xs mt-3">
          Безплатно · Само за играчи в България
        </p>
      </div>
    </div>
  )
}
