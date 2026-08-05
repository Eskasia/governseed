from datetime import timedelta

from pytest import approx, raises


with raises(ValueError, match="relative tolerance can't be infinite"):
    approx(timedelta(seconds=1), rel=float("inf"))
