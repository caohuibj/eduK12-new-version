import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('reference_generator', Path(__file__).resolve().parents[1] / 'generate-learning-motivation-reference.py')
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)

class SelectionContracts(unittest.TestCase):
 def test_stage_follows_selected_valid_wave(self):
  candidates=[('upper_secondary',[None,2,None]),('junior_secondary',[2,3,4])]
  self.assertEqual(generator.select_observation(candidates,2),candidates[1])
 def test_all_incomplete_stays_with_latest_eligible_stage(self):
  candidates=[('upper_secondary',[None,2,None]),('junior_secondary',[None,None,4])]
  self.assertEqual(generator.select_observation(candidates,2),candidates[0])
  self.assertIsNone(generator.select_observation([],2))
 def test_bands_fail_closed_when_distribution_has_no_supported_split(self):
  with self.assertRaises(ValueError):generator.bands([3]*120,5)

if __name__=='__main__':unittest.main()
