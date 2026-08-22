-- Keep timestamptz values as absolute instants while making database query
-- results use the application's business timezone by default.
do $$
declare
  role_name text;
begin
  for role_name in
    select rolname
    from pg_roles
    where rolname in ('postgres', 'authenticator', 'anon', 'authenticated', 'service_role')
  loop
    execute format('alter role %I set timezone = %L', role_name, 'Asia/Shanghai');
  end loop;
end
$$;
