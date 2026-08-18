import frepple, json
r=json.load(open('/work/request.json'));json.dump(r['model'],open('/tmp/model.json','w'));frepple.readJSONfile('/tmp/model.json')
c=frepple.calendar(name='CAL-EM-WORKDAY 电子制造工作日历')
for d in ['2026-08-10T00:00:00','2026-08-10T08:00:00','2026-08-10T09:00:00','2026-08-10T13:00:00','2026-08-10T15:00:00','2026-08-11T08:00:00']:
  import datetime
  x=datetime.datetime.fromisoformat(d)
  try: print(d,c.value(x))
  except Exception as e: print(d,e)
print([(x.start,x.end,x.value,x.days,x.starttime,x.endtime) for x in c.buckets])
