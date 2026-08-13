-- Submit only created, updated, and deleted sales-order detail rows on update.

do $$
declare
  v_page_id uuid;
  v_version integer;
  v_schema jsonb;
  v_next_schema jsonb;
  v_actions jsonb;
  v_block_index integer;
  v_action_index integer;
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
  const currentId = String(form.id || this.route.query.id || "").trim();
  const changes = currentId
    ? await this.executeAction({ node: gridId, method: "getChanges" })
    : { created: rows, updated: [], deleted: [] };
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
    "id", "external_source", "external_id", "external_line_id", "line_no", "row_no",
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

  const normalizeDetail = (row) => {
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
  };

  const created = (Array.isArray(changes.created) ? changes.created : [])
    .map(normalizeDetail)
    .map((detail) => {
      const { id, _X_ROW_KEY, __rowStatus, __rowState, ...persisted } = detail;
      return persisted;
    });
  const updated = (Array.isArray(changes.updated) ? changes.updated : [])
    .map(normalizeDetail)
    .map(({ _X_ROW_KEY, __rowStatus, __rowState, ...persisted }) => persisted);
  const deleted = (Array.isArray(changes.deleted) ? changes.deleted : [])
    .map((row) => row && row.id)
    .filter((id) => typeof id === "string" && id.trim());

  data.__details = [currentId
    ? {
        resource: "sales_order_lines",
        mode: "changes",
        foreignKey: "order_id",
        inheritFields: ["account_id"],
        created,
        updated,
        deleted,
      }
    : {
        resource: "sales_order_lines",
        foreignKey: "order_id",
        inheritFields: ["account_id"],
        rows: created,
      }];

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
begin
  select id, version, schema
  into v_page_id, v_version, v_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    raise exception 'Low-code page sales-orders-edit does not exist.';
  end if;

  select (entry.ordinality - 1)::integer
  into v_block_index
  from jsonb_array_elements(coalesce(v_schema -> 'blocks', '[]'::jsonb))
    with ordinality as entry(block, ordinality)
  where entry.block ->> 'id' = 'sales-order-edit-actions'
  limit 1;

  if v_block_index is null then
    raise exception 'Button group sales-order-edit-actions does not exist.';
  end if;

  v_actions := coalesce(
    v_schema #> array['blocks', v_block_index::text, 'actions'],
    '[]'::jsonb
  );
  select (entry.ordinality - 1)::integer
  into v_action_index
  from jsonb_array_elements(v_actions) with ordinality as entry(action, ordinality)
  where entry.action ->> 'code' = 'save'
  limit 1;

  if v_action_index is null then
    raise exception 'Sales-order save action does not exist.';
  end if;

  v_actions := jsonb_set(
    v_actions,
    array[v_action_index::text],
    (v_actions -> v_action_index) || jsonb_build_object('script', v_save_script),
    false
  );
  v_next_schema := jsonb_set(
    v_schema,
    array['blocks', v_block_index::text, 'actions'],
    v_actions,
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
