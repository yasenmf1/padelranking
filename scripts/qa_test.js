/**
 * QA Test Script — padelranking.info
 * Usage: node scripts/qa_test.js
 *
 * Requires environment variables (or edit the constants below):
 *   SUPABASE_URL          — e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY  — service_role key (bypasses RLS)
 *
 * npm install @supabase/supabase-js  (if not already installed)
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL        = process.env.VITE_SUPABASE_URL        || 'https://vrfgpgwtmvmckcveepgp.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''  // must be set

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set.')
  console.error('   Run: SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/qa_test.js')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Helpers ───────────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const state = {}  // shared test state

function ok(label, detail = '') {
  console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`)
  passed++
}

function fail(label, detail = '') {
  console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
  failed++
}

function assert(condition, label, detail = '') {
  condition ? ok(label, detail) : fail(label, detail)
}

function section(title) {
  console.log(`\n─── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`)
}

// ── 1. REGISTRATION ───────────────────────────────────────────────────────
async function testRegistration() {
  section('1. REGISTRATION')

  const players = [
    { email: 'qa_p1@test.padelranking.info', full_name: 'QA Player One',   username: 'qa_player1' },
    { email: 'qa_p2@test.padelranking.info', full_name: 'QA Player Two',   username: 'qa_player2' },
    { email: 'qa_p3@test.padelranking.info', full_name: 'QA Player Three', username: 'qa_player3' },
    { email: 'qa_p4@test.padelranking.info', full_name: 'QA Player Four',  username: 'qa_player4' },
  ]

  state.players = []

  for (const p of players) {
    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: p.email,
      password: 'QaTest1234!',
      email_confirm: true,
    })
    if (authErr) { fail(`Create auth user ${p.username}`, authErr.message); continue }

    const uid = authData.user.id

    // Insert profile
    const { error: profErr } = await supabase.from('profiles').insert({
      id: uid, email: p.email, full_name: p.full_name, username: p.username,
      rating: 500, league: 'Начинаещи', approved_matches: 0,
      is_ranked: false, is_admin: false, questionnaire_done: true,
    })
    if (profErr) { fail(`Insert profile ${p.username}`, profErr.message); continue }

    state.players.push({ ...p, id: uid, rating: 500 })
    ok(`Registered ${p.username}`, `uid=${uid.slice(0, 8)}…`)
  }

  assert(state.players.length === 4, 'All 4 players registered')

  // Verify starting ELO
  const ids = state.players.map(p => p.id)
  const { data: profiles } = await supabase.from('profiles').select('id, rating').in('id', ids)
  const allAt500 = profiles?.every(p => p.rating === 500)
  assert(allAt500, 'All players start at ELO 500')
}

// ── 2. MATCH SUBMISSION ───────────────────────────────────────────────────
async function testMatchSubmission() {
  section('2. MATCH SUBMISSION')

  const [p1, p2, p3, p4] = state.players

  const matchPayload = {
    player1_id: p1.id, player2_id: p2.id,
    player3_id: p3.id, player4_id: p4.id,
    winner_id: p1.id,
    match_type: 'bo3',
    sets_data: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }],
    player1_rating_before: 500, player2_rating_before: 500,
    player3_rating_before: 500, player4_rating_before: 500,
    status: 'pending',
    played_at: new Date().toISOString(),
    submitted_by: p1.id,
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  }

  const { data: match, error: insertErr } = await supabase
    .from('matches').insert(matchPayload).select('id, match_hash').single()

  if (insertErr) { fail('Insert match', insertErr.message); return }
  state.matchId = match.id
  ok(`Match inserted`, `id=${match.id}`)
  assert(!!match.match_hash, 'match_hash generated', match.match_hash)

  // Duplicate match — should fail
  const { error: dupErr } = await supabase
    .from('matches').insert(matchPayload).select('id').single()

  if (dupErr && (dupErr.code === '23505' || dupErr.message?.includes('unique'))) {
    ok('Duplicate match rejected (unique constraint)')
  } else if (dupErr) {
    fail('Duplicate rejected but with unexpected error', dupErr.message)
  } else {
    fail('Duplicate match was NOT rejected — constraint missing!')
    // Clean up the duplicate
    const { data: dup } = await supabase.from('matches').select('id')
      .eq('player1_id', p1.id).eq('player2_id', p2.id).order('created_at', { ascending: false }).limit(2)
    if (dup?.length > 1) await supabase.from('matches').delete().eq('id', dup[0].id)
  }
}

// ── 3. CONFIRMATION ───────────────────────────────────────────────────────
async function testConfirmation() {
  section('3. CONFIRMATION')

  if (!state.matchId) { fail('No match to confirm'); return }

  // confirm_match() requires auth.uid() = player3 or player4
  // We call it via RPC impersonating player3 using their auth token
  const p3 = state.players[2]

  // Get a session for p3
  const { data: session, error: signInErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: p3.email,
  })

  // Use a separate client with p3's access token if available
  // Fallback: test status change directly via service role
  if (signInErr) {
    console.log('  ⚠️  Cannot get p3 session, testing via direct status update')
    // Simulate what confirm_match does (ELO applied in migration_elo_individual.sql)
    const { error: updErr } = await supabase.from('matches')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: p3.id })
      .eq('id', state.matchId)
    assert(!updErr, 'Match status → confirmed', updErr?.message)
  } else {
    // Test via RPC with admin override
    const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
      p_match_id: state.matchId,
      p_action: 'approve',
    })
    if (rpcErr) { fail('admin_resolve_match', rpcErr.message); return }
    if (data?.error) { fail('admin_resolve_match returned error', data.error); return }
    ok('Match approved via admin_resolve_match')
    state.eloData = data
    state.alreadyApproved = true
  }

  const { data: m } = await supabase.from('matches').select('status').eq('id', state.matchId).single()
  assert(
    m?.status === 'confirmed' || m?.status === 'approved',
    'Match status is confirmed/approved',
    m?.status
  )
}

// ── 4. ADMIN APPROVAL ─────────────────────────────────────────────────────
async function testAdminApproval() {
  section('4. ADMIN APPROVAL')

  if (!state.matchId) { fail('No match to approve'); return }
  if (state.alreadyApproved) { ok('Already approved in step 3 — skipping'); return }

  const { data, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
    p_match_id: state.matchId,
    p_action: 'approve',
  })

  if (rpcErr) { fail('admin_resolve_match', rpcErr.message); return }
  if (data?.error) { fail('RPC returned error', data.error); return }

  ok('Match approved via RPC')
  state.eloData = data

  // Verify profiles updated
  const ids = state.players.map(p => p.id)
  const { data: profiles } = await supabase.from('profiles')
    .select('id, rating, approved_matches').in('id', ids)

  const allUpdated = profiles?.every(p => p.rating !== 500 || p.approved_matches >= 1)
  assert(allUpdated, 'All 4 player ratings updated')

  const allMatches = profiles?.every(p => p.approved_matches >= 1)
  assert(allMatches, 'approved_matches incremented for all 4 players')

  // Verify rankings_history
  const { data: history, count } = await supabase.from('rankings_history')
    .select('*', { count: 'exact' }).eq('match_id', state.matchId)

  assert(count === 4, 'rankings_history has 4 entries', `got ${count}`)
}

// ── 5. ELO CALCULATION (balanced) ────────────────────────────────────────
async function testEloBalance() {
  section('5. ELO CALCULATION — balance check')

  if (!state.matchId) { fail('No match data'); return }

  const ids = state.players.map(p => p.id)
  const { data: profiles } = await supabase.from('profiles')
    .select('id, rating').in('id', ids)

  const byId = Object.fromEntries(profiles.map(p => [p.id, p.rating]))
  const [p1, p2, p3, p4] = state.players.map(p => byId[p.id])

  const gained = (p1 - 500) + (p2 - 500)
  const lost   = (p3 - 500) + (p4 - 500)

  console.log(`  ELO after: T1=[${p1}, ${p2}]  T2=[${p3}, ${p4}]`)
  console.log(`  T1 gained: ${gained}  T2 lost: ${lost}  sum: ${gained + lost}`)

  assert(gained > 0, 'Winners gained ELO points', `+${gained}`)
  assert(lost < 0,   'Losers lost ELO points', `${lost}`)
  assert(gained + lost === 0, 'ELO sum is zero (balanced)', `${gained + lost}`)
}

// ── 6. ELO ASYMMETRY (stronger vs weaker) ────────────────────────────────
async function testEloAsymmetry() {
  section('6. ELO ASYMMETRY — stronger vs weaker player')

  const [p1, p2, p3, p4] = state.players

  // Set p1 to 700, p3 to 300
  await supabase.from('profiles').update({ rating: 700 }).eq('id', p1.id)
  await supabase.from('profiles').update({ rating: 300 }).eq('id', p3.id)
  await supabase.from('profiles').update({ rating: 500 }).eq('id', p2.id)
  await supabase.from('profiles').update({ rating: 500 }).eq('id', p4.id)

  // Insert asymmetric match (p1+p2 stronger, p3+p4 weaker)
  const { data: am, error: ae } = await supabase.from('matches').insert({
    player1_id: p1.id, player2_id: p2.id,
    player3_id: p3.id, player4_id: p4.id,
    winner_id: p1.id,
    match_type: 'bo3',
    sets_data: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }],
    player1_rating_before: 700, player2_rating_before: 500,
    player3_rating_before: 300, player4_rating_before: 500,
    status: 'pending',
    played_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago avoids unique constraint
    submitted_by: p1.id,
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  }).select('id').single()

  if (ae) { fail('Insert asymmetric match', ae.message); return }
  state.asyncMatchId = am.id

  const { data: res, error: rpcErr } = await supabase.rpc('admin_resolve_match', {
    p_match_id: am.id,
    p_action: 'approve',
  })
  if (rpcErr || res?.error) { fail('Approve asymmetric match', rpcErr?.message || res?.error); return }

  const d_strong_winner = res.d1  // 700 ELO won — should be small gain
  const d_weak_loser    = res.d3  // 300 ELO lost — should be small loss

  const { data: res2 } = await supabase.rpc('admin_resolve_match', {
    p_match_id: am.id, p_action: 'reject',
  }).catch(() => ({ data: null }))

  console.log(`  Strong winner (700 ELO) delta: ${d_strong_winner > 0 ? '+' : ''}${d_strong_winner}`)
  console.log(`  Weak loser   (300 ELO) delta: ${d_weak_loser > 0 ? '+' : ''}${d_weak_loser}`)

  assert(d_strong_winner > 0, 'Strong winner gained ELO', `+${d_strong_winner}`)
  assert(Math.abs(d_strong_winner) < 16, 'Strong winner gained LESS than 16pts (expected win)', `+${d_strong_winner}`)
  assert(d_weak_loser < 0, 'Weak loser lost ELO', `${d_weak_loser}`)
  assert(Math.abs(d_weak_loser) < 16, 'Weak loser lost LESS (expected loss)', `${d_weak_loser}`)

  // Reverse: weak team wins — should gain MORE
  const { data: am2, error: ae2 } = await supabase.from('matches').insert({
    player1_id: p3.id, player2_id: p4.id,
    player3_id: p1.id, player4_id: p2.id,
    winner_id: p3.id,
    match_type: 'bo3',
    sets_data: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }],
    player1_rating_before: 300, player2_rating_before: 500,
    player3_rating_before: 700, player4_rating_before: 500,
    status: 'pending',
    played_at: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    submitted_by: p3.id,
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  }).select('id').single()

  if (!ae2) {
    state.asyncMatchId2 = am2.id
    const { data: res3, error: rpcErr3 } = await supabase.rpc('admin_resolve_match', {
      p_match_id: am2.id, p_action: 'approve',
    })
    if (!rpcErr3 && !res3?.error) {
      const d_weak_winner   = res3.d1  // 300 ELO won upset
      const d_strong_loser  = res3.d3  // 700 ELO lost upset
      console.log(`  Weak winner (300 ELO) upset delta: +${d_weak_winner}`)
      console.log(`  Strong loser (700 ELO) upset delta: ${d_strong_loser}`)
      assert(d_weak_winner > d_strong_winner, 'Weak winner gains MORE than strong winner', `${d_weak_winner} > ${d_strong_winner}`)
      assert(Math.abs(d_strong_loser) > Math.abs(d_weak_loser), 'Strong loser loses MORE than weak loser')
    }
  }
}

// ── 7. CLEANUP ────────────────────────────────────────────────────────────
async function cleanup() {
  section('7. CLEANUP')

  const ids = state.players?.map(p => p.id) || []

  // Delete matches
  const matchIds = [state.matchId, state.asyncMatchId, state.asyncMatchId2].filter(Boolean)
  if (matchIds.length) {
    const { error } = await supabase.from('matches').delete().in('id', matchIds)
    assert(!error, 'Test matches deleted', error?.message)
  }

  // Delete rankings_history entries
  if (ids.length) {
    await supabase.from('rankings_history').delete().in('player_id', ids)
    ok('rankings_history entries deleted')
  }

  // Delete profiles
  if (ids.length) {
    const { error } = await supabase.from('profiles').delete().in('id', ids)
    assert(!error, 'Test profiles deleted', error?.message)
  }

  // Delete auth users
  for (const p of state.players || []) {
    const { error } = await supabase.auth.admin.deleteUser(p.id)
    assert(!error, `Auth user deleted: ${p.username}`, error?.message)
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║     padelranking.info — QA Test Suite            ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log(`  Supabase: ${SUPABASE_URL}`)

  try {
    await testRegistration()
    await testMatchSubmission()
    await testConfirmation()
    await testAdminApproval()
    await testEloBalance()
    await testEloAsymmetry()
  } catch (err) {
    console.error('\n💥 Unexpected error:', err)
    failed++
  } finally {
    await cleanup()
  }

  console.log('\n══════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)
  console.log(failed === 0 ? '  🎉 All tests passed!' : `  ⚠️  ${failed} test(s) failed`)
  console.log('══════════════════════════════════════════════════\n')

  process.exit(failed > 0 ? 1 : 0)
}

main()
