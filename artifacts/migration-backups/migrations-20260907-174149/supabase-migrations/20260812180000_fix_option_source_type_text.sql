update public.system_option_sources
set
  name = U&'\4E0B\62C9\6765\6E90\7C7B\578B',
  description = U&'\4E0B\62C9\6570\636E\6E90\7C7B\578B\679A\4E3E\3002',
  updated_at = timezone('utc'::text, now())
where code = 'option_source_type';
