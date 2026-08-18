import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');frepple.settings.suppressFlowplanCreation=False;frepple.printsize()
for name in ['OP-FG-040-PACK','OP-FG-030-FINAL-QC','OP-FG-010-FINAL-ASSY','OP-PCBA-070-FCT','OP-PWR-020-TEST','OP-CASE-010-ASSY']:
 o=frepple.operation(name=name)
 print('\n',name,'produces',[(f.buffer.name,f.quantity,f.effective_start,f.effective_end) for f in o.flows], 'loads',[(l.resource.name,l.quantity,l.effective_start,l.effective_end) for l in o.loads])
for b in frepple.buffers():
 if b.item.name in ('FG-CTRL-100','SA-PCBA-100','SA-PWR-100','SA-CASE-100') and b.location.name=='LOC-EM-FACTORY': print('BUFFER',b.name,'producing',b.producing)
