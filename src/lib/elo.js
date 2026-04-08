export function calculateElo(ratingA, ratingB, winsA, winsB, matchType) {
  const K = matchType === 'bo5' ? 48 : 32
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
  const expectedB = 1 - expectedA
  const actualA = winsA > winsB ? 1 : 0
  const actualB = 1 - actualA
  const newRatingA = Math.round(ratingA + K * (actualA - expectedA))
  const newRatingB = Math.round(ratingB + K * (actualB - expectedB))
  return { newRatingA, newRatingB }
}

export function getLeague(rating) {
  if (rating >= 1300) return 'Злато'
  if (rating >= 1000) return 'Сребър'
  if (rating >= 700) return 'Бронз'
  return 'Начинаещи'
}

export function getLeagueBounds(league) {
  const bounds = {
    'Начинаещи': [0, 699],
    'Бронз': [700, 999],
    'Сребър': [1000, 1299],
    'Злато': [1300, 2000]
  }
  return bounds[league] || [0, 700]
}

export function getLeagueProgress(rating) {
  const league = getLeague(rating)
  const [min, max] = getLeagueBounds(league)
  if (league === 'Злато') return 100
  return Math.min(100, Math.round(((rating - min) / (max - min)) * 100))
}

export function getLeagueColor(league) {
  const colors = {
    'Начинаещи': '#6b7280',
    'Бронз': '#cd7f32',
    'Сребър': '#c0c0c0',
    'Злато': '#ffd700'
  }
  return colors[league] || '#6b7280'
}

export function getLeagueIcon(league) {
  const icons = {
    'Начинаещи': '🏅',
    'Бронз': '🥉',
    'Сребър': '🥈',
    'Злато': '🥇'
  }
  return icons[league] || '🏅'
}

// score = raw points (А=1, Б=4, В=10), max = 10 questions × 10 = 100
export function getInitialRating(score) {
  if (score >= 86) return 1000
  if (score >= 61) return 750
  if (score >= 26) return 500
  return 300
}
