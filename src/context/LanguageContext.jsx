import { createContext, useContext, useState } from 'react'
import { translations } from '../i18n/translations'

const LanguageContext = createContext({})

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('padel_lang') || 'bg'
  )

  function setLang(l) {
    localStorage.setItem('padel_lang', l)
    setLangState(l)
  }

  function t(key, vars = {}) {
    const keys = key.split('.')
    let val = translations[lang]
    for (const k of keys) {
      val = val?.[k]
      if (val === undefined) break
    }
    // Fallback to bg if key missing in en
    if (val === undefined) {
      val = translations['bg']
      for (const k of keys) {
        val = val?.[k]
        if (val === undefined) break
      }
    }
    if (typeof val === 'string' && Object.keys(vars).length > 0) {
      return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
    }
    return val ?? key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
