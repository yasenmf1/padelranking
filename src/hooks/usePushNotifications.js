import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function usePushNotifications(userId, city) {
  const [isSupported, setIsSupported]   = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading]       = useState(false)

  const canPush = isSupported && !!VAPID_PUBLIC_KEY

  useEffect(() => {
    setIsSupported('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)
  }, [])

  useEffect(() => {
    if (!isSupported || !userId) return
    checkSubscription()
  }, [isSupported, userId])

  async function checkSubscription() {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setIsSubscribed(!!sub)
    } catch { /* ignore */ }
  }

  async function subscribe() {
    if (!canPush || !userId) return
    setIsLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const key  = sub.getKey('p256dh')
      const auth = sub.getKey('auth')

      await supabase.from('push_subscriptions').upsert({
        user_id:  userId,
        endpoint: sub.endpoint,
        p256dh:   btoa(String.fromCharCode(...new Uint8Array(key))),
        auth:     btoa(String.fromCharCode(...new Uint8Array(auth))),
        city:     city || null,
      }, { onConflict: 'endpoint' })

      setIsSubscribed(true)
    } catch (err) {
      console.error('Push subscribe error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function unsubscribe() {
    setIsLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setIsSubscribed(false)
    } catch (err) {
      console.error('Push unsubscribe error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return { canPush, isSubscribed, isLoading, subscribe, unsubscribe }
}
