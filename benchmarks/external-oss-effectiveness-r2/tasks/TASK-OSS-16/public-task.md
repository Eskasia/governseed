# TASK-OSS-16

Constructing `pytest.approx()` for a `timedelta` with an infinite relative tolerance must reject the tolerance with a clear `ValueError`, rather than overflowing while calculating the effective tolerance.

