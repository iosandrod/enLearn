-- WMS 核心表演示数据，仅手动执行，不放入自动迁移目录。
-- 账套：普通用户；复用已有物料，不修改物料、权限或页面配置。
-- 标识：仓库 TEST-WMS-*、单号 WMS-TEST-20261013-*、source_type=wms_test_seed。
-- 余额和流水由正式过账函数生成，禁止直接拼造库存。
-- 重复执行发现相同 source_id 时直接跳过，不覆盖已编辑的测试单据。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_advisory_xact_lock(hashtextextended('enlearn.wms.test-data.20261013', 0));

do $seed$
declare
  v_account uuid := '00000000-0000-4000-8000-000000000001';
  v_seed uuid := 'f03e0000-2026-4013-8013-000000000001';
  v_main uuid := 'f03e1000-2026-4013-8013-000000000001';
  v_branch uuid := 'f03e1000-2026-4013-8013-000000000002';
  v_raw_main uuid := 'f03e2000-2026-4013-8013-000000000001';
  v_fg_main uuid := 'f03e2000-2026-4013-8013-000000000002';
  v_raw_branch uuid := 'f03e2000-2026-4013-8013-000000000003';
  v_fg_branch uuid := 'f03e2000-2026-4013-8013-000000000004';
  v_actor uuid;
  v_mcu uuid;
  v_pcb uuid;
  v_fg uuid;
  v_document uuid;
  v_note text := '[WMS测试数据 20261013] ';
