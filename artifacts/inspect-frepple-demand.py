import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');
for d in frepple.demands():
 print('DEMAND',d.name,type(d),getattr(d,'owner',None),getattr(d,'quantity',None),getattr(d,'status',None),getattr(d,'batch',None),getattr(d,'item',None),getattr(d,'location',None))
print('buffers')
for b in frepple.buffers():
 if b.item.name=='FG-CTRL-100': print(b.name,'batch',b.batch,'onhand',b.onhand,'producing',b.producing)
s=frepple.solver_mrp(constraints=52,plantype=1,loglevel=1,lazydelay=86400,minimumdelay=3600,rotateresources=True,iterationmax=0,resourceiterationmax=500,administrativeleadtime=0,autofence=86313600,algorithm='heuristic');s.solve()
for d in frepple.demands():
 print('POST',d.name,'planned',getattr(d,'plannedquantity',None),'delivery',getattr(d,'delivery',None),'constraints',[(x.name,x.description) for x in d.constraints])
