"""Bounded daily observations and conservative capacity envelopes; no remediation."""
import datetime as dt
import math
GIB=1024**3

def trend(samples,field,now):
    rows=[s for s in samples if field in s and 0<=(now-dt.datetime.fromisoformat(s['at'])).total_seconds()<=8*86400]
    if len(rows)<3:return None
    elapsed=(dt.datetime.fromisoformat(rows[-1]['at'])-dt.datetime.fromisoformat(rows[0]['at'])).total_seconds()/86400
    return (rows[-1][field]-rows[0][field])/elapsed if elapsed>=3 else None

def retain_history(samples,current):
    by_day={s['at'][:10]:s for s in [*samples,current]}
    return sorted(by_day.values(),key=lambda s:s['at'])[-31:]

def assess(history,current,receipt,cleanup,protected_points=1):
    now=dt.datetime.fromisoformat(current['at'])
    r=cleanup['retention']
    points=r['dailyDays']+r['weeklyWeeks']+r['monthlyMonths']+2+protected_points+math.ceil(cleanup['quarantineHours']/24)+1
    objects=receipt.get('objects',[])
    database=next((o.get('bytes',0) for o in objects if o.get('key','').endswith('/database.edubackup.enc')),0)
    point=sum(o.get('bytes',0) for o in objects)+4096
    host_budget=points*point
    cos_estimate=current['cos_bytes']-current.get('host_backup_bytes',0)+host_budget
    disk_growth=trend(history,'disk_used_bytes',now);cos_growth=trend(history,'cos_bytes',now)
    reserve=6*GIB
    days=(current['disk_free_bytes']-reserve)/disk_growth if disk_growth and disk_growth>0 else None
    checks=[
      {'key':'capacity:disk_forecast','level':'warning' if days is not None and days<14 else 'ok','details':{'days_to_6GiB_reserve':days,'trend_available':disk_growth is not None}},
      {'key':'capacity:cos_budget','level':'critical' if current['cos_bytes']>=64*GIB else 'warning' if current['cos_bytes']>=50*GIB else 'ok','details':{'bytes':current['cos_bytes'],'warning_bytes':50*GIB,'critical_bytes':64*GIB}},
      {'key':'capacity:cos_trend','level':'warning' if cos_growth is not None and cos_growth>2*GIB else 'ok','details':{'bytes_per_day':cos_growth,'trend_available':cos_growth is not None}},
      {'key':'capacity:backup_batch','level':'critical' if point>cleanup['maxDeleteBytes'] else 'warning' if database>0.8*512*1024**2 else 'ok','details':{'latest_point_bytes':point,'delete_budget_bytes':cleanup['maxDeleteBytes']}}]
    return {'at':current['at'],'host_backup_point_upper_bound':points,'latest_database_bytes':database,
      'estimated_host_backup_envelope_bytes':host_budget,'estimated_total_cos_envelope_bytes':cos_estimate,
      'assumption':'same daily DB size and unchanged business/attachment/archive bytes; planning envelope, not a quota',
      'disk_bytes_per_day':disk_growth,'cos_bytes_per_day':cos_growth,'days_to_6GiB_reserve':days,
      'history_days':len(history),'checks':checks}
