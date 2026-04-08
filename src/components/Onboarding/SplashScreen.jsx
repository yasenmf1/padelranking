import { useState, useEffect } from 'react'

const STORAGE_KEY = 'padel_onboarding_done'

const features = [
  { icon: '🏆', title: 'Национална ранглиста', desc: 'Класирай се сред най-добрите играчи в България' },
  { icon: '⚡', title: 'ELO рейтинг система', desc: 'Точен алгоритъм за измерване на нивото ти' },
  { icon: '👥', title: '2v2 двойки формат', desc: 'Записвай мачове с партньор срещу друга двойка' },
  { icon: '📱', title: 'Работи като мобилно приложение', desc: 'Инсталирай го на телефона си за бърз достъп' },
]

export default function SplashScreen() {
  const [visible, setVisible] = useState(false)
  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function handleStart() {
    setHiding(true)
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }, 400)
  }

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-between px-6 py-10 transition-opacity duration-400 ${
        hiding ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Top: Logo */}
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 w-full max-w-sm">
        <div>
          <div className="text-7xl mb-4">🎾</div>
          <h1 className="text-4xl font-black text-[#CCFF00] tracking-tight leading-none">
            Padel Ranking
          </h1>
          <p className="text-gray-400 mt-3 text-base leading-snug">
            Националната падел класация на България
          </p>
        </div>

        {/* Feature list */}
        <div className="w-full space-y-3 mt-2">
          {features.map(f => (
            <div
              key={f.title}
              className="flex items-center gap-4 bg-[#111111] border border-[#2a2a2a] rounded-xl px-4 py-3 text-left"
            >
              <span className="text-2xl flex-shrink-0">{f.icon}</span>
              <div>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-gray-500 text-xs mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: CTA */}
      <div className="w-full max-w-sm pt-6">
        <button
          onClick={handleStart}
          className="w-full py-4 rounded-xl bg-[#CCFF00] text-black font-black text-lg tracking-tight hover:bg-[#b8e600] active:scale-95 transition-all"
        >
          Започни игра →
        </button>
        <p className="text-center text-gray-600 text-xs mt-3">
          Безплатно · Без реклами · Made in Bulgaria
        </p>
      </div>
    </div>
  )
}
