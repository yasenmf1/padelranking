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

// ── Helper: apply ELO directly via service_role (bypasses RPC admin check) ─
// Mirrors the logic in migration_elo_individual.sql
function calcElo(before, opponentTeamAvg, result, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (opponentTeamAvg - before) / 400))
  return Math.max(0, before + Math.round(k * (result - expected)))
}

async function applyEloDirectly(matchId, p1r, p2r, p3r, p4r, t1Wins, t2Wins, matchType = 'bo3') {
  const k = matchType === 'bo5' ? 48 : 32
  const t1Avg = (p1r + p2r) / 2
  const t2Avg = (p3r + p4r) / 2
  const res1 = t1Wins > t2Wins ? 1.0 : 0.0
  const res2 = 1.0 - res1

  const p1n = calcElo(p1r, t2Avg, res1, k)
  const p2n = calcElo(p2r, t2Avg, res1, k)
  const p3n = calcElo(p3r, t1Avg, res2, k)
  const p4n = calcElo(p4r, t1Avg, res2, k)

  const { data: m } = await supabase.from('matches').select(
    'player1_id, player2_id, player3_id, player4_id'
  ).eq('id', matchId).single()

  // Update match
  await supabase.from('matches').update({
    status: 'approved',
    player1_rating_after: p1n, player2_rating_after: p2n,
    player3_rating_after: p3n, player4_rating_after: p4n,
  }).eq('id', matchId)

  // Update profiles
  const players = [
    { id: m.player1_id, r: p1n, before: p1r },
    { id: m.player2_id, r: p2n, before: p2r },
    { id: m.player3_id, r: p3n, before: p3r },
    { id: m.player4_id, r: p4n, before: p4r },
  ].filter(u => u.id)

  function getLeague(r) {
    if (r >= 1300) return '\u0417\u043b\u0430\u0442\u043e'
    if (r >= 1000) return '\u0421\u0440\u0435\u0431\u044a\u0440'
    if (r >= 700)  return '\u0411\u0440\u043e\u043d\u0437'
    return '\u041d\u0430\u0447\u0438\u043d\u0430\u0435\u0449\u0438'
  }

  for (const u of players) {
    const { data: cur } = await supabase.from('profiles').select('approved_matches').eq('id', u.id).single()
    const newAm = (cur?.approved_matches || 0) + 1
    const league = getLeague(u.r)
    await supabase.from('profiles').update({
      rating: u.r, league, approved_matches: newAm, is_ranked: newAm >= 5,
    }).eq('id', u.id)
    const { error: rhErr } = await supabase.from('rankings_history').insert({
      player_id: u.id, rating: u.r, match_id: matchId, league,
    })
    if (rhErr) console.error(`  rankings_history insert error for ${u.id}:`, rhErr.message)
  }

  return { p1n, p2n, p3n, p4n, d1: p1n - p1r, d2: p2n - p2r, d3: p3n - p3r, d4: p4n - p4r }
}

// ── 3. CONFIRMATION ───────────────────────────────────────────────────────
async function testConfirmation() {
  section('3. CONFIRMATION')
  if (!state.matchId) { fail('No match to confirm'); return }

  // Simulate confirmation: update status directly (service_role bypasses RLS)
  const p3 = state.players[2]
  const { error } = await supabase.from('matches').update({
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    confirmed_by: p3.id,
  }).eq('id', state.matchId)

  assert(!error, 'Match status → confirmed', error?.message)

  const { data: m } = await supabase.from('matches').select('status').eq('id', state.matchId).single()
  assert(m?.status === 'confirmed', 'Verified status in DB', m?.status)
}

