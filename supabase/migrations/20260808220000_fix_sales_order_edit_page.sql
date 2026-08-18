-- Replace the placeholder user-profile editor with the real sales-order editor.

do $$
declare
  v_schema jsonb := $json$
  {
    "schemaVersion": 1,
    "code": "sales-orders-edit",
    "route": "/dashboard/sales/orders/edit",
    "title": "销售订单编辑",
    "description": "维护销售订单单据、客户、商务条款、金额及订单明细。",
    "pageType": "edit",
    "layout": "dashboard",
    "status": "published",
    "keepAlive": false,
    "apis": {
      "saveSalesOrder": {
        "serviceName": "admin",
        "serviceMethod": "saveItem",
        "method": "POST",
        "postData": {
          "resource": "sales_orders",
          "tableName": "sales_orders"
        }
      },
      "listSalesOrderLines": {
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "method": "POST",
        "postData": {
          "resource": "sales_order_lines",
          "tableName": "sales_order_lines"
        }
      }
    },
    "scriptPolicy": {
      "capabilities": [
        "http.execute",
        "action.execute",
        "source.refresh",
        "source.set"
      ]
    },
    "dataSources": {
      "salesOrder": {
        "key": "salesOrder",
        "label": "销售订单",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "saveMethod": "saveItem",
        "tableName": "sales_orders",
        "postData": {
          "resource": "sales_orders",
          "tableName": "sales_orders",
          "filters": { "id": "{{ route.query.id }}" },
          "requiredFilters": ["id"],
          "limit": 1
        },
        "autoLoad": true
      },
      "salesOrderLines": {
        "key": "salesOrderLines",
        "label": "订单明细",
        "serviceName": "admin",
        "serviceMethod": "listItems",
        "tableName": "sales_order_lines",
        "postData": {
          "resource": "sales_order_lines",
          "tableName": "sales_order_lines",
          "filters": { "order_id": "{{ route.query.id }}" },
          "requiredFilters": ["order_id"],
          "sorts": [
            { "field": "line_no", "direction": "asc" },
            { "field": "created_at", "direction": "asc" }
          ],
          "limit": 1000
        },
        "autoLoad": true
      }
    },
    "blocks": [
      {
        "id": "sales-order-edit-actions",
        "kind": "buttonGroup",
        "align": "left",
        "gap": 8,
        "actions": [
          {
            "code": "back",
            "label": "返回列表",
            "type": "button",
            "mode": "button",
            "icon": "ri-arrow-left-line",
            "route": "/dashboard/sales/orders"
          },
          {
            "code": "refresh",
            "label": "重新载入",
            "type": "button",
            "mode": "button",
            "icon": "ri-refresh-line",
            "directives": [
              {
                "type": "refreshDataSource",
                "sourceKeys": ["salesOrder", "salesOrderLines"]
              }
            ]
          },
          {
            "code": "save",
            "label": "保存",
            "type": "button",
            "mode": "button",
            "status": "primary",
            "icon": "ri-save-3-line",
            "permissionCode": "sales.orders.manage",
            "script": "const form = this.forms['sales-order-edit-form'] || {}; const docNo = String(form.doc_no || '').trim(); const docDate = String(form.doc_date || '').trim(); if (!docNo || !docDate) return; const fields = ['external_source','external_id','external_doc_id','external_doc_no','doc_no','doc_type_code','doc_type_name','doc_date','business_date','status','org_code','org_name','sales_org_code','sales_org_name','sales_department_code','sales_department_name','salesperson_code','salesperson_name','operator_code','operator_name','customer_id','customer_code','customer_name','invoice_customer_code','invoice_customer_name','payer_customer_code','payer_customer_name','ship_to_customer_code','ship_to_customer_name','contact_name','contact_phone','delivery_address','currency_code','currency_name','exchange_rate','price_includes_tax','payment_terms_code','payment_terms_name','settlement_method_code','settlement_method_name','trade_terms_code','trade_terms_name','delivery_terms_code','delivery_terms_name','price_list_code','price_list_name','total_qty','total_amount','discount_amount','tax_exclusive_amount','tax_amount','tax_inclusive_amount','local_currency_amount','source_doc_type','source_doc_id','source_doc_no','remark','metadata']; const data = {}; for (const field of fields) { if (Object.prototype.hasOwnProperty.call(form, field)) data[field] = form[field]; } for (const dateField of ['doc_date','business_date']) { if (data[dateField] === '') data[dateField] = null; } const currentId = String(form.id || this.route.query.id || '').trim(); await this.executeHttp({ api: 'saveSalesOrder', body: { id: currentId, data } }); await this.$source.refresh('salesOrder');"
          }
        ]
      },
      {
        "id": "sales-order-edit-form",
        "kind": "form",
        "title": "销售订单",
        "sourceKey": "salesOrder",
        "submitSourceKey": "salesOrder",
        "initialValues": {
          "id": "",
          "external_source": "manual",
          "doc_no": "",
          "doc_type_code": "",
          "doc_type_name": "",
          "doc_date": "",
          "business_date": "",
          "status": "draft",
          "currency_code": "CNY",
          "exchange_rate": 1,
          "price_includes_tax": true,
          "total_qty": 0,
          "total_amount": 0,
          "discount_amount": 0,
          "tax_exclusive_amount": 0,
          "tax_amount": 0,
          "tax_inclusive_amount": 0,
          "local_currency_amount": 0,
          "metadata": {}
        },
        "schema": {
          "columns": 4,
          "fields": [
            { "field": "doc_no", "label": "订单号", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入订单号" }, "rules": [{ "required": true, "message": "请输入订单号" }] },
            { "field": "doc_type_code", "label": "单据类型编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入单据类型编码" } },
            { "field": "doc_type_name", "label": "单据类型", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入单据类型" } },
            { "field": "doc_date", "label": "单据日期", "component": "vxe-input", "props": { "clearable": true, "type": "date", "placeholder": "请选择单据日期" }, "rules": [{ "required": true, "message": "请选择单据日期" }] },
            { "field": "business_date", "label": "业务日期", "component": "vxe-input", "props": { "clearable": true, "type": "date", "placeholder": "请选择业务日期" } },
            { "field": "status", "label": "订单状态", "component": "vxe-select", "props": { "clearable": true, "placeholder": "请选择订单状态" }, "options": [{ "label": "草稿", "value": "draft" }, { "label": "审批中", "value": "pending" }, { "label": "已批准", "value": "approved" }, { "label": "已驳回", "value": "rejected" }, { "label": "冻结", "value": "on_hold" }, { "label": "打开", "value": "open" }, { "label": "已确认", "value": "confirmed" }, { "label": "执行中", "value": "processing" }, { "label": "已完成", "value": "completed" }, { "label": "已关闭", "value": "closed" }, { "label": "已取消", "value": "canceled" }] },
            { "field": "org_code", "label": "组织编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入组织编码" } },
            { "field": "org_name", "label": "组织名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入组织名称" } },
            { "field": "sales_org_code", "label": "销售组织编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入销售组织编码" } },
            { "field": "sales_org_name", "label": "销售组织", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入销售组织" } },
            { "field": "sales_department_code", "label": "销售部门编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入销售部门编码" } },
            { "field": "sales_department_name", "label": "销售部门", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入销售部门" } },
            { "field": "salesperson_code", "label": "业务员编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入业务员编码" } },
            { "field": "salesperson_name", "label": "业务员", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入业务员" } },
            { "field": "operator_code", "label": "制单人编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入制单人编码" } },
            { "field": "operator_name", "label": "制单人", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入制单人" } },

            { "field": "customer_id", "label": "客户ID", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入客户ID" } },
            { "field": "customer_code", "label": "客户编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入客户编码" } },
            { "field": "customer_name", "label": "客户名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入客户名称" } },
            { "field": "invoice_customer_code", "label": "开票客户编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入开票客户编码" } },
            { "field": "invoice_customer_name", "label": "开票客户", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入开票客户" } },
            { "field": "payer_customer_code", "label": "付款客户编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入付款客户编码" } },
            { "field": "payer_customer_name", "label": "付款客户", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入付款客户" } },
            { "field": "ship_to_customer_code", "label": "收货客户编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入收货客户编码" } },
            { "field": "ship_to_customer_name", "label": "收货客户", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入收货客户" } },
            { "field": "contact_name", "label": "联系人", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入联系人" } },
            { "field": "contact_phone", "label": "联系电话", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入联系电话" } },
            { "field": "delivery_address", "label": "送货地址", "component": "vxe-textarea", "props": { "clearable": true, "rows": 2, "placeholder": "请输入送货地址" } },

            { "field": "currency_code", "label": "币种编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入币种编码" } },
            { "field": "currency_name", "label": "币种名称", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入币种名称" } },
            { "field": "exchange_rate", "label": "汇率", "component": "lc-number-input", "props": { "min": 0, "digits": 8 } },
            { "field": "price_includes_tax", "label": "含税价", "component": "vxe-switch" },
            { "field": "payment_terms_code", "label": "付款条件编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入付款条件编码" } },
            { "field": "payment_terms_name", "label": "付款条件", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入付款条件" } },
            { "field": "settlement_method_code", "label": "结算方式编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入结算方式编码" } },
            { "field": "settlement_method_name", "label": "结算方式", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入结算方式" } },
            { "field": "trade_terms_code", "label": "贸易条款编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入贸易条款编码" } },
            { "field": "trade_terms_name", "label": "贸易条款", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入贸易条款" } },
            { "field": "delivery_terms_code", "label": "交货条款编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入交货条款编码" } },
            { "field": "delivery_terms_name", "label": "交货条款", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入交货条款" } },
            { "field": "price_list_code", "label": "价目表编码", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入价目表编码" } },
            { "field": "price_list_name", "label": "价目表", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入价目表" } },

            { "field": "total_qty", "label": "订单数量", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "total_amount", "label": "订单总额", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "discount_amount", "label": "折扣金额", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "tax_exclusive_amount", "label": "未税金额", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "tax_amount", "label": "税额", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "tax_inclusive_amount", "label": "价税合计", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },
            { "field": "local_currency_amount", "label": "本币金额", "component": "lc-number-input", "props": { "min": 0, "digits": 6 } },

            { "field": "external_source", "label": "外部来源", "component": "vxe-select", "props": { "clearable": true, "placeholder": "请选择外部来源" }, "options": [{ "label": "手工录入", "value": "manual" }, { "label": "用友U9", "value": "u9" }, { "label": "外部系统", "value": "external" }] },
            { "field": "external_id", "label": "外部记录ID", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入外部记录ID" } },
            { "field": "external_doc_id", "label": "外部单据ID", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入外部单据ID" } },
            { "field": "external_doc_no", "label": "外部单号", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入外部单号" } },
            { "field": "source_doc_type", "label": "来源单据类型", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入来源单据类型" } },
            { "field": "source_doc_id", "label": "来源单据ID", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入来源单据ID" } },
            { "field": "source_doc_no", "label": "来源单号", "component": "vxe-input", "props": { "clearable": true, "placeholder": "请输入来源单号" } },
            { "field": "remark", "label": "备注", "component": "vxe-textarea", "props": { "clearable": true, "rows": 3, "placeholder": "请输入备注" } },
            { "field": "metadata", "label": "扩展数据", "component": "lc-json-editor", "props": { "rows": 6, "placeholder": "{}" } }
          ],
          "layout": [
            {
              "kind": "tabs",
              "defaultKey": "document",
              "tabs": [
                {
                  "key": "document",
                  "label": "单据信息",
                  "blocks": [
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 6, "blocks": [{ "kind": "field", "field": "doc_no" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "doc_type_code" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "doc_type_name" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "doc_date" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "business_date" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "status" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "org_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "org_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "sales_org_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "sales_org_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "sales_department_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "sales_department_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "salesperson_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "salesperson_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "operator_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "operator_name" }] }] }
                  ]
                },
                {
                  "key": "customer",
                  "label": "客户与收货",
                  "blocks": [
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 8, "blocks": [{ "kind": "field", "field": "customer_id" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "customer_code" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "customer_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "invoice_customer_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "invoice_customer_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "payer_customer_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "payer_customer_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "ship_to_customer_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "ship_to_customer_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "contact_name" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "contact_phone" }] }] },
                    { "kind": "field", "field": "delivery_address" }
                  ]
                },
                {
                  "key": "terms",
                  "label": "商务条款",
                  "blocks": [
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 6, "blocks": [{ "kind": "field", "field": "currency_code" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "currency_name" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "exchange_rate" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "price_includes_tax" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "payment_terms_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "payment_terms_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "settlement_method_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "settlement_method_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "trade_terms_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "trade_terms_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "delivery_terms_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "delivery_terms_name" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 12, "blocks": [{ "kind": "field", "field": "price_list_code" }] }, { "span": 12, "blocks": [{ "kind": "field", "field": "price_list_name" }] }] }
                  ]
                },
                {
                  "key": "amount",
                  "label": "金额汇总",
                  "blocks": [
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 8, "blocks": [{ "kind": "field", "field": "total_qty" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "total_amount" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "discount_amount" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 6, "blocks": [{ "kind": "field", "field": "tax_exclusive_amount" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "tax_amount" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "tax_inclusive_amount" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "local_currency_amount" }] }] }
                  ]
                },
                {
                  "key": "source",
                  "label": "来源与备注",
                  "blocks": [
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 6, "blocks": [{ "kind": "field", "field": "external_source" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "external_id" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "external_doc_id" }] }, { "span": 6, "blocks": [{ "kind": "field", "field": "external_doc_no" }] }] },
                    { "kind": "row", "gutter": 12, "columns": [{ "span": 8, "blocks": [{ "kind": "field", "field": "source_doc_type" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "source_doc_id" }] }, { "span": 8, "blocks": [{ "kind": "field", "field": "source_doc_no" }] }] },
                    { "kind": "field", "field": "remark" },
                    { "kind": "field", "field": "metadata" }
                  ]
                }
              ]
            }
          ],
          "actions": []
        }
      },
      {
        "id": "sales-order-lines-tabs",
        "kind": "tabs",
        "defaultKey": "lines",
        "tabs": [
          {
            "key": "lines",
            "label": "订单明细",
            "blocks": [
              {
                "id": "sales-order-lines-grid",
                "kind": "grid",
                "tableType": "detail",
                "sourceKey": "salesOrderLines",
                "schema": {
                  "grid": {
                    "border": true,
                    "stripe": true,
                    "showOverflow": "tooltip",
                    "height": 360,
                    "rowConfig": { "keyField": "id", "isCurrent": true },
                    "columnConfig": { "resizable": true },
                    "columns": [
                      { "type": "seq", "title": "序号", "width": 64, "align": "center" },
                      { "field": "line_no", "title": "行号", "width": 78, "align": "right", "sortable": true },
                      { "field": "item_code", "title": "物料编码", "minWidth": 140, "fixed": "left" },
                      { "field": "item_name", "title": "物料名称", "minWidth": 190, "fixed": "left" },
                      { "field": "item_spec", "title": "规格", "minWidth": 140 },
                      { "field": "uom_name", "title": "单位", "width": 82, "align": "center" },
                      { "field": "ordered_qty", "title": "订购数量", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "delivered_qty", "title": "已交数量", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "open_qty", "title": "未交数量", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "unit_price", "title": "单价", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "discount_rate", "title": "折扣率", "width": 96, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "tax_rate", "title": "税率", "width": 88, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "tax_exclusive_amount", "title": "未税金额", "width": 120, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "tax_amount", "title": "税额", "width": 110, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "tax_inclusive_amount", "title": "价税合计", "width": 120, "align": "right", "formatter": { "type": "number", "locale": "zh-CN", "emptyText": "0" } },
                      { "field": "need_date", "title": "需求日期", "width": 112 },
                      { "field": "promise_date", "title": "承诺日期", "width": 112 },
                      { "field": "delivery_date", "title": "交货日期", "width": 112 },
                      { "field": "warehouse_name", "title": "仓库", "minWidth": 130 },
                      { "field": "status", "title": "状态", "width": 90, "align": "center" },
                      { "field": "remark", "title": "备注", "minWidth": 180 }
                    ]
                  },
                  "toolbar": [
                    {
                      "code": "refresh-lines",
                      "label": "刷新明细",
                      "icon": "ri-refresh-line",
                      "script": "await this.executeAction({ node: 'sales-order-lines-grid', method: 'loadData', filters: { order_id: String(this.route.query.id || '').trim() } });"
                    }
                  ],
                  "rowActions": { "edit": false, "delete": false }
                }
              }
            ]
          }
        ]
      }
    ]
  }
  $json$::jsonb;
  v_page_id uuid;
  v_current_version integer;
  v_next_version integer;
  v_current_schema jsonb;
begin
  select id, version, schema
  into v_page_id, v_current_version, v_current_schema
  from public.lowcode_pages
  where code = 'sales-orders-edit'
  for update;

  if v_page_id is null then
    insert into public.lowcode_pages (
      code,
      route,
      title,
      description,
      page_type,
      layout,
      status,
      keep_alive,
      schema,
      version,
      published_at
    ) values (
      'sales-orders-edit',
      '/dashboard/sales/orders/edit',
      U&'\9500\552E\8BA2\5355\7F16\8F91',
      U&'\7EF4\62A4\9500\552E\8BA2\5355\5355\636E\3001\5BA2\6237\3001\5546\52A1\6761\6B3E\3001\91D1\989D\53CA\8BA2\5355\660E\7EC6\3002',
      'edit',
      'dashboard',
      'published',
      false,
      v_schema,
      1,
      timezone('utc'::text, now())
    )
    returning id, version, schema
    into v_page_id, v_current_version, v_current_schema;
  end if;

  v_next_version := case
    when v_current_schema is distinct from v_schema then v_current_version + 1
    else v_current_version
  end;

  update public.lowcode_pages
  set
    route = '/dashboard/sales/orders/edit',
    title = U&'\9500\552E\8BA2\5355\7F16\8F91',
    description = U&'\7EF4\62A4\9500\552E\8BA2\5355\5355\636E\3001\5BA2\6237\3001\5546\52A1\6761\6B3E\3001\91D1\989D\53CA\8BA2\5355\660E\7EC6\3002',
    page_type = 'edit',
    layout = 'dashboard',
    status = 'published',
    keep_alive = false,
    schema = v_schema,
    version = v_next_version,
    published_at = case
      when v_current_schema is distinct from v_schema then timezone('utc'::text, now())
      else published_at
    end,
    updated_at = case
      when v_current_schema is distinct from v_schema then timezone('utc'::text, now())
      else updated_at
    end
  where id = v_page_id;

  insert into public.lowcode_page_versions (page_id, version, schema, published_at)
  select id, version, schema, published_at
  from public.lowcode_pages
  where id = v_page_id
  on conflict (page_id, version) do update set
    schema = excluded.schema,
    published_at = excluded.published_at;

  update public.lowcode_pages as list_page
  set
    edit_page_id = v_page_id,
    updated_at = case
      when list_page.edit_page_id is distinct from v_page_id
        then timezone('utc'::text, now())
      else list_page.updated_at
    end
  where list_page.code = 'sales-orders';
end $$;

select pg_notify('pgrst', 'reload schema');
