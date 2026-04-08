import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../context/LanguageContext'

export default function ContactForm() {
  const { t } = useLanguage()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      const { error: err } = await supabase.from('contact_messages')
        .insert({ name: form.name, email: form.email, message: form.message })
      if (err) throw err
      setSent(true)
      setForm({ name: '', email: '', message: '' })
    } catch (err) {
      setError(err.message || t('contact.error'))
    } finally { setSending(false) }
  }

  return (
    <div className="card">
      <h3 className="text-base font-bold text-white mb-1">{t('contact.title')}</h3>
      <p className="text-gray-500 text-xs mb-4">{t('contact.subtitle')}</p>

      {sent ? (
        <div className="py-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-[#CCFF00] font-semibold">{t('contact.sentTitle')}</p>
          <p className="text-gray-500 text-sm mt-1">{t('contact.sentSubtitle')}</p>
          <button onClick={() => setSent(false)}
            className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {t('contact.sendAnother')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">{t('contact.nameLabel')}</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="input-dark text-sm py-2" placeholder={t('contact.namePlaceholder')} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">{t('contact.emailLabel')}</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="input-dark text-sm py-2" placeholder={t('contact.emailPlaceholder')} required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('contact.messageLabel')}</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
              className="input-dark text-sm py-2 resize-none" rows={3}
              placeholder={t('contact.messagePlaceholder')} required />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={sending}
            className="btn-neon w-full py-2 text-sm flex items-center justify-center gap-2">
            {sending ? (
              <><div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />{t('contact.sending')}</>
            ) : t('contact.sendBtn')}
          </button>
        </form>
      )}
    </div>
  )
}
