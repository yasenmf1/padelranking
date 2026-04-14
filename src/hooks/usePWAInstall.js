import { useState, useEffect } from 'react'

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState(() => window.__pwaInstallPrompt || null)
  const [canInstall, setCanInstall] = useState(
    () => !!window.__pwaInstallPrompt && !window.matchMedia('(display-mode: standalone)').matches
  )

  useEffect(() => {
    // Already captured before React mounted
    if (window.__pwaInstallPrompt) {
      setPromptEvent(window.__pwaInstallPrompt)
      setCanInstall(!window.matchMedia('(display-mode: standalone)').matches)
    }

    // Also listen for future fires (e.g. after install dismissed and re-triggered)
    function handler(e) {
      e.preventDefault()
      window.__pwaInstallPrompt = e
      setPromptEvent(e)
      setCanInstall(!window.matchMedia('(display-mode: standalone)').matches)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide if already running as installed PWA
    const mq = window.matchMedia('(display-mode: standalone)')
    if (mq.matches) setCanInstall(false)

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function triggerInstall() {
    if (!promptEvent) return null
    promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    window.__pwaInstallPrompt = null
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
