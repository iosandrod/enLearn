begin;

-- Keep the array-table column actions usable in the grid designer. Some
-- deployed lc-array-table versions only rendered the delete action even though
-- the child/move/copy handlers were already part of the material runtime.
update public.lowcode_materials
   set source_text = replace(
         replace(
           replace(
             replace(
               replace(
                 source_text,
                 '{{ addChildText }}表单 Schema 未配置',
                 '子表单 Schema 未配置'
               ),
               '              {{ addChildText }}' || chr(10) ||
               '            </button>',
               '              <i class="ri-node-tree-line" aria-hidden="true" />' || chr(10) ||
               '            </button>'
             ),
             '              子' || chr(10) ||
             '            </button>',
             '              <i class="ri-node-tree-line" aria-hidden="true" />' || chr(10) ||
             '            </button>'
           ),
           '              上' || chr(10) ||
           '            </button>',
           '              <i class="ri-arrow-up-line" aria-hidden="true" />' || chr(10) ||
           '            </button>'
         ),
         '              下' || chr(10) ||
         '            </button>',
         '              <i class="ri-arrow-down-line" aria-hidden="true" />' || chr(10) ||
         '            </button>'
       ),
       source_hash = md5(source_text),
       material_version = '1.2.5',
       updated_at = timezone('utc'::text, now())
 where material_kind = 'form'
   and code = 'lc-array-table';

-- Add the missing action buttons only when the deployed template does not
-- already contain them. This keeps the migration idempotent across material
-- versions.
update public.lowcode_materials
   set source_text = replace(
         source_text,
         '            <button' || chr(10) ||
         '              v-if="removable"',
         '            <button' || chr(10) ||
         '              v-if="childAddable"' || chr(10) ||
         '              type="button"' || chr(10) ||
         '              class="is-primary"' || chr(10) ||
         '              :title="addChildText"' || chr(10) ||
         '              :aria-label="addChildText"' || chr(10) ||
         '              :disabled="isReadonly"' || chr(10) ||
         '              @click="addChildRow(scope.row)"' || chr(10) ||
         '            >' || chr(10) ||
         '              <i class="ri-node-tree-line" aria-hidden="true" />' || chr(10) ||
         '            </button>' || chr(10) ||
         '            <button' || chr(10) ||
         '              v-if="movable"' || chr(10) ||
         '              type="button"' || chr(10) ||
         '              :title="上一行"' || chr(10) ||
         '              aria-label="上一行"' || chr(10) ||
         '              :disabled="isReadonly || getSiblingIndex(scope.row) <= 0"' || chr(10) ||
         '              @click="moveRow(scope.row, -1)"' || chr(10) ||
         '            >' || chr(10) ||
         '              <i class="ri-arrow-up-line" aria-hidden="true" />' || chr(10) ||
         '            </button>' || chr(10) ||
         '            <button' || chr(10) ||
         '              v-if="movable"' || chr(10) ||
         '              type="button"' || chr(10) ||
         '              :title="下一行"' || chr(10) ||
         '              aria-label="下一行"' || chr(10) ||
         '              :disabled="isReadonly || getSiblingIndex(scope.row) >= getSiblingRows(scope.row).length - 1"' || chr(10) ||
         '              @click="moveRow(scope.row, 1)"' || chr(10) ||
         '            >' || chr(10) ||
         '              <i class="ri-arrow-down-line" aria-hidden="true" />' || chr(10) ||
         '            </button>' || chr(10) ||
         '            <button' || chr(10) ||
         '              v-if="copyable"' || chr(10) ||
         '              type="button"' || chr(10) ||
         '              title="复制"' || chr(10) ||
         '              aria-label="复制"' || chr(10) ||
         '              :disabled="isReadonly"' || chr(10) ||
         '              @click="copyRow(scope.row)"' || chr(10) ||
         '            >' || chr(10) ||
         '              <i class="ri-file-copy-line" aria-hidden="true" />' || chr(10) ||
         '            </button>' || chr(10) ||
         '            <button' || chr(10) ||
         '              v-if="removable"'
       )
 where material_kind = 'form'
   and code = 'lc-array-table'
   and position('v-if="childAddable"' in source_text) = 0;

update public.lowcode_materials
   set source_hash = md5(source_text),
       material_version = '1.2.5',
       updated_at = timezone('utc'::text, now())
 where material_kind = 'form'
   and code = 'lc-array-table';

update public.lowcode_materials
   set source_text = replace(
         replace(
           source_text,
           '              复' || chr(10) ||
           '            </button>',
           '              <i class="ri-file-copy-line" aria-hidden="true" />' || chr(10) ||
           '            </button>'
         ),
         '              删' || chr(10) ||
         '            </button>',
         '              <i class="ri-delete-bin-line" aria-hidden="true" />' || chr(10) ||
         '            </button>'
       ),
       source_hash = md5(source_text),
       material_version = '1.2.5',
       updated_at = timezone('utc'::text, now())
 where material_kind = 'form'
   and code = 'lc-array-table';

do $validate_grid_column_actions$
begin
  if not exists (
    select 1
      from public.lowcode_materials
     where material_kind = 'form'
       and code = 'lc-array-table'
       and position('v-if="childAddable"' in source_text) > 0
       and position('ri-node-tree-line' in source_text) > 0
       and position('ri-arrow-up-line' in source_text) > 0
       and position('ri-arrow-down-line' in source_text) > 0
       and position('子表单 Schema 未配置' in source_text) > 0
  ) then
    raise exception 'lc-array-table column actions migration did not install correctly.';
  end if;
end;
$validate_grid_column_actions$;

select pg_notify('pgrst', 'reload schema');

commit;
