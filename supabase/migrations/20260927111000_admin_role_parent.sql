alter table public.admin_roles
  add column if not exists parent_id uuid
    references public.admin_roles(id)
    on delete restrict;

create index if not exists admin_roles_parent_id_idx
  on public.admin_roles(parent_id);
