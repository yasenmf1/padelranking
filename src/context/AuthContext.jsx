import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)       // true until session state is known
  const [profileLoading, setProfileLoading] = useState(false) // true while fetching profile

  async function fetchProfile(userId) {
    setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, clubs(id, name, city)')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
      return data
    } catch (err) {
      console.error('Error fetching profile:', err)
      setProfile(null)
      return null
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    // Hard fallback: if onAuthStateChange never fires, unblock after 3s
    const timeout = setTimeout(() => setLoading(false), 3000)

    // onAuthStateChange fires with INITIAL_SESSION immediately from local storage —
    // does NOT require a network round-trip for the session itself.
    // We set loading=false right here (before profile fetch) so the login page
    // is never blocked waiting for Supabase DB queries.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setLoading(false)
      clearTimeout(timeout)

      if (session?.user) {
        fetchProfile(session.user.id) // runs in background, updates profileLoading + profile
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setProfile(null)
    setSession(null)
  }

  async function register(email, password, userData) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: userData.full_name } }
    })
    if (authError) throw authError

    const user = authData.user
    if (!user) throw new Error('No user returned from signup')

    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.id,
      email,
      full_name: userData.full_name,
      username: userData.username,
      phone: userData.phone || null,
      club_id: userData.club_id || null,
      rating: 500,
      league: 'Начинаещи',
      approved_matches: 0,
      is_ranked: false,
      is_admin: false,
      questionnaire_done: false
    })

    if (profileError) throw profileError

    return authData
  }

  async function refreshProfile() {
    if (session?.user) {
      await fetchProfile(session.user.id)
    }
  }

  const value = {
    session,
    profile,
    loading,
    profileLoading,
    login,
    logout,
    register,
    refreshProfile,
    user: session?.user || null
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