begin
  if exists (select 1 from public.wms_document where account_id=v_account and source_id=v_seed) then
    raise notice 'WMS test dataset 20261013 already exists; no rows changed';
    return;
  end if;

  select m.user_id into v_actor
  from basejump.account_user m
  join basejump.accounts a on a.id=m.account_id
  join public.users u on u.id=m.user_id
  join auth.users au on au.id=m.user_id
  where m.account_id=v_account and u.role='admin'
    and a.status='active' and not a.personal_account
  order by (m.user_id='83ca3cc5-8ebf-4df4-a5f1-b6e695eb1256'::uuid) desc, m.user_id
  limit 1;
  if v_actor is null then raise exception 'Active WMS administrator required for test account'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  if not public.has_account_permission(v_account,'wms.core.manage') then
    raise exception 'WMS test account lacks posting permission';
  end if;

  select id into strict v_mcu from public.planning_item where account_id=v_account and name='RM-MCU-STM32';
  select id into strict v_pcb from public.planning_item where account_id=v_account and name='RM-PCB-CTRL-100';
  select id into strict v_fg from public.planning_item where account_id=v_account and name='FG-CTRL-100';

  insert into public.wms_warehouse(id,account_id,code,name,remark,created_by,updated_by) values
    (v_main,v_account,'TEST-WMS-MAIN','测试主仓',v_note||'用于原料和成品出入库演示',v_actor,v_actor),
    (v_branch,v_account,'TEST-WMS-BRANCH','测试分仓',v_note||'用于跨仓调拨演示',v_actor,v_actor);

  insert into public.wms_location(id,account_id,warehouse_id,code,name,remark,created_by,updated_by) values
    (v_raw_main,v_account,v_main,'A-01','测试主仓原料位',v_note||'原料存储',v_actor,v_actor),
    (v_fg_main,v_account,v_main,'B-01','测试主仓成品位',v_note||'成品存储',v_actor,v_actor),
    (v_raw_branch,v_account,v_branch,'A-01','测试分仓原料位',v_note||'调拨接收原料',v_actor,v_actor),
    (v_fg_branch,v_account,v_branch,'B-01','测试分仓成品位',v_note||'调拨接收成品',v_actor,v_actor);

  insert into public.wms_document
    (id,account_id,code,type,warehouse_id,target_warehouse_id,business_date,source_type,source_id,remark,created_by,updated_by)
  select ('f03e3000-2026-4013-8013-'||lpad(s.n::text,12,'0'))::uuid,
    v_account,s.code,s.type,v_main,case when s.type='transfer' then v_branch end,
    s.business_date,'wms_test_seed',v_seed,v_note||s.remark,v_actor,v_actor
  from (values
    (1,'WMS-TEST-20261013-IN-001','receipt',date '2026-10-09','已过账入库：MCU 200只、控制板150块、成品50台'),
    (2,'WMS-TEST-20261013-OUT-001','issue',date '2026-10-10','已过账出库：MCU 30只、控制板20块'),
    (3,'WMS-TEST-20261013-TR-001','transfer',date '2026-10-11','已过账调拨：MCU 40只、成品10台调往测试分仓'),
    (4,'WMS-TEST-20261013-COUNT-001','count',date '2026-10-12','已过账盘点：主仓MCU盘亏2只、主仓成品盘盈1台'),
    (5,'WMS-TEST-20261013-ADJ-001','adjustment',date '2026-10-13','已过账调整：控制板增加5块、主仓成品减少2台'),
    (6,'WMS-TEST-20261013-IN-DRAFT','receipt',date '2026-10-13','草稿入库，可用于编辑明细，不影响库存'),
    (7,'WMS-TEST-20261013-OUT-DRAFT','issue',date '2026-10-13','草稿出库，可用于编辑，不影响库存'),
    (8,'WMS-TEST-20261013-ADJ-CANCEL','adjustment',date '2026-10-13','已取消调整，不影响库存')
  ) s(n,code,type,business_date,remark);

  insert into public.wms_document_line
    (account_id,document_id,line_no,item_id,location_id,target_location_id,batch,
     quantity,expected_quantity,remark,created_by,updated_by)
  select v_account,('f03e3000-2026-4013-8013-'||lpad(s.document_no::text,12,'0'))::uuid,
    s.line_no,s.item_id,s.location_id,s.target_location_id,s.batch,
    s.quantity,s.expected_quantity,v_note||s.remark,v_actor,v_actor
  from (values
    (1,1,v_mcu,v_raw_main,null::uuid,'TEST-20261013-A',200::numeric,null::numeric,'MCU入库'),
    (1,2,v_pcb,v_raw_main,null::uuid,'TEST-20261013-A',150,null::numeric,'控制板入库'),
    (1,3,v_fg,v_fg_main,null::uuid,'TEST-20261013-B',50,null::numeric,'成品入库'),
    (2,1,v_mcu,v_raw_main,null::uuid,'TEST-20261013-A',30,null::numeric,'MCU出库'),
    (2,2,v_pcb,v_raw_main,null::uuid,'TEST-20261013-A',20,null::numeric,'控制板出库'),
    (3,1,v_mcu,v_raw_main,v_raw_branch,'TEST-20261013-A',40,null::numeric,'MCU跨仓调拨'),
    (3,2,v_fg,v_fg_main,v_fg_branch,'TEST-20261013-B',10,null::numeric,'成品跨仓调拨'),
    (4,1,v_mcu,v_raw_main,null::uuid,'TEST-20261013-A',128,130,'MCU账面130、实盘128'),
    (4,2,v_fg,v_fg_main,null::uuid,'TEST-20261013-B',41,40,'主仓成品账面40、实盘41'),
    (5,1,v_pcb,v_raw_main,null::uuid,'TEST-20261013-A',5,null::numeric,'控制板调增'),
    (5,2,v_fg,v_fg_main,null::uuid,'TEST-20261013-B',-2,null::numeric,'成品调减'),
    (6,1,v_mcu,v_raw_main,null::uuid,'TEST-20261013-A',60,null::numeric,'待入库MCU'),
    (6,2,v_pcb,v_raw_main,null::uuid,'TEST-20261013-A',40,null::numeric,'待入库控制板'),
    (7,1,v_fg,v_fg_main,null::uuid,'TEST-20261013-B',5,null::numeric,'待出库成品'),
    (8,1,v_pcb,v_raw_main,null::uuid,'TEST-20261013-A',-3,null::numeric,'已取消控制板调整')
  ) s(document_no,line_no,item_id,location_id,target_location_id,batch,quantity,expected_quantity,remark);

  -- 按编号过账：入库 -> 出库 -> 调拨 -> 盘点 -> 调整。
  for v_document in select id from public.wms_document where account_id=v_account and source_id=v_seed
    and id between 'f03e3000-2026-4013-8013-000000000001'::uuid
      and 'f03e3000-2026-4013-8013-000000000005'::uuid order by id
  loop
    perform public.wms_post_document(v_account,v_document);
  end loop;
  update public.wms_document set status='cancelled',updated_by=v_actor
    where id='f03e3000-2026-4013-8013-000000000008' and account_id=v_account;

  if (select count(*) from public.wms_inventory_balance where account_id=v_account
      and location_id in(v_raw_main,v_fg_main,v_raw_branch,v_fg_branch))<>5 then
    raise exception 'Expected five test inventory balances';
  end if;
  if (select count(*) from public.wms_inventory_ledger g join public.wms_document_line l
      on l.id=g.document_line_id join public.wms_document d on d.id=l.document_id
      where d.account_id=v_account and d.source_id=v_seed)<>13 then
    raise exception 'Expected thirteen test inventory ledger records';
  end if;
  if exists (
    select 1 from (values
      (v_mcu,v_raw_main,128::numeric),(v_mcu,v_raw_branch,40::numeric),
      (v_pcb,v_raw_main,135::numeric),(v_fg,v_fg_main,39::numeric),(v_fg,v_fg_branch,10::numeric)
    ) expected(item_id,location_id,quantity)
    left join public.wms_inventory_balance b on b.account_id=v_account
      and b.item_id=expected.item_id and b.location_id=expected.location_id
    where b.quantity is distinct from expected.quantity
  ) then raise exception 'Unexpected final test inventory quantities'; end if;
end;
$seed$;
commit;
