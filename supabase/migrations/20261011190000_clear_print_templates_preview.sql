begin;

-- Old previews contain large embedded image/SVG data. New saves regenerate
-- compressed thumbnails in the browser; template content is preserved.
update public.print_templates
set preview = null
where preview is not null;

commit;
