import { useState, useEffect } from 'react'

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [canInstall, setCanInstall] = useState(false)

  useEffect(() => {
    function handler(e) {
      e.preventDefault()
      setPromptEvent(e)
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // If already installed (standalone mode), hide prompt
    const mq = window.matchMedia('(display-mode: standalone)')
    if (mq.matches) setCanInstall(false)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function triggerInstall() {
    if (!promptEvent) return null
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    setCanInstall(false)
    return outcome // 'accepted' | 'dismissed'
  }

  return { canInstall, triggerInstall }
}

export function useIsIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    !window.navigator.standalone
}
