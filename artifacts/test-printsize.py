import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');frepple.settings.suppressFlowplanCreation=False;frepple.printsize()
for b in frepple.buffers():
 if b.item.name=='FG-CTRL-100': print('before solve',b.name,b.producing,[(x.operation.name,x.quantity) for x in b.flows])
s=frepple.solver_mrp(constraints=52,plantype=1,loglevel=0,lazydelay=86400,minimumdelay=3600,rotateresources=True,iterationmax=0,resourceiterationmax=500,administrativeleadtime=0,autofence=86313600,algorithm='heuristic');s.solve()
print('opplans',[(x.reference,x.operation.name,getattr(x.owner,'reference',None)) for x in frepple.operationplans()])
