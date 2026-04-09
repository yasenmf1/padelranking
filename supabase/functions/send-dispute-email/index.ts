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

    const { match_id, disputer_name, disputer_username, reason, match_date, sets } = await req.json()

    const html = `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>Оспорен мач</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <p style="margin:0 0 8px;font-size:40px;line-height:1;">⚠️</p>
              <h1 style="margin:0;font-size:22px;font-weight:800;color:#f97316;">Оспорен мач</h1>
              <p style="margin:4px 0 0;color:#4b5563;font-size:13px;">Padel Ranking · Admin Panel</p>
            </td>
          </tr>
          <tr>
            <td style="background:#111111;border:1px solid #f97316;border-radius:16px;padding:28px;">
              <p style="margin:0 0 20px;color:#9ca3af;font-size:14px;line-height:1.6;">
                Играч оспори мач в системата. Необходимо е административно решение.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:20px;">
                <tr><td style="padding:16px;">
                  <p style="margin:0 0 8px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Детайли</p>
                  <p style="margin:0 0 6px;color:#e5e7eb;font-size:14px;"><span style="color:#6b7280;">Мач #</span> ${match_id}</p>
                  <p style="margin:0 0 6px;color:#e5e7eb;font-size:14px;"><span style="color:#6b7280;">Дата:</span> ${match_date || '—'}</p>
                  <p style="margin:0 0 6px;color:#e5e7eb;font-size:14px;"><span style="color:#6b7280;">Резултат:</span> ${sets || '—'}</p>
                  <p style="margin:0;color:#e5e7eb;font-size:14px;"><span style="color:#6b7280;">Оспорен от:</span> ${disputer_name} (@${disputer_username})</p>
                </td></tr>
              </table>
              <p style="margin:0 0 8px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Причина</p>
              <div style="background:#1a1a1a;border-left:3px solid #f97316;padding:14px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
                <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.6;">${reason}</p>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="https://padelranking.info/admin"
                       style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:10px;">
                      Към Admin Panel →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:20px;">
              <p style="margin:0;color:#374151;font-size:11px;">Padel Ranking · Автоматично известие</p>
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
        to: ['office@motamo.bg'],
        subject: `⚠️ Оспорен мач #${match_id} от @${disputer_username}`,
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
