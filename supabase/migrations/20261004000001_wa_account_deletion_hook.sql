-- When an account is deleted (erase_account_data sets account_status='deleted'),
-- also remove the linked WhatsApp contact. The number is personal data, and
-- wa_link_tokens / wa_requests cascade from wa_contacts.
create or replace function public.wa_erase_on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status = 'deleted' and old.account_status is distinct from 'deleted' then
    delete from public.wa_contacts where profile_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.wa_erase_on_account_delete() from public, anon, authenticated;

drop trigger if exists trg_wa_erase_on_account_delete on public.profiles;
create trigger trg_wa_erase_on_account_delete
  after update of account_status on public.profiles
  for each row execute function public.wa_erase_on_account_delete();
