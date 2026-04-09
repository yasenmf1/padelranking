import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function leagueEmoji(league: string): string {
  if (league === 'Злато')      return '🥇'
  if (league === 'Сребър')     return '🥈'
  if (league === 'Бронз')      return '🥉'
  return '🌱'
}

function buildHtml(firstName: string, rating: number, league: string): string {
  const emoji = leagueEmoji(league)
  return `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Добре дошъл в Padel Ranking!</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <p style="margin:0 0 10px;font-size:52px;line-height:1;">🎾</p>
              <h1 style="margin:0;font-size:26px;font-weight:800;color:#CCFF00;letter-spacing:-0.5px;">Padel Ranking</h1>
              <p style="margin:6px 0 0;color:#4b5563;font-size:13px;">Националната падел класация на България</p>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #1f2937;border-radius:16px;padding:32px 28px;">

              <!-- Welcome -->
              <h2 style="margin:0 0 10px;font-size:21px;font-weight:700;color:#ffffff;">
                Здравей, ${firstName}! 👋
              </h2>
              <p style="margin:0 0 28px;color:#9ca3af;font-size:15px;line-height:1.65;">
                Добре дошъл в националната падел класация на България.<br>
                Готов ли си да се изкачиш в ранглистата?
              </p>

              <!-- ELO Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f0f0f;border:1px solid #1f2937;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td align="center" style="padding:22px 20px;">
                    <p style="margin:0 0 6px;color:#6b7280;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">НАЧАЛЕН РЕЙТИНГ</p>
                    <p style="margin:0;font-size:52px;font-weight:900;color:#CCFF00;line-height:1.1;">${rating}</p>
                    <p style="margin:8px 0 0;font-size:14px;font-weight:600;color:#e5e7eb;">${emoji} ${league}</p>
                  </td>
                </tr>
              </table>

              <!-- Steps title -->
              <p style="margin:0 0 18px;color:#ffffff;font-size:15px;font-weight:700;">3 стъпки за начало:</p>

              <!-- Step 1 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td width="34" valign="top" style="padding-top:1px;">
                    <div style="width:26px;height:26px;background:#CCFF00;border-radius:50%;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#000000;">1</div>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">Попълни самооценката</p>
                    <p style="margin:3px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">Определи началното си ниво на игра и получи по-точен рейтинг</p>
                  </td>
                </tr>
              </table>

              <!-- Step 2 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
                <tr>
                  <td width="34" valign="top" style="padding-top:1px;">
                    <div style="width:26px;height:26px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:800;color:#9ca3af;">2</div>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">Запиши първия си мач</p>
                    <p style="margin:3px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">Предизвикай опоненти и качи резултата в системата</p>
                  </td>
                </tr>
              </table>

              <!-- Step 3 -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
                <tr>
                  <td width="34" valign="top" style="padding-top:1px;">
                    <div style="width:26px;height:26px;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:800;color:#9ca3af;">3</div>
                  </td>
                  <td style="padding-left:10px;">
                    <p style="margin:0;color:#ffffff;font-size:14px;font-weight:600;">Изкачи се в класацията</p>
                    <p style="margin:3px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">От 🌱 Начинаещи до 🥇 Злато — ти решаваш колко далеч ще стигнеш</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="https://padelranking.info"
                       style="display:inline-block;background:#CCFF00;color:#000000;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:12px;letter-spacing:0.3px;">
                      Към профила →
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;color:#374151;font-size:12px;">
                © Padel Ranking · България ·
                <a href="https://padelranking.info" style="color:#4b5563;text-decoration:none;">padelranking.info</a>
              </p>
              <p style="margin:5px 0 0;color:#374151;font-size:11px;">
                Получаваш този имейл, защото се регистрира в padelranking.info
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }

    const { email, full_name, rating = 500, league = 'Начинаещи' } = await req.json()

    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ error: 'email and full_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const firstName = full_name.split(' ')[0] || full_name

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Padel Ranking <noreply@padelranking.info>',
        to: [email],
        subject: 'Добре дошъл в Padel Ranking! 🎾',
        html: buildHtml(firstName, rating, league),
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data?.message || 'Resend API error')
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
