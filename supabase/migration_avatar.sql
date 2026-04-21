-- Migration: Add avatar_url to profiles + create avatars storage bucket

-- 1. Add column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create public avatars bucket (run in Supabase Dashboard → Storage if bucket doesn't exist)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('avatars', 'avatars', true)
-- ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS policies
-- Users can upload/update only inside their own folder (avatars/{user_id}/*)
-- Run these in Supabase Dashboard → Storage → Policies → avatars bucket

-- Allow authenticated users to upload to their own folder
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update/replace their own avatar
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow public read (bucket is public, but explicit policy for clarity)
CREATE POLICY "avatars_read_public" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
