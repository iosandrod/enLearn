import frepple,json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json');frepple.settings.suppressFlowplanCreation=False;frepple.printsize()
s=frepple.solver_mrp(constraints=52,plantype=1,loglevel=3,lazydelay=86400,minimumdelay=3600,rotateresources=True,iterationmax=0,resourceiterationmax=500,administrativeleadtime=0,autofence=86313600,algorithm='heuristic');s.solve()
