import unittest

from readiness import ReadinessGate, Sample


def sample(at, memory=900, cpu=14, healthy=True, outstanding=0):
    return Sample(at, None if memory is None else memory * 1024 * 1024,
                  cpu, healthy, outstanding)


class ReadinessGateTest(unittest.TestCase):
    def test_requires_five_continuous_seconds(self):
        gate = ReadinessGate(0)
        self.assertEqual([gate.observe(sample(t)) for t in range(6)],
                         ['WAIT'] * 5 + ['READY'])

    def test_bad_or_missing_observation_resets_stability(self):
        for bad in (sample(3, memory=899), sample(3, cpu=15),
                    sample(3, cpu=None), sample(3, healthy=None),
                    sample(3, outstanding=1)):
            gate = ReadinessGate(0)
            for t in range(3):
                self.assertEqual(gate.observe(sample(t)), 'WAIT')
            self.assertEqual(gate.observe(bad), 'WAIT')
            self.assertEqual([gate.observe(sample(t)) for t in range(4, 10)],
                             ['WAIT'] * 5 + ['READY'])

    def test_large_gap_and_stale_timestamp_fail_closed(self):
        gate = ReadinessGate(0)
        gate.observe(sample(0))
        self.assertEqual(gate.observe(sample(4)), 'WAIT')
        self.assertEqual(gate.observe(sample(4)), 'NOT_READY')
        self.assertEqual(gate.observe(sample(5)), 'NOT_READY')

    def test_timeout_and_880_mib_option(self):
        gate = ReadinessGate(0, memory_mib=880, max_wait_seconds=3)
        self.assertEqual(gate.observe(sample(0, memory=880)), 'WAIT')
        self.assertEqual(gate.observe(sample(3, memory=880)), 'NOT_READY')

    def test_rejects_invalid_configuration_and_bool_request_count(self):
        with self.assertRaises(ValueError):
            ReadinessGate(0, max_wait_seconds=0)
        gate = ReadinessGate(0)
        self.assertEqual(gate.observe(sample(0, outstanding=False)), 'WAIT')

    def test_malformed_metrics_never_pass(self):
        gate = ReadinessGate(0)
        for t in range(6):
            self.assertEqual(gate.observe(Sample(t, 'invalid', False, True, 0)), 'WAIT')
        self.assertEqual(gate.observe(Sample(float('nan'), None, None, None, None)), 'NOT_READY')


if __name__ == '__main__':
    unittest.main()
