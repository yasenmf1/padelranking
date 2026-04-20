import { supabase } from '../../lib/supabase'

const CALLBACK_URL = 'https://padelranking.info/auth/callback'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
      <path d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" fill="#FFC107"/>
      <path d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" fill="#FF3D00"/>
      <path d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.5 35 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.3C9.6 35.6 16.3 44 24 44z" fill="#4CAF50"/>
      <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l.1-.1 6.5 5.5C37.5 39 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" fill="#1976D2"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
    </svg>
  )
}

export default function SocialButtons() {
  async function signIn(provider) {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: CALLBACK_URL }
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => signIn('google')}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-800 font-semibold text-sm rounded-lg border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all"
      >
        <GoogleIcon />
        Продължи с Google
      </button>

      <button
        type="button"
        onClick={() => signIn('facebook')}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[#1877F2] text-white font-semibold text-sm rounded-lg hover:bg-[#166fe0] active:scale-[0.98] transition-all"
      >
        <FacebookIcon />
        Продължи с Facebook
      </button>

      <button
        type="button"
        onClick={() => signIn('apple')}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-black text-white font-semibold text-sm rounded-lg border border-[#333] hover:bg-[#1a1a1a] active:scale-[0.98] transition-all"
      >
        <AppleIcon />
        Продължи с Apple
      </button>
    </div>
  )
}
