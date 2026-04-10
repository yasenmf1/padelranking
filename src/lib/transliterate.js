// Transliteration mappings for Bulgarian Cyrillic ↔ Latin
// Used to enable cross-script search (e.g. "Nikolay" finds "Николай")

const CYR_TO_LAT = {
  'а': 'a',  'б': 'b',  'в': 'v',  'г': 'g',  'д': 'd',
  'е': 'e',  'ж': 'zh', 'з': 'z',  'и': 'i',  'й': 'y',
  'к': 'k',  'л': 'l',  'м': 'm',  'н': 'n',  'о': 'o',
  'п': 'p',  'р': 'r',  'с': 's',  'т': 't',  'у': 'u',
  'ф': 'f',  'х': 'h',  'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
  'щ': 'sht','ъ': 'a',  'ь': '',   'ю': 'yu', 'я': 'ya',
}

const LAT_TO_CYR = {
  'sht': 'щ', 'yu': 'ю', 'ya': 'я', 'zh': 'ж', 'ts': 'ц',
  'ch': 'ч',  'sh': 'ш',
  'a': 'а',   'b': 'б',  'v': 'в',  'g': 'г',  'd': 'д',
  'e': 'е',   'z': 'з',  'i': 'и',  'y': 'й',  'k': 'к',
  'l': 'л',   'm': 'м',  'n': 'н',  'o': 'о',  'p': 'п',
  'r': 'р',   's': 'с',  't': 'т',  'u': 'у',  'f': 'ф',
  'h': 'х',
}

export function cyrToLat(str) {
  if (!str) return ''
  return str.toLowerCase().split('').map(ch => CYR_TO_LAT[ch] ?? ch).join('')
}

export function latToCyr(str) {
  if (!str) return ''
  let result = ''
  let i = 0
  const s = str.toLowerCase()
  while (i < s.length) {
    // Try longest match first (3 chars, then 2, then 1)
    if (i + 3 <= s.length && LAT_TO_CYR[s.slice(i, i + 3)]) {
      result += LAT_TO_CYR[s.slice(i, i + 3)]
      i += 3
    } else if (i + 2 <= s.length && LAT_TO_CYR[s.slice(i, i + 2)]) {
      result += LAT_TO_CYR[s.slice(i, i + 2)]
      i += 2
    } else {
      result += LAT_TO_CYR[s[i]] ?? s[i]
      i++
    }
  }
  return result
}

// Returns true if query matches text via direct OR transliterated comparison
export function transliteratedMatch(text, query) {
  if (!text || !query) return false
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (t.includes(q)) return true
  // If query is Cyrillic, also try Latin version
  if (/[\u0400-\u04FF]/.test(q)) return t.includes(cyrToLat(q))
  // If query is Latin, also try Cyrillic version
  return t.includes(latToCyr(q))
}
