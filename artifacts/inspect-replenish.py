import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json')
for b in frepple.buffers():
 if b.item.name=='FG-CTRL-100':
  print('\nBUFFER',b.name,'onhand',b.onhand,'minimum',b.minimum,'producing',b.producing)
  print('flows',[(f.operation.name,f.quantity,type(f)) for f in b.flows])
  if b.producing:
   print('producing type',type(b.producing),'subops',[(x.operation.name,x.priority) for x in getattr(b.producing,'suboperations',[])])
for o in frepple.operations():
 if 'Replenish FG-CTRL' in o.name or 'Ship FG-CTRL' in o.name:
  print('\nOP',o.name,type(o),'priority',getattr(o,'priority',None),'effective',getattr(o,'effective_start',None),getattr(o,'effective_end',None))
  print('subops',[(x.operation.name,x.priority) for x in getattr(o,'suboperations',[])])
  print('flows',[(f.buffer.name,f.quantity) for f in o.flows])
