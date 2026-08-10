import frepple, json

r = json.load(open('/work/request.json'))
json.dump(r['model'], open('/tmp/model.json', 'w'))
frepple.readJSONfile('/tmp/model.json')
frepple.settings.suppressFlowplanCreation = False

for name in ['RT-FG-CTRL-100', 'OP-FG-010-FINAL-ASSY', 'OP-FG-020-AGING', 'OP-FG-030-FINAL-QC', 'OP-FG-040-PACK']:
    o = frepple.operation(name=name)
    print('OP', name, type(o), 'item', getattr(o, 'item', None), 'hidden', o.hidden)
    print('  flows', [(x.buffer.name, x.quantity, type(x)) for x in o.flows])
    print('  loads', [(x.resource.name, x.quantity) for x in o.loads])
    print('  subops', [(x.operation.name, x.priority) for x in getattr(o, 'suboperations', [])])

for b in frepple.buffers():
    if b.item.name == 'FG-CTRL-100':
        print('BUFFER', b.name, 'producing', b.producing, 'flows', [(x.operation.name, x.quantity) for x in b.flows])

s = frepple.solver_mrp(constraints=52, plantype=1, loglevel=3, lazydelay=86400,
                       minimumdelay=3600, rotateresources=True, iterationmax=0,
                       resourceiterationmax=500, administrativeleadtime=0,
                       autofence=86313600, algorithm='heuristic')
s.solve()

for p in frepple.operationplans():
    if any(token in p.operation.name for token in ['FG-CTRL', 'FINAL', 'AGING', 'PACK']):
        print('PLAN', p.reference, p.operation.name, p.quantity, p.start, p.end,
              p.status, 'demand', p.demand, 'owner', p.owner)
