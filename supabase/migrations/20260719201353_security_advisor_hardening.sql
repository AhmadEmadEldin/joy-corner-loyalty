-- Public buckets can serve objects through public URLs without granting clients
-- broad list access to storage.objects. Upload/update/delete policies remain
-- owner-only and are not changed here.
drop policy if exists menu_images_public_read on storage.objects;

-- Supabase may provision this event-trigger helper. Fresh local stacks do not
-- always include it, so guard the hardening statement to keep resets portable.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
