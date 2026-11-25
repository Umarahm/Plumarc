"""Action permissions. Anything not listed in policy.csv is denied."""

from pathlib import Path

import casbin

_HERE = Path(__file__).parent
_enforcer = casbin.Enforcer(str(_HERE / "model.conf"), str(_HERE / "policy.csv"))


def allowed_actions(*roles: str) -> list[str]:
    return sorted(
        {action for role in roles for _, action in _enforcer.get_filtered_policy(0, role)}
    )
