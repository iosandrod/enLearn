-- Low-code page metadata for database-driven admin screens.

create table if not exists public.lowcode_pages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  route text not null unique,
  title text not null,
  description text,
  layout text not null default 'dashboard'
    check (layout in ('default', 'dashboard', 'blank')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  keep_alive boolean not null default true,
  schema jsonb not null default '{"blocks":[],"dataSources":{}}'::jsonb,
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

drop trigger if exists set_lowcode_pages_updated_at on public.lowcode_pages;
create trigger set_lowcode_pages_updated_at
before update on public.lowcode_pages
for each row
execute function public.set_updated_at();

alter table public.lowcode_pages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lowcode_pages'
      and policyname = 'Published low-code pages are public'
  ) then
    create policy "Published low-code pages are public" on public.lowcode_pages
      for select
      using (status = 'published');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lowcode_pages'
      and policyname = 'Admin users can manage low-code pages'
  ) then
    create policy "Admin users can manage low-code pages" on public.lowcode_pages
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;
end $$;

create table if not exists public.lowcode_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.lowcode_pages(id) on delete cascade,
  version integer not null,
  schema jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  unique (page_id, version)
);

alter table public.lowcode_page_versions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lowcode_page_versions'
      and policyname = 'Admin users can manage page versions'
  ) then
    create policy "Admin users can manage page versions" on public.lowcode_page_versions
      for all
      using (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      )
      with check (
        exists (
          select 1 from public.users
          where users.id = auth.uid()
            and users.role = 'admin'
        )
      );
  end if;
end $$;

insert into public.lowcode_pages (
  code,
  route,
  title,
  description,
  layout,
  status,
  keep_alive,
  schema
) values (
  'demo-admin-page',
  '/dashboard/low-code/demo',
  'Demo Admin Page',
  'A sample low-code page rendered straight from database metadata.',
  'dashboard',
  'published',
  true,
  '{
    "code": "demo-admin-page",
    "route": "/dashboard/low-code/demo",
    "title": "Demo Admin Page",
    "description": "A sample low-code page rendered straight from database metadata.",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": true,
    "blocks": [
      {
        "id": "intro",
        "kind": "text",
        "title": "Demo Admin Page",
        "content": "This page definition is stored in the lowcode_pages table and rendered at runtime."
      },
      {
        "id": "quick-form",
        "kind": "form",
        "title": "Quick Edit",
        "description": "Low-code form schema stored as JSON.",
        "initialValues": {
          "title": "Low Code Demo",
          "status": "published"
        },
        "schema": {
          "columns": 2,
          "fields": [
            {
              "field": "title",
              "label": "Title",
              "component": "vxe-input",
              "props": {
                "placeholder": "Enter title",
                "clearable": true
              },
              "rules": [
                {
                  "required": true,
                  "message": "Title is required"
                }
              ]
            },
            {
              "field": "status",
              "label": "Status",
              "component": "vxe-select",
              "options": [
                {
                  "label": "Draft",
                  "value": "draft"
                },
                {
                  "label": "Published",
                  "value": "published"
                }
              ]
            }
          ],
          "actions": [
            {
              "code": "submit",
              "label": "Save",
              "type": "submit",
              "status": "primary"
            }
          ]
        }
      },
      {
        "id": "sample-grid",
        "kind": "grid",
        "title": "Sample Records",
        "rows": [
          {
            "name": "Homepage",
            "route": "/",
            "status": "published",
            "updated_at": "2026-07-21T12:00:00Z"
          },
          {
            "name": "Pricing",
            "route": "/pricing",
            "status": "draft",
            "updated_at": "2026-07-20T12:00:00Z"
          }
        ],
        "schema": {
          "title": "Sample Records",
          "grid": {
            "border": true,
            "stripe": true,
            "showOverflow": true,
            "rowConfig": {
              "keyField": "route"
            },
            "columns": [
              {
                "field": "name",
                "title": "Page",
                "minWidth": 160
              },
              {
                "field": "route",
                "title": "Route",
                "minWidth": 180
              },
              {
                "field": "status",
                "title": "Status",
                "minWidth": 120,
                "formatter": {
                  "type": "enum",
                  "map": {
                    "draft": "Draft",
                    "published": "Published"
                  }
                }
              },
              {
                "field": "updated_at",
                "title": "Updated At",
                "minWidth": 190,
                "formatter": {
                  "type": "datetime",
                  "locale": "en-US"
                }
              }
            ]
          }
        }
      }
    ],
    "dataSources": {}
  }'::jsonb
)
on conflict (code) do nothing;
