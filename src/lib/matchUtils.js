import { supabase } from './supabase'
import { calculateElo, getLeague } from './elo'

/**
 * Applies ELO changes for a confirmed/approved match.
 * Uses player*_rating_before stored on the match for calculation,
 * updates player profiles and inserts rankings_history rows.
 *
 * @param {object} match - Full match row with player joins (needs approved_matches)
 * @returns {{ newR, d1, d2, t1Avg, newT1Avg, t2Avg, newT2Avg }}
 */
export async function applyEloForMatch(match) {
  const setsData = match.sets_data || []
  let t1Wins = 0, t2Wins = 0
  for (const s of setsData) {
    if (s.p1 > s.p2) t1Wins++
    else if (s.p2 > s.p1) t2Wins++
  }

  // Use stored pre-match ratings (set when match was submitted)
  const p1r = match.player1_rating_before || match.player1?.rating || 500
  const p2r = match.player2_rating_before || match.player2?.rating || 500
  const p3r = match.player3_rating_before || match.player3?.rating || 500
  const p4r = match.player4_rating_before || match.player4?.rating || 500

  const t1Avg = Math.round((p1r + p2r) / 2)
  const t2Avg = Math.round((p3r + p4r) / 2)

  const { newRatingA: newT1Avg, newRatingB: newT2Avg } = calculateElo(
    t1Avg, t2Avg, t1Wins, t2Wins, match.match_type
  )
  const d1 = newT1Avg - t1Avg
  const d2 = newT2Avg - t2Avg

  const newR = {
    p1: Math.max(0, p1r + d1),
    p2: Math.max(0, p2r + d1),
    p3: Math.max(0, p3r + d2),
    p4: Math.max(0, p4r + d2),
  }

  // Store rating_after on the match row
  const { error: mErr } = await supabase.from('matches').update({
    player1_rating_after: newR.p1,
    player2_rating_after: newR.p2,
    player3_rating_after: newR.p3,
    player4_rating_after: newR.p4,
  }).eq('id', match.id)
  if (mErr) throw mErr

  // Update each player's profile
  const players = [
    { id: match.player1_id, r: newR.p1, prev: match.player1 },
    { id: match.player2_id, r: newR.p2, prev: match.player2 },
    { id: match.player3_id, r: newR.p3, prev: match.player3 },
    { id: match.player4_id, r: newR.p4, prev: match.player4 },
  ].filter(u => u.id)

  for (const u of players) {
    const newMatches = (u.prev?.approved_matches || 0) + 1
    const { error: pErr } = await supabase.from('profiles').update({
      rating: u.r,
      league: getLeague(u.r),
      approved_matches: newMatches,
      is_ranked: newMatches >= 5,
      updated_at: new Date().toISOString(),
    }).eq('id', u.id)
    if (pErr) throw pErr
  }

  // Insert ranking history entries
  const { error: hErr } = await supabase.from('rankings_history').insert(
    players.map(u => ({
      player_id: u.id,
      rating: u.r,
      league: getLeague(u.r),
      match_id: match.id,
    }))
  )
  if (hErr) throw hErr

  return { newR, d1, d2, t1Avg, newT1Avg, t2Avg, newT2Avg }
}
