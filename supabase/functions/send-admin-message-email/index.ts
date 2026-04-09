import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set')

    const { to_email, to_name, message } = await req.json()

    if (!to_email || !message) {
      return new Response(
        JSON.stringify({ error: 'to_email and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = (to_name || '').split(' ')[0] || to_name || 'Играч'

    const html = `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>Съобщение от администратора</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0 0 8px;font-size:40px;line-height:1;">🎾</p>
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#CCFF00;">Padel Ranking</h1>
              <p style="margin:4px 0 0;color:#4b5563;font-size:13px;">Националната падел класация на България</p>
            </td>
          </tr>
          <tr>
            <td style="background:#111111;border:1px solid #1f2937;border-radius:16px;padding:28px;">
              <h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#ffffff;">
                Здравей, ${firstName}! 👋
              </h2>
              <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;">
                Получаваш съобщение от администратора на Padel Ranking:
              </p>
              <div style="background:#1a1a1a;border-left:3px solid #CCFF00;padding:16px 18px;border-radius:0 10px 10px 0;margin-bottom:24px;">
                <p style="margin:0;color:#ffffff;font-size:15px;line-height:1.7;">${message}</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="https://padelranking.info"
                       style="display:inline-block;background:#CCFF00;color:#000000;font-size:14px;font-weight:800;text-decoration:none;padding:12px 28px;border-radius:10px;">
                      Към профила →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0;color:#374151;font-size:11px;">
                Padel Ranking · <a href="https://padelranking.info" style="color:#4b5563;text-decoration:none;">padelranking.info</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Padel Ranking <noreply@padelranking.info>',
        to: [to_email],
        subject: '📨 Съобщение от администратора — Padel Ranking',
        html,
      }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || 'Resend error')

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
