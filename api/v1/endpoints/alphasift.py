# -*- coding: utf-8 -*-
"""
Alphasift 自动选股 API endpoints.
"""

import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()

ALPHASIFT_TASKS: Dict[str, Dict[str, Any]] = {}


class AlphasiftScreenRequest(BaseModel):
    strategy: str = Field(..., description="策略名称，如 dual_low, balanced_alpha 等")
    market: str = Field(default="cn", description="市场，cn/港/美")
    max_output: Optional[int] = Field(default=None, description="最大输出数量")
    use_llm: bool = Field(default=False, description="是否使用 LLM 排序")
    llm_context: Optional[str] = Field(default=None, description="传给 LLM 的市场上下文")
    post_analyzers: Optional[str] = Field(default=None, description="后分析器，逗号分隔，如 dsa,scorecard")
    collect_llm_candidate_context: bool = Field(default=False, description="是否收集候选上下文")
    deep_analysis: bool = Field(default=False, description="是否深度分析")


class PickItem(BaseModel):
    rank: int
    code: str
    name: str
    final_score: float
    screen_score: float
    change_pct: float
    price: float
    pe: Optional[float] = None
    pb: Optional[float] = None
    industry: str
    concepts: str


class AlphasiftScreenResponse(BaseModel):
    task_id: str
    strategy: str
    message: str
    count: int = 0
    picks: List[PickItem] = []


class AlphasiftTaskStartResponse(BaseModel):
    task_id: str
    status: str
    message: str


class AlphasiftTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    message: str
    progress: int = 0
    strategy: Optional[str] = None
    count: int = 0
    picks: List[PickItem] = []
    error: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


def _import_alphasift():
    """Import alphasift from alphasift_pkg.alphasift"""
    import sys
    sys.path.insert(0, "/app")
    try:
        from alphasift_pkg.alphasift.pipeline import screen
        return screen
    except ImportError:
        try:
            from alphasift.pipeline import screen
            return screen
        except ImportError as e:
            raise ImportError(f"Cannot find alphasift module: {e}")


def _import_list_strategies():
    """Import list_strategies from alphasift_pkg.alphasift"""
    import sys
    sys.path.insert(0, "/app")
    try:
        from alphasift_pkg.alphasift.strategy import list_strategies
        return list_strategies
    except ImportError:
        try:
            from alphasift.strategy import list_strategies
            return list_strategies
        except ImportError as e:
            raise ImportError(f"Cannot find alphasift.strategy: {e}")


def _pick_items_from_result(result) -> List[PickItem]:
    picks = []
    if result and result.picks:
        for p in result.picks:
            picks.append(PickItem(
                rank=p.rank,
                code=p.code,
                name=p.name,
                final_score=p.final_score,
                screen_score=p.screen_score,
                change_pct=p.change_pct,
                price=p.price,
                pe=getattr(p, "pe_ratio", None),
                pb=getattr(p, "pb_ratio", None),
                industry=p.industry,
                concepts=p.concepts,
            ))
    return picks


def _build_screen_kwargs(req: AlphasiftScreenRequest):
    screen_kwargs = {
        "strategy": req.strategy,
        "market": req.market,
        "use_llm": req.use_llm,
    }
    if req.max_output:
        screen_kwargs["max_output"] = req.max_output
    if req.llm_context:
        screen_kwargs["llm_context"] = req.llm_context
    if req.post_analyzers:
        screen_kwargs["post_analyzers"] = req.post_analyzers.split(",")
    if req.collect_llm_candidate_context:
        screen_kwargs["collect_llm_candidate_context"] = True
    if req.deep_analysis:
        screen_kwargs["deep_analysis"] = True
    return screen_kwargs


def _run_screen_task(task_id: str, req: AlphasiftScreenRequest):
    now = datetime.utcnow().isoformat()
    task = ALPHASIFT_TASKS.get(task_id)
    if not task:
        return
    task.update({"status": "running", "message": "正在执行筛选任务...", "progress": 10, "updated_at": now})
    try:
        screen = _import_alphasift()
        screen_kwargs = _build_screen_kwargs(req)
        task.update({
            "message": "正在获取行情并执行策略筛选；LLM排序/DSA深度分析可能耗时较长...",
            "progress": 30,
            "updated_at": datetime.utcnow().isoformat(),
        })
        logger.info(f"[Alphasift async screen] task_id={task_id}, args={screen_kwargs}")
        result = screen(**screen_kwargs)
        task.update({"message": "正在保存筛选结果...", "progress": 90, "updated_at": datetime.utcnow().isoformat()})

        try:
            _, save_fn = _import_store()
            save_fn(result, data_dir=_get_data_dir())
            logger.info(f"[Alphasift async screen] result saved to {_get_data_dir() / 'runs'}")
        except Exception as save_err:
            logger.warning(f"[Alphasift async screen] failed to save result: {save_err}")

        picks = _pick_items_from_result(result)
        task.update({
            "status": "completed",
            "message": f"筛选完成，共 {len(picks)} 只股票" if picks else "筛选完成，无符合条件股票",
            "progress": 100,
            "strategy": req.strategy,
            "count": len(picks),
            "picks": [p.model_dump() for p in picks],
            "updated_at": datetime.utcnow().isoformat(),
        })
    except Exception as e:
        logger.exception(f"Alphasift async screen error: {e}")
        task.update({
            "status": "failed",
            "message": "筛选失败",
            "progress": 100,
            "error": str(e),
            "updated_at": datetime.utcnow().isoformat(),
        })


