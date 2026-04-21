import { serve }       from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// @ts-ignore
import webpush          from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')
    const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
    const VAPID_EMAIL   = Deno.env.get('VAPID_EMAIL') || 'mailto:office@motamo.bg'
    const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: 'VAPID keys not set' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)

    const { city, user_ids, title, body, url, tag } = await req.json()

    // Use service role client to read push_subscriptions (bypasses RLS)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    let query = admin.from('push_subscriptions').select('endpoint, p256dh, auth')
    if (user_ids?.length) {
      // Target specific users (e.g. match participants)
      query = query.in('user_id', user_ids)
    } else if (city) {
      // Broadcast to a city (e.g. matchmaking)
      query = query.eq('city', city)
    }
    const { data: subs } = await query

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'general' })
    let sent = 0
    const stale: string[] = []

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          sent++
        } catch (err: any) {
          // 410 Gone = subscription expired
          if (err.statusCode === 410 || err.statusCode === 404) {
            stale.push(sub.endpoint)
          }
        }
      })
    )

    // Clean up expired subscriptions
    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', stale)
    }

    return new Response(JSON.stringify({ sent, stale: stale.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
