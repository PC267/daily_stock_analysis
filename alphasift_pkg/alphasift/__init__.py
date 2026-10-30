# -*- coding: utf-8 -*-
"""alphasift — 自动选股 Skill"""

__version__ = "0.2.0"

from .pipeline import screen
from .evaluate import evaluate_saved_run, evaluate_saved_runs
from .strategy import list_strategies
from .audit import audit_project

__all__ = [
    "__version__",
    "screen",
    "evaluate_saved_run",
    "evaluate_saved_runs",
    "list_strategies",
    "audit_project",
]
