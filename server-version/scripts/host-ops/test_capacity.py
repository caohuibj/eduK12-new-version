import datetime as dt
import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('capacity',Path(__file__).with_name('capacity.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class CapacityTests(unittest.TestCase):
    def test_minute_growth_never_becomes_daily_prediction(self):
        now=dt.datetime.fromisoformat('2026-10-13T10:00:00+00:00')
        rows=[{'at':'2026-10-13T09:00:00+00:00','cos_bytes':1},{'at':now.isoformat(),'cos_bytes':10**9}]
        self.assertIsNone(m.trend(rows,'cos_bytes',now))
    def test_history_is_daily_bounded_and_growth_has_measurable_headroom(self):
        now=dt.datetime.fromisoformat('2026-10-13T10:00:00+00:00')
        rows=[{'at':(now-dt.timedelta(days=i)).isoformat(),'disk_used_bytes':(31-i)*m.GIB} for i in range(40,-1,-1)]
        rows=m.retain_history(rows,rows[-1]);self.assertEqual(len(rows),31)
        self.assertAlmostEqual(m.trend(rows,'disk_used_bytes',now),m.GIB)
        again=m.retain_history(rows,{**rows[-1],'disk_used_bytes':99})
        self.assertEqual(len(again),31);self.assertEqual(again[-1]['disk_used_bytes'],99)
    def test_conservative_retention_envelope_and_oversized_group_alert(self):
        current={'at':'2026-10-13T10:00:00+00:00','cos_bytes':35*m.GIB,'host_backup_bytes':m.GIB,'disk_free_bytes':25*m.GIB}
        policy={'retention':{'dailyDays':30,'weeklyWeeks':12,'monthlyMonths':12},'quarantineHours':48,'maxDeleteBytes':512*1024**2}
        receipt={'objects':[{'key':'host-backups/v1/id/database.edubackup.enc','bytes':198219469},{'key':'host-backups/v1/id/server-config.gcm','bytes':9512}]}
        result=m.assess([current],current,receipt,policy)
        self.assertEqual(result['host_backup_point_upper_bound'],60)
        self.assertLess(result['estimated_total_cos_envelope_bytes'],46*m.GIB)
        self.assertIsNone(result['days_to_6GiB_reserve'])
        receipt['objects'][0]['bytes']=512*1024**2
        self.assertEqual(m.assess([current],current,receipt,policy)['checks'][-1]['level'],'critical')
if __name__=='__main__':unittest.main()
