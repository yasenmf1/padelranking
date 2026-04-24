import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { usePushNotifications } from '../../hooks/usePushNotifications'

const CITIES = ['София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора', 'Русе', 'Плевен', 'Благоевград']

const TIMES = (() => {
  const slots = []
  for (let h = 7; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 23) slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
})()

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'сега'
  if (mins < 60) return `преди ${mins} мин`
  const h = Math.floor(mins / 60)
  if (h < 24) return `преди ${h} ч`
  return `преди ${Math.floor(h / 24)} дни`
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('bg-BG', { day: 'numeric', month: 'long' })
}

function playersBadge(n) {
  if (n === 1) return 'Търси 1 играч'
  if (n === 2) return 'Търси 2 играча'
  return 'Търси 3 играчи'
}

function leagueIcon(league) {
  if (league === 'Злато')  return '🥇'
  if (league === 'Сребър') return '🥈'
  if (league === 'Бронз')  return '🥉'
  return '🌱'
}

// ── Form ──────────────────────────────────────────────────────────────────
function MatchmakingForm({ onPublished }) {
  const { profile } = useAuth()
  const isAdmin = profile?.is_admin === true

  const [form, setForm] = useState({
    city: 'София', club: '', date: new Date().toISOString().split('T')[0],
    time: '10:00', players_needed: 3, level_preference: 'all',
  })
  const [step,         setStep]         = useState('form') // 'form' | 'notify'
  const [notifyTarget, setNotifyTarget] = useState('same') // 'same' | 'other' | 'all'
  const [notifyCity,   setNotifyCity]   = useState('София')
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  function set(field, val) { setForm(p => ({ ...p, [field]: val })) }

  function handleContinue(e) {
    e.preventDefault()
    if (!form.club.trim()) { setError('Въведи клуб/корт'); return }
    setError('')
    setNotifyCity(form.city)
    setNotifyTarget('same')
    setStep('notify')
  }

  async function handlePublish() {
    setLoading(true)
    setError('')
    try {
      const dt = new Date(`${form.date}T${form.time}:00`)
      dt.setHours(dt.getHours() + 2)

      const payload = {
        user_id:          profile.id,
        city:             form.city,
        club:             form.club.trim(),
        date:             form.date,
        time:             form.time,
        players_needed:   form.players_needed,
        level_preference: form.level_preference,
        status:           'open',
        expires_at:       dt.toISOString(),
      }
      console.log('[Matchmaking] insert payload:', payload)

      const { data: inserted, error: insertErr } = await supabase
        .from('match_requests')
        .insert(payload)
        .select()
      console.log('[Matchmaking] insert result:', { inserted, insertErr })
      if (insertErr) throw insertErr

      const pushCity = notifyTarget === 'all' ? null
                     : notifyTarget === 'other' ? notifyCity
                     : form.city

      supabase.auth.getSession().then(({ data: { session } }) => {
        supabase.functions.invoke('send-push-notification', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: {
            city:  pushCity,
            title: '🎾 Нова заявка за мач!',
            body:  `${profile.full_name?.split(' ')[0]} търси мач в ${form.club} в ${form.time}`,
            url:   '/matchmaking',
          },
        }).catch(e => console.warn('[Matchmaking] push error:', e))
      })

      onPublished?.()
    } catch (err) {
      console.error('[Matchmaking] handlePublish error:', err)
      setError(err.message)
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: notification target ─────────────────────────────────────────
  if (step === 'notify') {
    return (
      <div className="card space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('form')}
            className="text-gray-500 hover:text-white transition-colors text-sm"
          >
            ← Назад
          </button>
          <h2 className="text-lg font-bold text-white">📢 Кой да получи известие?</h2>
        </div>

        <p className="text-gray-400 text-sm">До кой град да изпратим нотификацията?</p>

        <div className="space-y-2">
          {/* Same city */}
          <button
            onClick={() => setNotifyTarget('same')}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-colors text-left ${
              notifyTarget === 'same'
                ? 'border-[#CCFF00]/50 bg-[#CCFF00]/10'
                : 'border-[#2a2a2a] bg-[#111111] hover:border-[#3a3a3a]'
            }`}
          >
            <span className="text-xl">📍</span>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${notifyTarget === 'same' ? 'text-[#CCFF00]' : 'text-white'}`}>
                Същия град
              </p>
              <p className="text-gray-500 text-xs">{form.city}</p>
            </div>
            {notifyTarget === 'same' && <span className="text-[#CCFF00] font-bold">✓</span>}
          </button>

          {/* Specific other city */}
          <button
            onClick={() => setNotifyTarget('other')}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-colors text-left ${
              notifyTarget === 'other'
                ? 'border-[#CCFF00]/50 bg-[#CCFF00]/10'
                : 'border-[#2a2a2a] bg-[#111111] hover:border-[#3a3a3a]'
            }`}
          >
            <span className="text-xl">🎯</span>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${notifyTarget === 'other' ? 'text-[#CCFF00]' : 'text-white'}`}>
                Избери конкретен град
              </p>
              {notifyTarget === 'other' && (
                <select
                  value={notifyCity}
                  onChange={e => { e.stopPropagation(); setNotifyCity(e.target.value) }}
                  onClick={e => e.stopPropagation()}
                  className="input-dark mt-2 text-xs"
                >
                  {CITIES.map(c => <option key={c}>{c}</option>)}
                </select>
              )}
            </div>
            {notifyTarget === 'other' && <span className="text-[#CCFF00] font-bold self-start">✓</span>}
          </button>

          {/* All cities — admin only */}
          {isAdmin && (
            <button
              onClick={() => setNotifyTarget('all')}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-colors text-left ${
                notifyTarget === 'all'
                  ? 'border-[#CCFF00]/50 bg-[#CCFF00]/10'
                  : 'border-[#2a2a2a] bg-[#111111] hover:border-[#3a3a3a]'
              }`}
            >
              <span className="text-xl">🌍</span>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${notifyTarget === 'all' ? 'text-[#CCFF00]' : 'text-white'}`}>
                  Всички градове
                </p>
                <p className="text-gray-500 text-xs">Само за администратори</p>
              </div>
              {notifyTarget === 'all' && <span className="text-[#CCFF00] font-bold">✓</span>}
            </button>
          )}
        </div>

        {error && (
          <p className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</p>
        )}

        <button
          onClick={handlePublish}
          disabled={loading}
          className="btn-neon w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Публикуване...</>
            : 'Публикувай и извести →'}
        </button>
      </div>
    )
  }

  // ── Step 1: form ─────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleContinue} className="card space-y-5">
      <h2 className="text-lg font-bold text-white">🎾 Публикувай заявка за мач</h2>

      {error && (
        <p className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</p>
      )}

      {/* City */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Град</label>
        <select value={form.city} onChange={e => set('city', e.target.value)} className="input-dark">
          {CITIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Club */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1.5">Клуб / Корт</label>
        <input
          type="text" value={form.club} onChange={e => set('club', e.target.value)}
          className="input-dark" placeholder="напр. Padel Sofia, Корт 3" required
        />
      </div>

      {/* Date + Time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Дата</label>
          <input
            type="date" value={form.date} min={new Date().toISOString().split('T')[0]}
            onChange={e => set('date', e.target.value)} className="input-dark" required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">Час</label>
          <select value={form.time} onChange={e => set('time', e.target.value)} className="input-dark">
            {TIMES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Players needed */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Нужни играчи</label>
        <div className="flex gap-2">
          {[1, 2, 3].map(n => (
            <button key={n} type="button" onClick={() => set('players_needed', n)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                form.players_needed === n
                  ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                  : 'bg-[#111111] text-gray-400 border-[#2a2a2a] hover:border-[#CCFF00]/40'
              }`}>
              {n} {n === 1 ? 'играч' : 'играча'}
            </button>
          ))}
        </div>
      </div>

      {/* Level preference */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Ниво</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { val: 'similar',  label: 'Сходно',    icon: '🎯' },
            { val: 'stronger', label: 'По-силни',  icon: '💪' },
            { val: 'all',      label: 'Всички',    icon: '🌍' },
          ].map(({ val, label, icon }) => (
            <button key={val} type="button" onClick={() => set('level_preference', val)}
              className={`py-2.5 rounded-xl text-xs font-bold border transition-colors flex flex-col items-center gap-1 ${
                form.level_preference === val
                  ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                  : 'bg-[#111111] text-gray-400 border-[#2a2a2a] hover:border-[#CCFF00]/40'
              }`}>
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <button type="submit"
        className="btn-neon w-full flex items-center justify-center gap-2">
        Продължи →
      </button>
    </form>
  )
}

// ── Request Card ──────────────────────────────────────────────────────────
function RequestCard({ req, myId, onClose }) {
  const isOwn    = req.user_id === myId
  const [closing, setClosing] = useState(false)

  async function handleClose() {
    setClosing(true)
    try {
      await supabase.from('match_requests').delete().eq('id', req.id)
      onClose?.(req.id)
    } catch { setClosing(false) }
  }

  const profile = req.profile

  return (
    <div className={`p-4 rounded-xl border transition-colors ${
      isOwn ? 'border-[#CCFF00]/30 bg-[#CCFF00]/5' : 'border-[#2a2a2a] bg-[#111111]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-[#CCFF00]/20 flex items-center justify-center text-[#CCFF00] font-black text-sm flex-shrink-0">
            {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-semibold text-sm">{profile?.full_name || 'Играч'}</span>
              {profile?.league && (
                <span className="text-xs text-gray-500">{leagueIcon(profile.league)} {profile.rating} ELO</span>
              )}
              {isOwn && (
                <span className="text-xs bg-[#CCFF00]/20 text-[#CCFF00] px-1.5 py-0.5 rounded-full font-medium">твоята</span>
              )}
            </div>
            <p className="text-gray-400 text-xs mt-0.5">{timeAgo(req.created_at)}</p>
          </div>
        </div>

        {isOwn && (
          <button onClick={handleClose} disabled={closing}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-40">
            {closing ? '...' : 'Затвори'}
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 p-2.5 bg-[#1a1a1a] rounded-lg">
          <span className="text-base">📍</span>
          <div>
            <p className="text-xs text-gray-500">Локация</p>
            <p className="text-white text-sm font-medium">{req.city}</p>
            <p className="text-gray-400 text-xs">{req.club}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 bg-[#1a1a1a] rounded-lg">
          <span className="text-base">🕐</span>
          <div>
            <p className="text-xs text-gray-500">Кога</p>
            <p className="text-white text-sm font-medium">{formatDate(req.date)}</p>
            <p className="text-gray-400 text-xs">{req.time.slice(0, 5)}</p>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20">
          👥 {playersBadge(req.players_needed)}
        </span>
        {req.level_preference && req.level_preference !== 'all' && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#1a1a1a] text-gray-400 border border-[#2a2a2a]">
            {req.level_preference === 'similar' ? '🎯 Сходно ниво' : '💪 По-силни'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Push subscribe banner ─────────────────────────────────────────────────
function PushBanner({ profile, city }) {
  const { canPush, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications(profile?.id, city)
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem('push_banner_dismissed'))

  if (!canPush || dismissed) return null

  if (isSubscribed) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 bg-[#CCFF00]/5 border border-[#CCFF00]/20 rounded-xl text-sm">
        <span className="text-[#CCFF00] text-xs">🔔 Push нотификации активни за {city}</span>
        <button onClick={unsubscribe} disabled={isLoading} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
          Изключи
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-3.5 bg-[#111111] border border-[#2a2a2a] rounded-xl">
      <span className="text-2xl flex-shrink-0">🔔</span>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">Получавай известия за нови мачове</p>
        <p className="text-gray-500 text-xs mt-0.5">Ще те известяваме при нова заявка в {city}</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={subscribe} disabled={isLoading}
          className="px-3 py-1.5 bg-[#CCFF00] text-black text-xs font-bold rounded-lg hover:bg-[#bbee00] transition-colors disabled:opacity-50">
          {isLoading ? '...' : 'Активирай'}
        </button>
        <button onClick={() => { localStorage.setItem('push_banner_dismissed', '1'); setDismissed(true) }}
          className="p-1.5 text-gray-600 hover:text-gray-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function MatchmakingPage() {
  const { profile } = useAuth()
  const [tab,       setTab]       = useState('list') // list | form
  const [requests,  setRequests]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [cityFilter, setCityFilter] = useState('Всички')
  const channelRef = useRef(null)

  useEffect(() => {
    fetchRequests()
    subscribeRealtime()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function fetchRequests() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('match_requests')
        .select(`*, profile:profiles(id, full_name, rating, league, username)`)
        .eq('status', 'open')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (data) setRequests(data)
    } finally { setLoading(false) }
  }

  function subscribeRealtime() {
    // Use unique channel name to avoid conflicts when component remounts
    const channelName = `match_requests_live_${Date.now()}`
    channelRef.current = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_requests' },
        () => fetchRequests()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Matchmaking] Realtime unavailable, polling disabled')
        }
      })
  }

  function handleClose(id) {
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  const cities = ['Всички', ...new Set(requests.map(r => r.city))]
  const filtered = cityFilter === 'Всички'
    ? requests
    : requests.filter(r => r.city === cityFilter)

  const myCity = profile?.clubs?.city || 'София'

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">🎾 Търся мач</h1>
          <p className="text-gray-500 text-sm mt-0.5">Намери партньори за игра</p>
        </div>
        <span className="text-sm font-bold text-[#CCFF00] bg-[#CCFF00]/10 px-3 py-1.5 rounded-full border border-[#CCFF00]/20">
          {requests.length} активни
        </span>
      </div>

      {/* Push banner */}
      <PushBanner profile={profile} city={cityFilter !== 'Всички' ? cityFilter : myCity} />

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('list')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            tab === 'list' ? 'bg-[#CCFF00] text-black' : 'bg-[#111111] text-gray-400 border border-[#2a2a2a] hover:text-white'
          }`}>
          📋 Заявки ({requests.length})
        </button>
        <button onClick={() => setTab('form')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            tab === 'form' ? 'bg-[#CCFF00] text-black' : 'bg-[#111111] text-gray-400 border border-[#2a2a2a] hover:text-white'
          }`}>
          ➕ Публикувай
        </button>
      </div>

      {/* List tab */}
      {tab === 'list' && (
        <div className="space-y-4">
          {/* City filter */}
          {cities.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {cities.map(c => (
                <button key={c} onClick={() => setCityFilter(c)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    cityFilter === c ? 'bg-[#CCFF00] text-black' : 'bg-[#111111] text-gray-400 border border-[#2a2a2a] hover:text-white'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Зареждане...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-5xl mb-4">🎾</p>
              <p className="text-white font-semibold mb-1">Няма активни заявки</p>
              <p className="text-gray-500 text-sm mb-5">
                {cityFilter !== 'Всички' ? `Няма заявки в ${cityFilter}.` : 'Бъди първият!'}</p>
              <button onClick={() => setTab('form')}
                className="btn-neon px-6 py-2.5 text-sm">
                ➕ Публикувай заявка
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(req => (
                <RequestCard key={req.id} req={req} myId={profile?.id} onClose={handleClose} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Form tab */}
      {tab === 'form' && (
        <MatchmakingForm onPublished={() => { setTab('list'); fetchRequests() }} />
      )}
    </div>
  )
}