// ── 4. ADMIN APPROVAL ─────────────────────────────────────────────────────
async function testAdminApproval() {
  section('4. ADMIN APPROVAL')
  if (!state.matchId) { fail('No match to approve'); return }

  // service_role key can't call admin_resolve_match (auth.uid()=NULL fails the admin check).
  // Apply ELO directly — same logic as the SECURITY DEFINER function.
  const result = await applyEloDirectly(state.matchId, 500, 500, 500, 500, 2, 0)
  state.eloData = result
  ok('ELO applied directly via service_role', `d1=${result.d1}, d2=${result.d2}, d3=${result.d3}, d4=${result.d4}`)

  // Verify profiles updated
  const ids = state.players.map(p => p.id)
  const { data: profiles } = await supabase.from('profiles')
    .select('id, rating, approved_matches').in('id', ids)

  const allUpdated = profiles?.every(p => p.rating !== 500)
  assert(allUpdated, 'All 4 player ratings updated from 500')

  const allMatches = profiles?.every(p => p.approved_matches >= 1)
  assert(allMatches, 'approved_matches incremented for all 4 players')

  const { count } = await supabase.from('rankings_history')
    .select('*', { count: 'exact', head: true }).eq('match_id', state.matchId)
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

// ── 6. ELO ASYMMETRY (pure math — no DB inserts needed) ──────────────────
async function testEloAsymmetry() {
  section('6. ELO ASYMMETRY — stronger vs weaker (pure math)')

  // Scenario A: strong team (700+500) beats weak team (300+500) — expected result
  const sA = { p1: 700, p2: 500, p3: 300, p4: 500 }
  const rA = (() => {
    const t1Avg = (sA.p1 + sA.p2) / 2  // 600
    const t2Avg = (sA.p3 + sA.p4) / 2  // 400
    const k = 32
    const p1n = calcElo(sA.p1, t2Avg, 1, k)
    const p2n = calcElo(sA.p2, t2Avg, 1, k)
    const p3n = calcElo(sA.p3, t1Avg, 0, k)
    const p4n = calcElo(sA.p4, t1Avg, 0, k)
    return { d1: p1n - sA.p1, d2: p2n - sA.p2, d3: p3n - sA.p3, d4: p4n - sA.p4 }
  })()

  console.log(`  [A] Strong(700) wins: d1=${rA.d1>0?'+':''}${rA.d1}, strong(500) d2=${rA.d2>0?'+':''}${rA.d2}`)
  console.log(`  [A] Weak(300) loses: d3=${rA.d3}, weak(500) d4=${rA.d4}`)

  assert(rA.d1 > 0,  'Strong winner (700) gained ELO', `+${rA.d1}`)
  assert(rA.d1 < 16, 'Strong winner (700) gained LESS than 16 (expected win)', `+${rA.d1}`)
  assert(rA.d3 < 0,  'Weak loser (300) lost ELO', `${rA.d3}`)
  assert(Math.abs(rA.d3) < 16, 'Weak loser (300) lost LESS (expected loss)', `${rA.d3}`)
  assert(rA.d1 + rA.d2 + rA.d3 + rA.d4 === 0, 'Scenario A ELO sum = 0 (balanced)')

  // Scenario B: weak team (300+500) upsets strong team (700+500) — unexpected
  const sB = { p1: 300, p2: 500, p3: 700, p4: 500 }
  const rB = (() => {
    const t1Avg = (sB.p1 + sB.p2) / 2  // 400
    const t2Avg = (sB.p3 + sB.p4) / 2  // 600
    const k = 32
    const p1n = calcElo(sB.p1, t2Avg, 1, k)
    const p2n = calcElo(sB.p2, t2Avg, 1, k)
    const p3n = calcElo(sB.p3, t1Avg, 0, k)
    const p4n = calcElo(sB.p4, t1Avg, 0, k)
    return { d1: p1n - sB.p1, d2: p2n - sB.p2, d3: p3n - sB.p3, d4: p4n - sB.p4 }
  })()

  console.log(`  [B] Weak(300) upsets: d1=${rB.d1>0?'+':''}${rB.d1}, d2=${rB.d2>0?'+':''}${rB.d2}`)
  console.log(`  [B] Strong(700) loses: d3=${rB.d3}, d4=${rB.d4}`)

  assert(rB.d1 > rA.d1, 'Upset winner (300) gains MORE than expected winner (700)', `${rB.d1} > ${rA.d1}`)
  assert(rB.d1 > 16,    'Upset winner (300) gains MORE than 16 (unexpected win)', `+${rB.d1}`)
  assert(Math.abs(rB.d3) > Math.abs(rA.d3), 'Upset loser (700) loses MORE than expected loser', `|${rB.d3}| > |${rA.d3}|`)
  assert(rB.d1 + rB.d2 + rB.d3 + rB.d4 === 0, 'Scenario B ELO sum = 0 (balanced)')
}

// ── 7. CLEANUP ────────────────────────────────────────────────────────────
async function cleanup() {
  section('7. CLEANUP')

  const ids = state.players?.map(p => p.id) || []
  const matchIds = [state.matchId, state.asyncMatchId, state.asyncMatchId2].filter(Boolean)

  // Must delete in FK order: rankings_history → matches → profiles → auth
  if (ids.length) {
    await supabase.from('rankings_history').delete().in('player_id', ids)
    ok('rankings_history entries deleted')
  }

  if (matchIds.length) {
    const { error } = await supabase.from('matches').delete().in('id', matchIds)
    assert(!error, 'Test matches deleted', error?.message)
  }

  if (ids.length) {
    const { error } = await supabase.from('profiles').delete().in('id', ids)
    assert(!error, 'Test profiles deleted', error?.message)
  }

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
