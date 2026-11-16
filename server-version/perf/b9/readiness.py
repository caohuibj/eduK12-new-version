"""Fail-closed readiness decision for a load runner's actual telemetry.

This module does not launch a workload or collect telemetry. Callers must wire
it into the runner before releasing its first request and persist all samples.
"""

from dataclasses import dataclass
from math import isfinite
from typing import Optional


@dataclass(frozen=True)
class Sample:
    at: float  # monotonic seconds on the evaluator's clock
    memory_available_bytes: Optional[int]
    cpu_percent: Optional[float]
    services_healthy: Optional[bool]
    outstanding_requests: Optional[int]


class ReadinessGate:
    def __init__(self, started_at: float, *, memory_mib: int = 900,
                 cpu_below: float = 15.0, stable_seconds: float = 5.0,
                 max_wait_seconds: float = 120.0, max_gap_seconds: float = 1.5):
        values = (started_at, cpu_below, stable_seconds, max_wait_seconds, max_gap_seconds)
        if (not all(isfinite(v) for v in values) or memory_mib <= 0
                or not 0 < cpu_below <= 100 or stable_seconds <= 0
                or max_wait_seconds <= 0 or max_gap_seconds <= 0):
            raise ValueError('invalid readiness limits')
        self.started_at = started_at
        self.memory_bytes = memory_mib * 1024 * 1024
        self.cpu_below = cpu_below
        self.stable_seconds = stable_seconds
        self.max_wait_seconds = max_wait_seconds
        self.max_gap_seconds = max_gap_seconds
        self.first_good = None
        self.last_at = None
        self.finished = None

    def observe(self, sample: Sample) -> str:
        if self.finished:
            return self.finished
        if (not isfinite(sample.at) or sample.at < self.started_at
                or (self.last_at is not None and sample.at <= self.last_at)):
            self.finished = 'NOT_READY'
            return self.finished
        if sample.at - self.started_at >= self.max_wait_seconds:
            self.finished = 'NOT_READY'
            return self.finished
        if self.last_at is not None and sample.at - self.last_at > self.max_gap_seconds:
            self.first_good = None
        self.last_at = sample.at
        good = (sample.memory_available_bytes is not None
                and sample.memory_available_bytes >= self.memory_bytes
                and sample.cpu_percent is not None and isfinite(sample.cpu_percent)
                and 0 <= sample.cpu_percent < self.cpu_below
                and sample.services_healthy is True
                and sample.outstanding_requests == 0
                and not isinstance(sample.outstanding_requests, bool))
        if not good:
            self.first_good = None
            return 'WAIT'
        if self.first_good is None:
            self.first_good = sample.at
        if sample.at - self.first_good >= self.stable_seconds:
            self.finished = 'READY'
            return self.finished
        return 'WAIT'
