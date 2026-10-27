import unittest
from scoring import DIMENSIONS, score
class TestSECTRS(unittest.TestCase):
    def test_bounds(self):
        for value in [1,6]:
            s=score({i:value for i in range(1,15)})
            for name,ids in DIMENSIONS.items():
                self.assertEqual((s[name]['sum'],s[name]['mean']),(value*len(ids),value))
    def test_every_item(self):
        for name,ids in DIMENSIONS.items():
            for i in ids:
                a={j:1 for j in range(1,15)};a[i]=6;s=score(a)
                for k,ks in DIMENSIONS.items(): self.assertEqual(s[k]['sum'],len(ks)+(5 if k==name else 0))
    def test_missing(self):
        a={i:4 for i in range(1,15)};a[14]=None;s=score(a)
        self.assertEqual(s['teacher_student_relationships']['missing'],[14]);self.assertIsNone(s['teacher_student_relationships']['sum'])
        self.assertEqual(s['emotion_regulation']['sum'],12)
        self.assertIsNone(score({})['social_awareness']['mean'])
    def test_bad_inputs(self):
        for v in [0,7,1.5,True,'4']:
            with self.assertRaises(ValueError):score({1:v})
        for k in [0,15,'1',True]:
            with self.assertRaises(ValueError):score({k:1})
    def test_sample(self):
        s=score({1:5,5:4,8:5,10:4,14:5,2:3,6:4,11:4,3:5,7:4,12:5,4:4,9:5,13:4})
        self.assertEqual([s[k]['sum'] for k in DIMENSIONS],[23,11,14,13])
        self.assertEqual(s['teacher_student_relationships']['mean'],4.6)
        self.assertAlmostEqual(s['emotion_regulation']['mean'],11/3)
if __name__=='__main__': unittest.main()
