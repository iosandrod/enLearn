-- Keep API/database query results in UTC. Business timezone formatting should
-- happen at the presentation layer.
do $$
declare
  role_name text;
begin
  for role_name in
    select rolname
    from pg_roles
    where rolname in ('postgres', 'authenticator', 'anon', 'authenticated', 'service_role')
  loop
    execute format('alter role %I set timezone = %L', role_name, 'UTC');
  end loop;
end
$$;