@router.post("/screen/start", response_model=AlphasiftTaskStartResponse)
async def start_screen_task(req: AlphasiftScreenRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    ALPHASIFT_TASKS[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "message": "任务已提交，等待后端执行...",
        "progress": 0,
        "strategy": req.strategy,
        "count": 0,
        "picks": [],
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    background_tasks.add_task(_run_screen_task, task_id, req)
    return AlphasiftTaskStartResponse(task_id=task_id, status="queued", message="任务已提交，页面将自动刷新进度")


@router.get("/screen/status/{task_id}", response_model=AlphasiftTaskStatusResponse)
async def get_screen_task_status(task_id: str):
    task = ALPHASIFT_TASKS.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return AlphasiftTaskStatusResponse(**task)


@router.post("/screen", response_model=AlphasiftScreenResponse)
async def screen_stocks(req: AlphasiftScreenRequest):
    task_id = str(uuid.uuid4())

    try:
        screen = _import_alphasift()
    except ImportError as e:
        logger.error(f"Failed to import alphasift: {e}")
        raise HTTPException(status_code=500, detail=f"Alphasift 模块导入失败: {e}")

    screen_kwargs = _build_screen_kwargs(req)

    try:
        logger.info(f"[Alphasift screen] task_id={task_id}, args={screen_kwargs}")
        result = screen(**screen_kwargs)

        try:
            _, save_fn = _import_store()
            save_fn(result, data_dir=_get_data_dir())
            logger.info(f"[Alphasift screen] result saved to {_get_data_dir() / 'runs'}")
        except Exception as save_err:
            logger.warning(f"[Alphasift screen] failed to save result: {save_err}")

        picks = _pick_items_from_result(result)
        return AlphasiftScreenResponse(
            task_id=task_id,
            strategy=req.strategy,
            message=f"筛选完成，共 {len(picks)} 只股票" if picks else "筛选完成，无符合条件股票",
            count=len(picks),
            picks=picks,
        )
    except Exception as e:
        logger.error(f"Alphasift screen error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/strategies")
async def list_strategies():
    try:
        fn = _import_list_strategies()
        strategies = fn()
        return {"strategies": strategies}
    except Exception as e:
        logger.error(f"Failed to list strategies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _import_store():
    """Import store helpers from alphasift_pkg"""
    import sys
    sys.path.insert(0, "/app")
    try:
        from alphasift_pkg.alphasift.store import list_saved_runs, save_screen_result
        return list_saved_runs, save_screen_result
    except ImportError:
        from alphasift.store import list_saved_runs, save_screen_result
        return list_saved_runs, save_screen_result


def _get_data_dir():
    """Get ALPHASIFT_DATA_DIR, fallback to /app/data"""
    import os
    from pathlib import Path
    d = os.getenv("ALPHASIFT_DATA_DIR", "/app/data")
    p = Path(d)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("/runs")
async def list_runs():
    """List saved screen runs"""
    try:
        store_fn = _import_store()
        list_fn = store_fn[0] if isinstance(store_fn, tuple) else store_fn
        runs = list_fn(data_dir=_get_data_dir())
        return {"runs": runs, "count": len(runs)}
    except Exception as e:
        logger.error(f"Failed to list runs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    """Delete a saved screen run"""
    from pathlib import Path
    try:
        safe_run_id = Path(run_id).name
        path = _get_data_dir() / "runs" / f"{safe_run_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Run not found")
        path.unlink()
        return {"success": True, "run_id": safe_run_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete run {run_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """Get saved screen run detail with full picks list"""
    import json
    from pathlib import Path
    try:
        safe_run_id = Path(run_id).name
        path = _get_data_dir() / "runs" / f"{safe_run_id}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Run not found")
        text = path.read_text(encoding="utf-8")
        data = json.loads(text, parse_constant=lambda _: None)
        picks = data.get("picks") or []
        return {
            "run_id": safe_run_id,
            "strategy": data.get("strategy", ""),
            "market": data.get("market", "cn"),
            "created_at": data.get("created_at", ""),
            "picks": picks,
            "count": len(picks),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get run {run_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
