import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
// ELO is now applied server-side via admin_resolve_match RPC

const CITIES_BG = ['София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора', 'Русе', 'Плевен', 'Благоевград']

export default function AdminPanel() {
  const { profile } = useAuth()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('players')
  const [players, setPlayers] = useState([])
  const [matches, setMatches] = useState([])
  const [disputes, setDisputes] = useState([])
  const [messages, setMessages] = useState([])
  const [matchFilter, setMatchFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastTarget, setBroadcastTarget] = useState('all') // 'all' | 'city' | 'player'
  const [broadcastCity, setBroadcastCity] = useState('София')
  const [broadcastPlayerId, setBroadcastPlayerId] = useState('')
  const [broadcastPlayers, setBroadcastPlayers] = useState([])
  const [playerSearch, setPlayerSearch] = useState('')
  const [showPlayerList, setShowPlayerList] = useState(false)
  const playerSearchRef = useRef(null)
  const [playerMessages, setPlayerMessages] = useState({}) // { [matchId]: text }
  const [playerMsgLoading, setPlayerMsgLoading] = useState({}) // { [matchId]: bool }

  const TABS = [
    { key: 'players',  label: t('admin.tabs.players') },
    { key: 'matches',  label: t('admin.tabs.matches') },
    { key: 'disputed', label: t('admin.tabs.disputed') },
    { key: 'messages', label: t('admin.tabs.messages') },
  ]

  const STATUS_LABEL = {
    pending:   { text: t('admin.matches.statusPending'),  cls: 'bg-yellow-500/20 text-yellow-400' },
    confirmed: { text: t('matchList.statusConfirmed'),     cls: 'bg-[#CCFF00]/20 text-[#CCFF00]' },
    approved:  { text: t('admin.matches.statusApproved'), cls: 'bg-[#CCFF00]/20 text-[#CCFF00]' },
    disputed:  { text: t('matchList.statusDisputed'),      cls: 'bg-orange-500/20 text-orange-400' },
    expired:   { text: t('matchList.statusExpired'),       cls: 'bg-[#2a2a2a] text-gray-500' },
    rejected:  { text: t('admin.matches.statusRejected'), cls: 'bg-red-500/20 text-red-400' },
  }

  useEffect(() => {
    if (activeTab === 'players')  fetchPlayers()
    else if (activeTab === 'matches')  fetchMatches()
    else if (activeTab === 'disputed') fetchDisputes()
    else if (activeTab === 'messages') { fetchMessages(); fetchBroadcastPlayers() }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'matches') fetchMatches()
  }, [matchFilter])

  // ── Fetch ──────────────────────────────────────────────

  const PLAYER_JOIN = `
    player1:profiles!matches_player1_id_fkey(id, full_name, username, rating, approved_matches),
    player2:profiles!matches_player2_id_fkey(id, full_name, username, rating, approved_matches),
    player3:profiles!matches_player3_id_fkey(id, full_name, username, rating, approved_matches),
    player4:profiles!matches_player4_id_fkey(id, full_name, username, rating, approved_matches),
    clubs(name, city)
  `

  async function fetchPlayers() {
    setLoading(true)
    try {
      const { data } = await supabase.from('profiles').select('*, clubs(name, city)').order('created_at', { ascending: false })
      if (data) setPlayers(data)
    } catch { setError(t('admin.players.errorLoad')) }
    finally { setLoading(false) }
  }

  async function fetchMatches() {
    setLoading(true)
    try {
      let q = supabase.from('matches').select(`*, ${PLAYER_JOIN}`).order('created_at', { ascending: false })
      if (matchFilter !== 'all') q = q.eq('status', matchFilter)
      const { data } = await q
      if (data) setMatches(data)
    } catch { setError(t('admin.players.errorLoad')) }
    finally { setLoading(false) }
  }

  async function fetchDisputes() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('matches')
        .select(`*, ${PLAYER_JOIN},
          disputer:profiles!matches_disputed_by_fkey(id, full_name, username)`)
        .eq('status', 'disputed')
        .order('created_at', { ascending: false })
      if (data) setDisputes(data)
    } catch { setError(t('admin.players.errorLoad')) }
    finally { setLoading(false) }
  }

  async function fetchBroadcastPlayers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, clubs(city)')
      .order('full_name')
    if (data) setBroadcastPlayers(data)
  }

  async function fetchMessages() {
    setLoading(true)
    try {
      const { data } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false })
      if (data) setMessages(data)
    } catch { setError(t('admin.players.errorLoad')) }
    finally { setLoading(false) }
  }

  // ── Player actions ─────────────────────────────────────

  async function deletePlayer(player) {
    if (!window.confirm(t('admin.players.deleteConfirm', { name: player.full_name, username: player.username }))) return
    setActionLoading(p => ({ ...p, [player.id]: 'deleting' }))
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', player.id)
      if (error) throw error
      setPlayers(prev => prev.filter(p => p.id !== player.id))
      showSuccess(t('admin.players.deleteSuccess'))
    } catch (err) { setError(err.message) }
    finally { setActionLoading(p => ({ ...p, [player.id]: null })) }
  }

  // ── Match actions (legacy pending → approved) ──────────

  async function approveMatch(match) {
    setActionLoading(p => ({ ...p, [match.id]: 'approving' }))
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
        p_match_id: match.id, p_action: 'approve',
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)
      const d1Str = (data.d1 >= 0 ? '+' : '') + data.d1
      const d2Str = (data.d2 >= 0 ? '+' : '') + data.d2
      showSuccess(t('admin.matches.approveSuccess', {
        t1: data.t1_avg, n1: data.new_t1_avg, d1: d1Str,
        t2: data.t2_avg, n2: data.new_t2_avg, d2: d2Str,
      }))
      fetchMatches()
    } catch (err) { setError(err.message) }
    finally { setActionLoading(p => ({ ...p, [match.id]: null })) }
  }

  async function rejectMatch(match) {
    setActionLoading(p => ({ ...p, [match.id]: 'rejecting' }))
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
        p_match_id: match.id, p_action: 'reject',
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)
      showSuccess(t('admin.matches.rejectSuccess'))
      fetchMatches()
    } catch (err) { setError(err.message) }
    finally { setActionLoading(p => ({ ...p, [match.id]: null })) }
  }

  // ── Dispute actions ────────────────────────────────────

  async function approveDispute(match) {
    setActionLoading(p => ({ ...p, [match.id]: 'approving' }))
    setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
        p_match_id: match.id, p_action: 'approve',
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)
      const d1Str = (data.d1 >= 0 ? '+' : '') + data.d1
      const d2Str = (data.d2 >= 0 ? '+' : '') + data.d2
      showSuccess(t('admin.disputed.approveSuccess', {
        t1: data.t1_avg, n1: data.new_t1_avg, d1: d1Str,
        t2: data.t2_avg, n2: data.new_t2_avg, d2: d2Str,
      }))
      fetchDisputes()
    } catch (err) { setError(err.message) }
    finally { setActionLoading(p => ({ ...p, [match.id]: null })) }
  }

  async function rejectDispute(match) {
    setActionLoading(p => ({ ...p, [match.id]: 'rejecting' }))
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
        p_match_id: match.id, p_action: 'reject',
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)
      showSuccess(t('admin.disputed.rejectSuccess'))
      fetchDisputes()
    } catch (err) { setError(err.message) }
    finally { setActionLoading(p => ({ ...p, [match.id]: null })) }
  }

  // ── Broadcast ──────────────────────────────────────────
  async function sendBroadcast() {
    if (!broadcastMsg.trim()) return
    if (broadcastTarget === 'player' && !broadcastPlayerId) { setError('Избери играч'); return }
    setBroadcastLoading(true)
    setError('')
    try {
      if (broadcastTarget === 'all') {
        const { data, error: rpcErr } = await supabase.rpc('admin_broadcast_notification', {
          p_message: broadcastMsg.trim(),
        })
        if (rpcErr) throw rpcErr
        showSuccess(`Съобщението е изпратено до ${data} играча.`)
      } else if (broadcastTarget === 'city') {
        const cityPlayers = broadcastPlayers.filter(p => p.clubs?.city === broadcastCity)
        if (cityPlayers.length === 0) { showSuccess(`Няма играчи от ${broadcastCity}.`); return }
        for (const p of cityPlayers) {
          await supabase.rpc('admin_send_notification', { p_user_id: p.id, p_message: broadcastMsg.trim() })
        }
        showSuccess(`Съобщението е изпратено до ${cityPlayers.length} играча от ${broadcastCity}.`)
      } else if (broadcastTarget === 'player') {
        const { error: rpcErr } = await supabase.rpc('admin_send_notification', {
          p_user_id: broadcastPlayerId,
          p_message: broadcastMsg.trim(),
        })
        if (rpcErr) throw rpcErr
        const name = broadcastPlayers.find(p => p.id === broadcastPlayerId)?.full_name || 'играча'
        showSuccess(`Съобщението е изпратено до ${name}.`)
      }
      setBroadcastMsg('')
    } catch (err) { setError(err.message) }
    finally { setBroadcastLoading(false) }
  }

  // ── Send message to specific player ───────────────────
  async function sendPlayerMessage(match) {
    const msg = playerMessages[match.id]?.trim()
    if (!msg) return
    const targetPlayer = match.disputer || match.player3 || match.player1
    if (!targetPlayer) return

    setPlayerMsgLoading(p => ({ ...p, [match.id]: true }))
    setError('')
    try {
      const { error: rpcErr } = await supabase.rpc('admin_send_notification', {
        p_user_id: targetPlayer.id,
        p_message: msg,
      })
      if (rpcErr) throw rpcErr

      // Email (non-blocking)
      supabase.functions.invoke('send-admin-message-email', {
        body: {
          to_email: targetPlayer.email || '',
          to_name:  targetPlayer.full_name || '',
          message:  msg,
        },
      }).catch(() => {})

      setPlayerMessages(p => ({ ...p, [match.id]: '' }))
      showSuccess(`Съобщението е изпратено до ${targetPlayer.full_name}.`)
    } catch (err) { setError(err.message) }
    finally { setPlayerMsgLoading(p => ({ ...p, [match.id]: false })) }
  }

  // ── Message actions ────────────────────────────────────

  async function markRead(msg) {
    try {
      await supabase.from('contact_messages').update({ is_read: true }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m))
    } catch (err) { setError(err.message) }
  }

  // ── Helpers ────────────────────────────────────────────

  function showSuccess(msg) { setSuccess(msg); setTimeout(() => setSuccess(''), 5000) }

  function formatDate(str) {
    return new Date(str).toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatSets(setsData) {
    if (!setsData || !Array.isArray(setsData)) return '-'
    return setsData.map(s => `${s.p1}-${s.p2}`).join(', ')
  }

  const unreadCount = messages.filter(m => !m.is_read).length
  const disputeCount = disputes.length

  const Spinner = () => (
    <div className="py-10 text-center text-gray-500">
      <div className="w-8 h-8 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
      {t('common.loading')}
    </div>
  )

  // ── Shared match card ─────────────────────────────────

  function MatchCard({ match, actions }) {
    const status = STATUS_LABEL[match.status] || STATUS_LABEL.pending
    const setsData = match.sets_data || []
    let t1W = 0, t2W = 0
    for (const s of setsData) {
      if (s.p1 > s.p2) t1W++
      else if (s.p2 > s.p1) t2W++
    }
    return (
      <div className={`card ${match.status === 'pending' ? 'border-yellow-500/20 bg-yellow-500/5' : match.status === 'disputed' ? 'border-orange-500/20 bg-orange-500/5' : ''}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-gray-500">#{match.id}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.text}</span>
              <span className="text-xs text-gray-500">{match.match_type?.toUpperCase()}</span>
              <span className="text-xs text-gray-600">{formatDate(match.played_at)}</span>
              {match.clubs && <span className="text-xs text-gray-600">{match.clubs.name}</span>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-0.5">{t('admin.matches.team1')}</p>
                <p className="text-white text-sm font-medium leading-tight">{match.player1?.full_name}</p>
                <p className="text-white text-sm font-medium leading-tight">{match.player2?.full_name}</p>
              </div>
              <div className="text-center flex-shrink-0">
                <p className="text-[#CCFF00] font-mono font-black text-xl">{t1W} – {t2W}</p>
                <p className="text-gray-600 text-xs">{formatSets(setsData)}</p>
              </div>
              <div className="flex-1 text-right">
                <p className="text-xs text-gray-500 mb-0.5">{t('admin.matches.team2')}</p>
                <p className="text-white text-sm font-medium leading-tight">{match.player3?.full_name}</p>
                <p className="text-white text-sm font-medium leading-tight">{match.player4?.full_name}</p>
              </div>
            </div>
          </div>
          {actions}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>
        <span className="league-badge bg-red-500/20 text-red-400 border border-red-500/30">{t('common.admin')}</span>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>}
      {success && <div className="p-3 bg-[#CCFF00]/10 border border-[#CCFF00]/30 rounded-lg text-[#CCFF00] text-sm">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#2a2a2a] overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 flex-shrink-0 ${
              activeTab === tab.key ? 'border-[#CCFF00] text-[#CCFF00]' : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
            {tab.key === 'messages' && unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {unreadCount}
              </span>
            )}
            {tab.key === 'disputed' && disputeCount > 0 && (
              <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {disputeCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── PLAYERS ── */}
      {activeTab === 'players' && (
        <div>
          <p className="text-gray-400 text-sm mb-4">{t('admin.players.count', { n: players.length })}</p>
          {loading ? <Spinner /> : (
            <div className="overflow-x-auto card p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="text-left text-xs text-gray-500 uppercase px-4 py-3">{t('admin.players.colPlayer')}</th>
                    <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 hidden sm:table-cell">{t('admin.players.colEmail')}</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">{t('admin.players.colElo')}</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">{t('admin.players.colMatches')}</th>
                    <th className="text-left text-xs text-gray-500 uppercase px-4 py-3 hidden md:table-cell">{t('admin.players.colDate')}</th>
                    <th className="text-center text-xs text-gray-500 uppercase px-4 py-3">{t('admin.players.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(player => (
                    <tr key={player.id} className="border-b border-[#1a1a1a] hover:bg-[#181818] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium text-sm">{player.full_name}</p>
                        <p className="text-gray-500 text-xs">@{player.username}</p>
                        {player.is_admin && <span className="text-xs text-red-400">{t('common.admin')}</span>}
                        {player.is_ranked && <span className="text-xs text-[#CCFF00] ml-1">{t('common.ranked')}</span>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="text-gray-400 text-xs">{player.email}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[#CCFF00] font-bold">{player.rating}</span>
                        <p className="text-gray-600 text-xs">{t(`leagues.${player.league}`) || player.league}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">{player.approved_matches || 0}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">{formatDate(player.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => deletePlayer(player)}
                          disabled={!!actionLoading[player.id] || player.email === 'office@motamo.bg'}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {actionLoading[player.id] === 'deleting'
                            ? <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            : t('admin.players.deleteBtn')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MATCHES ── */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'pending',   label: t('admin.matches.filterPending') },
              { key: 'confirmed', label: t('matchList.tabs.confirmed') },
              { key: 'approved',  label: t('admin.matches.filterApproved') },
              { key: 'rejected',  label: t('admin.matches.filterRejected') },
              { key: 'all',       label: t('admin.matches.filterAll') },
            ].map(f => (
              <button key={f.key} onClick={() => setMatchFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  matchFilter === f.key ? 'bg-[#CCFF00] text-black' : 'bg-[#1e1e1e] text-gray-400 hover:text-white'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-gray-400 text-sm">{t('admin.matches.count', { n: matches.length })}</p>
          {loading ? <Spinner /> : matches.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-white font-medium">{t('admin.matches.noMatches')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map(match => (
                <MatchCard key={match.id} match={match} actions={
                  match.status === 'pending' ? (
                    <div className="flex sm:flex-col gap-2 flex-shrink-0">
                      <button onClick={() => approveMatch(match)} disabled={!!actionLoading[match.id]}
                        className="flex-1 sm:flex-none px-4 py-2 bg-[#CCFF00] text-black text-sm font-bold rounded-lg hover:bg-[#bbee00] transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                        {actionLoading[match.id] === 'approving'
                          ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          : t('admin.matches.approveBtn')}
                      </button>
                      <button onClick={() => rejectMatch(match)} disabled={!!actionLoading[match.id]}
                        className="flex-1 sm:flex-none px-4 py-2 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                        {actionLoading[match.id] === 'rejecting'
                          ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : t('admin.matches.rejectBtn')}
                      </button>
                    </div>
                  ) : null
                } />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DISPUTED ── */}
      {activeTab === 'disputed' && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">{t('admin.disputed.count', { n: disputes.length })}</p>
          {loading ? <Spinner /> : disputes.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-white font-medium">{t('admin.disputed.none')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {disputes.map(match => (
                <div key={match.id} className="card border-orange-500/20 bg-orange-500/5 space-y-4">
                  {/* Teams */}
                  <MatchCard match={match} actions={null} />

                  {/* Dispute info */}
                  <div className="p-3 bg-[#1a1a1a] rounded-lg border border-orange-500/20 space-y-2">
                    {match.disputer && (
                      <p className="text-xs text-gray-400">
                        <span className="text-orange-400 font-semibold">{t('admin.disputed.disputedBy')}:</span>{' '}
                        {match.disputer.full_name} (@{match.disputer.username})
                      </p>
                    )}
                    {match.dispute_reason && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">{t('admin.disputed.reason')}</p>
                        <p className="text-sm text-white leading-relaxed">{match.dispute_reason}</p>
                      </div>
                    )}
                  </div>

                  {/* Message to player */}
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-gray-500 font-medium">✉️ Изпрати съобщение до играча</p>
                    <textarea
                      value={playerMessages[match.id] || ''}
                      onChange={e => setPlayerMessages(p => ({ ...p, [match.id]: e.target.value }))}
                      className="input-dark resize-none w-full text-sm"
                      rows={2}
                      placeholder="Съобщение до оспорващия играч..."
                    />
                    <button
                      onClick={() => sendPlayerMessage(match)}
                      disabled={playerMsgLoading[match.id] || !playerMessages[match.id]?.trim()}
                      className="w-full py-2 bg-[#1e1e1e] text-gray-300 text-xs font-semibold rounded-lg border border-[#2a2a2a] hover:border-[#CCFF00]/30 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      {playerMsgLoading[match.id]
                        ? <><div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />Изпращане...</>
                        : '✉️ Изпрати съобщение + имейл'}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button onClick={() => approveDispute(match)} disabled={!!actionLoading[match.id]}
                      className="flex-1 py-2.5 bg-[#CCFF00] text-black text-sm font-bold rounded-lg hover:bg-[#bbee00] transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                      {actionLoading[match.id] === 'approving'
                        ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        : t('admin.disputed.approveBtn')}
                    </button>
                    <button onClick={() => rejectDispute(match)} disabled={!!actionLoading[match.id]}
                      className="flex-1 py-2.5 bg-red-500/20 text-red-400 text-sm font-semibold rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
                      {actionLoading[match.id] === 'rejecting'
                        ? <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        : t('admin.disputed.rejectBtn')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MESSAGES ── */}
      {activeTab === 'messages' && (
        <div className="space-y-4">
          {/* Broadcast section */}
          <div className="card border-[#CCFF00]/20 bg-[#CCFF00]/5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">📢</span>
              <h3 className="text-sm font-bold text-white">Изпрати известие</h3>
            </div>

            {/* Target selector */}
            <div className="space-y-2">
              {/* All players */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                broadcastTarget === 'all' ? 'border-[#CCFF00]/40 bg-[#CCFF00]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}>
                <input type="radio" name="bTarget" value="all"
                  checked={broadcastTarget === 'all'}
                  onChange={() => setBroadcastTarget('all')}
                  className="accent-[#CCFF00]" />
                <span className="text-lg">🌍</span>
                <span className={`text-sm font-medium ${broadcastTarget === 'all' ? 'text-[#CCFF00]' : 'text-white'}`}>
                  До всички играчи
                </span>
              </label>

              {/* By city */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                broadcastTarget === 'city' ? 'border-[#CCFF00]/40 bg-[#CCFF00]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}>
                <input type="radio" name="bTarget" value="city"
                  checked={broadcastTarget === 'city'}
                  onChange={() => setBroadcastTarget('city')}
                  className="accent-[#CCFF00] mt-0.5" />
                <span className="text-lg">📍</span>
                <div className="flex-1">
                  <span className={`text-sm font-medium ${broadcastTarget === 'city' ? 'text-[#CCFF00]' : 'text-white'}`}>
                    До играчи от град
                  </span>
                  {broadcastTarget === 'city' && (
                    <select
                      value={broadcastCity}
                      onChange={e => { e.stopPropagation(); setBroadcastCity(e.target.value) }}
                      onClick={e => e.stopPropagation()}
                      className="input-dark mt-2 text-sm"
                    >
                      {CITIES_BG.map(c => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              </label>

              {/* Specific player */}
              <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                broadcastTarget === 'player' ? 'border-[#CCFF00]/40 bg-[#CCFF00]/5' : 'border-[#2a2a2a] hover:border-[#3a3a3a]'
              }`}>
                <input type="radio" name="bTarget" value="player"
                  checked={broadcastTarget === 'player'}
                  onChange={() => setBroadcastTarget('player')}
                  className="accent-[#CCFF00] mt-0.5" />
                <span className="text-lg">👤</span>
                <div className="flex-1 relative" ref={playerSearchRef}>
                  <span className={`text-sm font-medium ${broadcastTarget === 'player' ? 'text-[#CCFF00]' : 'text-white'}`}>
                    До конкретен играч
                  </span>
                  {broadcastTarget === 'player' && (
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      {broadcastPlayerId ? (
                        <div className="flex items-center justify-between p-2 bg-[#1a1a1a] rounded-lg border border-[#CCFF00]/30">
                          <span className="text-sm text-white font-medium">
                            {broadcastPlayers.find(p => p.id === broadcastPlayerId)?.full_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setBroadcastPlayerId(''); setPlayerSearch('') }}
                            className="text-gray-500 hover:text-white text-xs ml-2"
                          >✕</button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={playerSearch}
                            onChange={e => { setPlayerSearch(e.target.value); setShowPlayerList(true) }}
                            onFocus={() => setShowPlayerList(true)}
                            className="input-dark text-sm"
                            placeholder="Търси по име..."
                          />
                          {showPlayerList && playerSearch && (
                            <div className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl">
                              {broadcastPlayers
                                .filter(p =>
                                  p.full_name?.toLowerCase().includes(playerSearch.toLowerCase()) ||
                                  p.username?.toLowerCase().includes(playerSearch.toLowerCase())
                                )
                                .slice(0, 10)
                                .map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => { setBroadcastPlayerId(p.id); setPlayerSearch(''); setShowPlayerList(false) }}
                                    className="w-full text-left px-3 py-2 hover:bg-[#2a2a2a] transition-colors"
                                  >
                                    <span className="text-white text-sm">{p.full_name}</span>
                                    <span className="text-gray-500 text-xs ml-2">@{p.username}</span>
                                  </button>
                                ))}
                              {broadcastPlayers.filter(p =>
                                p.full_name?.toLowerCase().includes(playerSearch.toLowerCase()) ||
                                p.username?.toLowerCase().includes(playerSearch.toLowerCase())
                              ).length === 0 && (
                                <p className="px-3 py-2 text-gray-500 text-sm">Няма резултати</p>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>

            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              className="input-dark resize-none w-full text-sm"
              rows={3}
              placeholder="Въведи съобщение..."
            />
            <button
              onClick={sendBroadcast}
              disabled={broadcastLoading || !broadcastMsg.trim() || (broadcastTarget === 'player' && !broadcastPlayerId)}
              className="px-4 py-2.5 bg-[#CCFF00] text-black text-sm font-bold rounded-lg hover:bg-[#bbee00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {broadcastLoading
                ? <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />Изпращане...</>
                : broadcastTarget === 'city'
                  ? `📍 Изпрати до ${broadcastCity}`
                  : broadcastTarget === 'player' && broadcastPlayerId
                    ? `👤 Изпрати до ${broadcastPlayers.find(p => p.id === broadcastPlayerId)?.full_name || '...'}`
                    : '📢 Изпрати до всички'}
            </button>
          </div>

          <p className="text-gray-400 text-sm">
            {t('admin.messages.count', { n: messages.length })}
            {unreadCount > 0 && <span className="text-red-400 ml-2">{t('admin.messages.unread', { n: unreadCount })}</span>}
          </p>
          {loading ? <Spinner /> : messages.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-2">📭</div>
              <p className="text-white font-medium">{t('admin.messages.noMessages')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`card transition-colors ${!msg.is_read ? 'border-[#CCFF00]/30 bg-[#CCFF00]/5' : 'opacity-60'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white font-semibold text-sm">{msg.name}</span>
                        <span className="text-gray-500 text-xs">{msg.email}</span>
                        {!msg.is_read && (
                          <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-medium">{t('admin.messages.newBadge')}</span>
                        )}
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed">{msg.message}</p>
                      <p className="text-gray-600 text-xs mt-2">{formatDate(msg.created_at)}</p>
                    </div>
                    {!msg.is_read && (
                      <button onClick={() => markRead(msg)}
                        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1e1e] text-gray-400 hover:text-white border border-[#2a2a2a] hover:border-[#CCFF00]/30 transition-colors">
                        {t('admin.messages.markRead')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
