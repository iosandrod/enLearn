import frepple, json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');
for o in frepple.operations():
 if o.name.startswith('RT-') or o.name.startswith('OP-FG-040'):
  print(o.name,type(o),getattr(o,'item',None),getattr(o,'location',None),[(x.buffer.name,x.quantity,type(x)) for x in o.flows],[(x.operation.name,x.priority) for x in getattr(o,'suboperations',[])])
for b in frepple.buffers():
 if b.item.name=='FG-CTRL-100': print('buffer',b.name,'producing',getattr(b,'producing',None),'flows',[(x.operation.name,x.quantity) for x in b.flows])
