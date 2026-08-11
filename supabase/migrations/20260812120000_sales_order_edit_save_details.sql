-- Make the sales-order editor save its header and detail rows as one transaction.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_actions jsonb;
  v_action_index integer;
  v_block_index integer;
  v_tabs_block_index integer;
  v_tab_index integer;
  v_grid_block_index integer;
  v_grid jsonb;
  v_grid_config jsonb;
  v_columns jsonb;
  v_capabilities jsonb;
  v_save_script text := $script$async function main() {
  const formId = "sales-order-edit-form";
  const gridId = "sales-order-lines-grid";

  const formValid = await this.executeAction({
    node: formId,
    method: "validate",
  });
  if (!formValid) {
    await this.$message.warning("\u8bf7\u5148\u5b8c\u6210\u9500\u552e\u8ba2\u5355\u5fc5\u586b\u9879");
    return false;
  }

  const detailValid = await this.executeAction({
    node: gridId,
    method: "validate",
  });
  if (!detailValid) {
    await this.$message.warning("\u8bf7\u68c0\u67e5\u9500\u552e\u8ba2\u5355\u660e\u7ec6");
    return false;
  }

  const form = await this.executeAction({
    node: formId,
    method: "getData",
  });
  const grid = this.grids[gridId] || {};
  const sourceRows = this.data.salesOrderLines;
  const rows = Array.isArray(grid.rows)
    ? grid.rows
    : Array.isArray(sourceRows)
      ? sourceRows
      : sourceRows && Array.isArray(sourceRows.rows)
        ? sourceRows.rows
        : [];
  const headerFields = [
    "external_source", "external_id", "external_doc_id", "external_doc_no",
    "doc_no", "doc_type_code", "doc_type_name", "doc_date", "business_date",
    "status", "org_code", "org_name", "sales_org_code", "sales_org_name",
    "sales_department_code", "sales_department_name", "salesperson_code",
    "salesperson_name", "operator_code", "operator_name", "customer_id",
    "customer_code", "customer_name", "invoice_customer_code",
    "invoice_customer_name", "payer_customer_code", "payer_customer_name",
    "ship_to_customer_code", "ship_to_customer_name", "contact_name",
    "contact_phone", "delivery_address", "currency_code", "currency_name",
    "exchange_rate", "price_includes_tax", "payment_terms_code",
    "payment_terms_name", "settlement_method_code", "settlement_method_name",
    "trade_terms_code", "trade_terms_name", "delivery_terms_code",
    "delivery_terms_name", "price_list_code", "price_list_name", "total_qty",
    "total_amount", "discount_amount", "tax_exclusive_amount", "tax_amount",
    "tax_inclusive_amount", "local_currency_amount", "source_doc_type",
    "source_doc_id", "source_doc_no", "remark", "metadata"
  ];
  const detailFields = [
    "external_source", "external_id", "external_line_id", "line_no", "row_no",
    "status", "item_id", "item_code", "item_name", "item_spec", "item_model",
    "item_category_code", "item_category_name", "customer_item_code",
    "customer_item_name", "uom_code", "uom_name", "pricing_uom_code",
    "pricing_uom_name", "ordered_qty", "delivered_qty", "shipped_qty",
    "invoiced_qty", "returned_qty", "open_qty", "unit_price",
    "tax_inclusive_unit_price", "discount_rate", "discount_amount", "tax_rate",
    "tax_exclusive_amount", "tax_amount", "tax_inclusive_amount",
    "local_currency_amount", "need_date", "promise_date", "delivery_date",
    "warehouse_code", "warehouse_name", "storage_location_code",
    "storage_location_name", "lot_no", "project_code", "project_name",
    "source_doc_type", "source_doc_id", "source_doc_no", "source_line_id",
    "source_line_no", "is_free_gift", "remark", "metadata"
  ];
  const detailNumberFields = [
    "line_no", "ordered_qty", "delivered_qty", "shipped_qty", "invoiced_qty",
    "returned_qty", "open_qty", "unit_price", "tax_inclusive_unit_price",
    "discount_rate", "discount_amount", "tax_rate", "tax_exclusive_amount",
    "tax_amount", "tax_inclusive_amount", "local_currency_amount"
  ];
  const own = (value, field) => Object.prototype.hasOwnProperty.call(value, field);
  const pick = (value, fields) => {
    const result = {};
    for (const field of fields) {
      if (own(value, field)) result[field] = value[field];
    }
    return result;
  };

  const data = pick(form, headerFields);
  for (const field of ["doc_date", "business_date"]) {
    if (data[field] === "") data[field] = null;
  }

  const details = rows.map((row) => {
    const detail = pick(row, detailFields);
    for (const field of ["need_date", "promise_date", "delivery_date"]) {
      if (detail[field] === "") detail[field] = null;
    }
    for (const field of detailNumberFields) {
      if (detail[field] === "" || detail[field] === null || detail[field] === undefined) continue;
      const numericValue = Number(detail[field]);
      if (Number.isFinite(numericValue)) detail[field] = numericValue;
    }
    return detail;
  });

  data.__details = [{
    resource: "sales_order_lines",
    mode: "replace",
    foreignKey: "order_id",
    inheritFields: ["account_id"],
    rows: details,
  }];

  const currentId = String(form.id || this.route.query.id || "").trim();
  const saved = await this.executeHttp({
    api: "saveSalesOrder",
    body: { id: currentId, data },
  });
  const savedId = String((saved && saved.id) || currentId || "").trim();

  await this.$message.success("\u9500\u552e\u8ba2\u5355\u5df2\u4fdd\u5b58");
  if (!currentId && savedId) {
    await this.$router.push({
      path: this.page.route,
      query: { ...(this.route.query || {}), id: savedId },
    });
    return saved;
  }

  await this.$source.refresh("salesOrder");
  if (savedId) {
    await this.executeAction({
      node: gridId,
      method: "loadData",
      filters: { order_id: savedId },
    });
  }
  return saved;
}$script$;
  v_add_detail_script text := $script$async function main() {
  const gridId = "sales-order-lines-grid";
  const grid = this.grids[gridId] || {};
  const sourceRows = this.data.salesOrderLines;
  const rows = Array.isArray(grid.rows)
    ? grid.rows
    : Array.isArray(sourceRows)
      ? sourceRows
      : sourceRows && Array.isArray(sourceRows.rows)
        ? sourceRows.rows
        : [];
  const maxLineNo = rows.reduce((maximum, row) => {
    const lineNo = Number(row.line_no);
    return Number.isFinite(lineNo) ? Math.max(maximum, lineNo) : maximum;
  }, 0);

  return this.executeAction({
    node: gridId,
    method: "addRow",
    data: {
      id: `new-${Date.now()}-${rows.length + 1}`,
      external_source: "manual",
      line_no: maxLineNo + 1,
      status: "open",
      item_code: "",
      item_name: "",
      ordered_qty: 0,
      delivered_qty: 0,
      shipped_qty: 0,
      invoiced_qty: 0,
      returned_qty: 0,
      open_qty: 0,
      unit_price: 0,
      tax_inclusive_unit_price: 0,
      discount_rate: 0,
      discount_amount: 0,
      tax_rate: 0,
      tax_exclusive_amount: 0,
      tax_amount: 0,
      tax_inclusive_amount: 0,
      local_currency_amount: 0,
      is_free_gift: false,
      metadata: {},
    },
  });
}$script$;
  v_delete_detail_script text := $script$async function main() {
  const deleted = await this.executeAction({
    node: "sales-order-lines-grid",
    method: "deleteCurrentRow",
  });
  if (!deleted) {
    await this.$message.warning("\u8bf7\u5148\u9009\u62e9\u8981\u5220\u9664\u7684\u660e\u7ec6");
    return null;
  }
  return deleted;
}$script$;
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  v_next_schema := v_schema;
  if not v_next_schema ? 'apis' then
    v_next_schema := jsonb_set(v_next_schema, '{apis}', '{}'::jsonb, true);
  end if;
  if not v_next_schema ? 'scriptPolicy' then
    v_next_schema := jsonb_set(v_next_schema, '{scriptPolicy}', '{}'::jsonb, true);
  end if;

  v_next_schema := jsonb_set(
    v_next_schema,
    '{apis,saveSalesOrder}',
    jsonb_build_object(
      'serviceName', 'admin',
      'serviceMethod', 'saveItem',
      'method', 'POST',
      'postData', jsonb_build_object(
        'resource', 'sales_orders',
        'tableName', 'sales_orders'
      )
    ),
    true
  );

  if not v_next_schema #> '{dataSources,salesOrder}' is null then
    v_next_schema := jsonb_set(
      v_next_schema,
      '{dataSources,salesOrder,autoLoad}',
      'true'::jsonb,
      true
    );
  end if;

  select jsonb_agg(to_jsonb(capability) order by capability)
  into v_capabilities
  from (
    select value as capability
    from jsonb_array_elements_text(
      coalesce(v_next_schema #> '{scriptPolicy,capabilities}', '[]'::jsonb)
    )
    union
    select unnest(array[
      'action.execute',
      'http.execute',
      'message.success',
      'message.warning',
      'router.push',
      'source.refresh'
    ])
  ) as capabilities;

  v_next_schema := jsonb_set(
    v_next_schema,
    '{scriptPolicy,capabilities}',
    coalesce(v_capabilities, '[]'::jsonb),
    true
  );

  select (entry.ordinality - 1)::integer
  into v_block_index
  from jsonb_array_elements(coalesce(v_next_schema -> 'blocks', '[]'::jsonb))
    with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-edit-actions'
  limit 1;

  if v_block_index is null then
    raise exception 'Button group sales-order-edit-actions does not exist.';
  end if;

  v_actions := coalesce(
    v_next_schema #> array['blocks', v_block_index::text, 'actions'],
    '[]'::jsonb
  );

  select (entry.ordinality - 1)::integer
  into v_action_index
  from jsonb_array_elements(v_actions) with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'save'
  limit 1;

  if v_action_index is null then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'code', 'save',
      'label', U&'\4FDD\5B58',
      'type', 'button',
      'mode', 'button',
      'status', 'primary',
      'icon', 'ri-save-3-line',
      'permissionCode', 'sales.orders.manage',
      'script', v_save_script
    ));
  else
    v_actions := jsonb_set(
      v_actions,
      array[v_action_index::text],
      (v_actions -> v_action_index) || jsonb_build_object(
        'label', U&'\4FDD\5B58',
        'type', 'button',
        'mode', 'button',
        'status', 'primary',
        'icon', 'ri-save-3-line',
        'permissionCode', 'sales.orders.manage',
        'script', v_save_script
      ),
      false
    );
  end if;

  select (entry.ordinality - 1)::integer
  into v_action_index
  from jsonb_array_elements(v_actions) with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'addDetail'
  limit 1;

  if v_action_index is null then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'code', 'addDetail',
      'label', U&'\6DFB\52A0\660E\7EC6',
      'type', 'button',
      'mode', 'button',
      'icon', 'ri-add-line',
      'permissionCode', 'sales.orders.manage',
      'script', v_add_detail_script
    ));
  else
    v_actions := jsonb_set(
      v_actions,
      array[v_action_index::text],
      (v_actions -> v_action_index) || jsonb_build_object(
        'label', U&'\6DFB\52A0\660E\7EC6',
        'type', 'button',
        'mode', 'button',
        'icon', 'ri-add-line',
        'permissionCode', 'sales.orders.manage',
        'script', v_add_detail_script
      ),
      false
    );
  end if;

  select (entry.ordinality - 1)::integer
  into v_action_index
  from jsonb_array_elements(v_actions) with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'deleteDetail'
  limit 1;

  if v_action_index is null then
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'code', 'deleteDetail',
      'label', U&'\5220\9664\660E\7EC6',
      'type', 'button',
      'mode', 'button',
      'status', 'danger',
      'icon', 'ri-delete-bin-line',
      'permissionCode', 'sales.orders.manage',
      'script', v_delete_detail_script
    ));
  else
    v_actions := jsonb_set(
      v_actions,
      array[v_action_index::text],
      (v_actions -> v_action_index) || jsonb_build_object(
        'label', U&'\5220\9664\660E\7EC6',
        'type', 'button',
        'mode', 'button',
        'status', 'danger',
        'icon', 'ri-delete-bin-line',
        'permissionCode', 'sales.orders.manage',
        'script', v_delete_detail_script
      ),
      false
    );
  end if;

  v_next_schema := jsonb_set(
    v_next_schema,
    array['blocks', v_block_index::text, 'actions'],
    v_actions,
    false
  );

  select (entry.ordinality - 1)::integer
  into v_tabs_block_index
  from jsonb_array_elements(coalesce(v_next_schema -> 'blocks', '[]'::jsonb))
    with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-lines-tabs'
  limit 1;

  if v_tabs_block_index is null then
    raise exception 'Tabs block sales-order-lines-tabs does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_tab_index
  from jsonb_array_elements(
    coalesce(v_next_schema #> array['blocks', v_tabs_block_index::text, 'tabs'], '[]'::jsonb)
  ) with ordinality as entry(tab, ordinality)
  where entry.tab ->> 'key' = 'lines'
  limit 1;

  if v_tab_index is null then
    raise exception 'Sales-order detail tab lines does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_grid_block_index
  from jsonb_array_elements(
    coalesce(
      v_next_schema #> array[
        'blocks', v_tabs_block_index::text, 'tabs', v_tab_index::text, 'blocks'
      ],
      '[]'::jsonb
    )
  ) with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-lines-grid'
  limit 1;

  if v_grid_block_index is null then
    raise exception 'Grid sales-order-lines-grid does not exist.';
  end if;

  v_grid := v_next_schema #> array[
    'blocks', v_tabs_block_index::text,
    'tabs', v_tab_index::text,
    'blocks', v_grid_block_index::text
  ];
  v_grid_config := coalesce(v_grid #> '{schema,grid}', '{}'::jsonb);

  select jsonb_agg(
    case column_value ->> 'field'
      when 'line_no' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 1, 'digits', 0)
        )
      )
      when 'ordered_qty' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'delivered_qty' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'open_qty' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'unit_price' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 8)
        )
      )
      when 'discount_rate' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'max', 100, 'digits', 6)
        )
      )
      when 'tax_rate' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'max', 100, 'digits', 6)
        )
      )
      when 'tax_exclusive_amount' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'tax_amount' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'tax_inclusive_amount' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeNumberInput',
          'props', jsonb_build_object('min', 0, 'digits', 6)
        )
      )
      when 'need_date' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeDatePicker',
          'props', jsonb_build_object('type', 'date', 'clearable', true)
        )
      )
      when 'promise_date' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeDatePicker',
          'props', jsonb_build_object('type', 'date', 'clearable', true)
        )
      )
      when 'delivery_date' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object(
          'name', 'VxeDatePicker',
          'props', jsonb_build_object('type', 'date', 'clearable', true)
        )
      )
      when 'item_code' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'item_name' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'item_spec' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'uom_name' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'warehouse_name' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'status' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      when 'remark' then column_value || jsonb_build_object(
        'editRender', jsonb_build_object('name', 'VxeInput', 'props', jsonb_build_object('clearable', true))
      )
      else column_value
    end
    order by ordinality
  )
  into v_columns
  from jsonb_array_elements(coalesce(v_grid_config -> 'columns', '[]'::jsonb))
    with ordinality as columns(column_value, ordinality);

  v_grid_config := v_grid_config || jsonb_build_object(
    'keepSource', true,
    'editConfig', jsonb_build_object(
      'enabled', true,
      'mode', 'row',
      'trigger', 'click',
      'showStatus', true
    ),
    'editRules', jsonb_build_object(
      'line_no', jsonb_build_array(
        jsonb_build_object('required', true, 'message', U&'\8BF7\8F93\5165\884C\53F7'),
        jsonb_build_object('type', 'number', 'min', 1, 'message', U&'\884C\53F7\5FC5\987B\5927\4E8E 0')
      ),
      'item_code', jsonb_build_array(
        jsonb_build_object('required', true, 'message', U&'\8BF7\8F93\5165\7269\6599\7F16\7801')
      ),
      'item_name', jsonb_build_array(
        jsonb_build_object('required', true, 'message', U&'\8BF7\8F93\5165\7269\6599\540D\79F0')
      ),
      'ordered_qty', jsonb_build_array(
        jsonb_build_object('required', true, 'message', U&'\8BF7\8F93\5165\8BA2\8D2D\6570\91CF'),
        jsonb_build_object('type', 'number', 'min', 0, 'message', U&'\8BA2\8D2D\6570\91CF\4E0D\80FD\5C0F\4E8E 0')
      )
    ),
    'columns', coalesce(v_columns, '[]'::jsonb)
  );

  v_grid := jsonb_set(v_grid, '{schema,grid}', v_grid_config, false);
  v_next_schema := jsonb_set(
    v_next_schema,
    array[
      'blocks', v_tabs_block_index::text,
      'tabs', v_tab_index::text,
      'blocks', v_grid_block_index::text
    ],
    v_grid,
    false
  );

  if v_schema is distinct from v_next_schema then
    update public.lowcode_pages
    set
      schema = v_next_schema,
      version = v_version + 1,
      published_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    where id = v_page_id
    returning version into v_version;

    insert into public.lowcode_page_versions (page_id, version, schema, published_at)
    select id, version, schema, published_at
    from public.lowcode_pages
    where id = v_page_id
    on conflict (page_id, version) do update set
      schema = excluded.schema,
      published_at = excluded.published_at;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
