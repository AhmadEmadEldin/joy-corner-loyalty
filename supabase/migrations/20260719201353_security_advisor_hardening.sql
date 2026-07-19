-- Public buckets can serve objects through public URLs without granting clients
-- broad list access to storage.objects. Upload/update/delete policies remain
-- owner-only and are not changed here.
drop policy if exists menu_images_public_read on storage.objects;

-- Supabase provisions this event-trigger helper to enable RLS on newly created
-- public tables. Event triggers do not need Data API callers to execute the
-- function directly, so remove the inherited PUBLIC/anon/authenticated grants.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
