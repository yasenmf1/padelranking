import { useEffect, useState } from 'react'

export default function Toast({ message, duration = 4000, onClose }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)
    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
    }`}>
      <div className="flex items-center gap-3 px-5 py-3 bg-[#1a2e00] border border-[#CCFF00]/50 rounded-xl shadow-2xl max-w-sm">
        <span className="text-[#CCFF00] text-lg flex-shrink-0">✓</span>
        <p className="text-[#CCFF00] text-sm font-medium">{message}</p>
      </div>
    </div>
  )
}
