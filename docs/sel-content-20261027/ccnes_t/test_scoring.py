import unittest
from scoring import DIMENSIONS,REVERSE,ALL_ITEMS,score
class TestCCNEST(unittest.TestCase):
    def test_partition(self):
        all_codes=[i for ids in DIMENSIONS.values() for i in ids]
        self.assertEqual(len(all_codes),72);self.assertEqual(len(set(all_codes)),72);self.assertEqual(set(all_codes),ALL_ITEMS)
        self.assertEqual(REVERSE,{'2A','7C','8C','10A'})
    def test_endpoints(self):
        for n in (1,7):
            a={i:(8-n if i in REVERSE else n) for i in ALL_ITEMS}
            self.assertTrue(all(v['mean']==n for v in score(a).values()))
    def test_each_item(self):
        a={i:(7 if i in REVERSE else 1) for i in ALL_ITEMS}
        for name,ids in DIMENSIONS.items():
            for i in ids:
                sample=a.copy();sample[i]=1 if i in REVERSE else 7;s=score(sample)
                for k in DIMENSIONS:self.assertEqual(s[k]['mean'],1.5 if k==name else 1)
    def test_missing(self):
        a={i:4 for i in ALL_ITEMS};a['2A']=None;s=score(a)
        self.assertIsNone(s['distress_reactions']['mean']);self.assertEqual(s['distress_reactions']['missing'],['2A'])
        self.assertEqual(s['punitive_reactions']['mean'],4);self.assertIsNone(score({})['minimization']['mean'])
    def test_bad_input(self):
        for v in (0,8,2.5,'3',True):
            with self.assertRaises(ValueError):score({'1A':v})
        for k in ('0A','13A','1G','01A',1):
            with self.assertRaises(ValueError):score({k:1})
    def test_sample(self):
        target=[3,2,5,5,6,2];a={i:(8-value if i in REVERSE else value) for value,ids in zip(target,DIMENSIONS.values()) for i in ids}
        self.assertEqual([v['mean'] for v in score(a).values()],target)
if __name__=='__main__':unittest.main()
