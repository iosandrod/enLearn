import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');frepple.settings.suppressFlowplanCreation=False;frepple.printsize()
for name in ['OP-FG-040-PACK','OP-FG-030-FINAL-QC','OP-FG-020-AGING','OP-FG-010-FINAL-ASSY']:
 o=frepple.operation(name=name);print(name,'duration',getattr(o,'duration',None),getattr(o,'duration_per',None),'available',getattr(o,'available',None),'size',getattr(o,'size_minimum',None),getattr(o,'size_multiple',None),getattr(o,'size_maximum',None),'deps',[(x.blockedby.name,x.safety_leadtime,x.hard_safety_leadtime) for x in getattr(o,'dependencies',[])])
for r in frepple.resources():
 if r.name in ('RES-PACK-01','RES-AGING-01','RES-FINAL-QC-01','RES-FINAL-ASSY-01'):
  print('resource',r.name,'max',r.maximum,'avail',r.available,'setup',r.setup,'matrix',r.setupmatrix,'constrained',r.constrained,'eff',r.efficiency)
for c in frepple.calendars():
 if c.name.startswith('CAL-EM'): print('calendar',c.name,'default',c.default,[(x.start,x.end,x.value,x.days,x.starttime,x.endtime) for x in c.buckets])
