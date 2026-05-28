import { useState, useEffect, useCallback } from 'react';
import { Filter, ExternalLink, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { alphasiftApi } from '../api/alphasift';
import type { ScreenRun, PickItem, StrategyInfo, AlphasiftTaskStatusResponse } from '../api/alphasift';
import { ApiErrorAlert, Button, Card, Loading, EmptyState } from '../components/common';
import type { ParsedApiError } from '../api/error';
import { getParsedApiError } from '../api/error';
import { cn } from '../utils/cn';

const FALLBACK_STRATEGIES: StrategyInfo[] = [
  { name: 'dual_low', displayName: '双低策略', description: '低估值 + 低波动' },
  { name: 'balanced_alpha', displayName: '均衡阿尔法', description: '多因子均衡' },
  { name: 'momentum_quality', displayName: '动量质量', description: '趋势 + 基本面' },
  { name: 'volume_breakout', displayName: '放量突破', description: '量价配合' },
  { name: 'oversold_reversal', displayName: '超卖反弹', description: '均值回归' },
  { name: 'shrink_pullback', displayName: '缩量回踩', description: '蓄力型' },
  { name: 'capital_heat', displayName: '资金热度', description: '板块资金流' },
  { name: 'quality_value', displayName: '优质价值', description: '基本面优选' },
];

const formatMetric = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(2);
};

const getPe = (pick: PickItem) => pick.peRatio ?? pick.pe;
const getPb = (pick: PickItem) => pick.pbRatio ?? pick.pb;

const getStrategyLabel = (strategies: StrategyInfo[], key: string) => {
  const strategy = strategies.find((item) => item.name === key);
  return strategy?.displayName || strategy?.name || key;
};


interface HistoryRowProps {
  run: ScreenRun;
  onRerun: (strategy: string) => void;
  onDelete: (runId: string) => Promise<void>;
  strategies: StrategyInfo[];
}

function HistoryRow({ run, onRerun, onDelete, strategies }: HistoryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExpand = useCallback(async () => {
    if (!expanded && picks.length === 0) {
      setLoading(true);
      try {
        const detail = await alphasiftApi.getRun(run.runId);
        setPicks(detail.picks);
      } catch {
        setPicks([]);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  }, [expanded, picks.length, run.runId]);


  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 60) return 'text-cyan';
    if (score >= 50) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const changeColor = (pct: number) => {
    if (pct > 0) return 'text-red-400';
    if (pct < 0) return 'text-emerald-400';
    return 'text-secondary-text';
  };

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-card cursor-pointer hover:bg-hover/50 transition-colors border-l-2 border-cyan/40"
        onClick={handleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-secondary-text" />
          ) : (
            <ChevronRight className="h-4 w-4 text-secondary-text" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-cyan/10 px-2 py-0.5 text-xs font-medium text-cyan">策略：{getStrategyLabel(strategies, run.strategy)}</span>
              <span className="font-mono text-xs text-secondary-text">{run.strategy}</span>
              <span className="text-xs text-secondary-text">{run.market}</span>
            </div>
            <div className="text-xs text-secondary-text mt-0.5">
              {run.createdAt} · {run.picks} 只股票
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRerun(run.strategy);
            }}
            className="flex h-7 items-center gap-1 rounded-lg bg-cyan/10 px-2 text-xs text-cyan hover:bg-cyan/20"
          >
            <ExternalLink className="h-3 w-3" />
            重新筛选
          </button>
          <button
            disabled={deleting}
            onClick={async (e) => {
              e.stopPropagation();
              if (!window.confirm("确定删除这条历史记录吗？")) return;
              setDeleting(true);
              try {
                await onDelete(run.runId);
              } finally {
                setDeleting(false);
              }
            }}
            className="flex h-7 items-center gap-1 rounded-lg bg-red-500/10 px-2 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            {deleting ? "删除中" : "删除"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/50 bg-card/50">
          {loading ? (
            <div className="p-4 text-sm text-secondary-text">加载中...</div>
          ) : picks.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs text-secondary-text">
                    <th className="pb-2 pr-3 font-medium">排名</th>
                    <th className="pb-2 pr-3 font-medium">代码</th>
                    <th className="pb-2 pr-3 font-medium">名称</th>
                    <th className="pb-2 pr-3 font-medium">得分</th>
                    <th className="pb-2 pr-3 font-medium">价格</th>
                    <th className="pb-2 pr-3 font-medium">涨跌幅</th>
                    <th className="pb-2 pr-3 font-medium">PE</th>
                    <th className="pb-2 pr-3 font-medium">PB</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((pick) => (
                    <tr
                      key={pick.code}
                      className="border-b border-border/30 hover:bg-hover/50 transition-colors"
                    >
                      <td className="py-2.5 pr-3">
                        <span className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                          pick.rank === 1 ? 'bg-yellow-400/20 text-yellow-400' :
                          pick.rank === 2 ? 'bg-slate-400/20 text-slate-300' :
                          pick.rank === 3 ? 'bg-orange-400/20 text-orange-400' :
                          'bg-cyan/10 text-cyan'
                        )}>
                          {pick.rank}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-cyan">{pick.code}</td>
                      <td className="py-2.5 pr-3 font-medium text-foreground">{pick.name}</td>
                      <td className={cn('py-2.5 pr-3 font-bold', scoreColor(pick.finalScore))}>
                        {pick.finalScore.toFixed(1)}
                      </td>
                      <td className="py-2.5 pr-3 text-foreground">{pick.price.toFixed(2)}</td>
                      <td className={cn('py-2.5 pr-3 font-medium', changeColor(pick.changePct))}>
                        {pick.changePct > 0 ? '+' : ''}{pick.changePct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 pr-3 text-secondary-text">
                        {formatMetric(getPe(pick))}
                      </td>
                      <td className="py-2.5 pr-3 text-secondary-text">
                        {formatMetric(getPb(pick))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-sm text-secondary-text">暂无数据</div>
          )}
        </div>
      )}
    </div>
  );
}

const DSA_API_URL = (window as unknown as { DSA_API_URL?: string }).DSA_API_URL || 'http://localhost:8000';

export default function AlphasiftPage() {
  const [selectedStrategy, setSelectedStrategy] = useState('dual_low');
  const [useLlM, setUseLlM] = useState(false);
  const [maxOutput, setMaxOutput] = useState(10);
  const [llmContext, setLlmContext] = useState('');
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [taskStatus, setTaskStatus] = useState<AlphasiftTaskStatusResponse | null>(null);
  const [error, setError] = useState<ParsedApiError | null>(null);
  const [picks, setPicks] = useState<PickItem[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [activeTab, setActiveTab] = useState<'screen' | 'history'>('screen');
  const [runs, setRuns] = useState<ScreenRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [strategies, setStrategies] = useState<StrategyInfo[]>(FALLBACK_STRATEGIES);

  useEffect(() => {
    document.title = '选股 - DSA';
    alphasiftApi.listStrategies()
      .then((res) => {
        if (Array.isArray(res.strategies) && res.strategies.length > 0) {
          setStrategies(res.strategies);
          setSelectedStrategy((current) => res.strategies.some((item) => item.name === current) ? current : res.strategies[0].name);
        }
      })
      .catch(() => setStrategies(FALLBACK_STRATEGIES));
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      setLoadingRuns(true);
      alphasiftApi.listRuns()
        .then(res => setRuns(res.runs))
        .catch(() => setRuns([]))
        .finally(() => setLoadingRuns(false));
    }
  }, [activeTab]);

  const handleScreen = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setPicks([]);
    setTaskStatus({
      taskId: '',
      status: 'queued',
      message: '正在提交异步筛选任务...',
      progress: 0,
      count: 0,
      picks: [],
    });

    try {
      const payload = {
        strategy: selectedStrategy,
        market: 'cn',
        max_output: maxOutput,
        use_llm: useLlM,
        llm_context: llmContext || undefined,
        deep_analysis: deepAnalysis,
      };
      const started = await alphasiftApi.startScreen(payload);
      let finalStatus: AlphasiftTaskStatusResponse | null = null;

      for (let i = 0; i < 1800; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await alphasiftApi.getScreenStatus(started.taskId);
        setTaskStatus(status);
        if (status.status === 'completed' || status.status === 'failed') {
          finalStatus = status;
          break;
        }
      }

      if (!finalStatus) {
        throw new Error('任务仍在运行，请稍后查看历史记录或重新刷新页面');
      }
      if (finalStatus.status === 'failed') {
        throw new Error(finalStatus.error || finalStatus.message || '筛选失败');
      }

      setPicks(finalStatus.picks || []);
      setHasRun(true);
      if (activeTab === 'history') {
        const res = await alphasiftApi.listRuns();
        setRuns(res.runs);
      }
    } catch (err) {
      setError(getParsedApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedStrategy, maxOutput, useLlM, llmContext, deepAnalysis, activeTab]);

  const handleRerun = useCallback((strategy: string) => {
    setSelectedStrategy(strategy);
    setActiveTab('screen');
  }, []);

  const handleDeleteRun = useCallback(async (runId: string) => {
    await alphasiftApi.deleteRun(runId);
    setRuns((prev) => prev.filter((run) => run.runId !== runId));
  }, []);

  const scoreColor = (score: number) => {
    if (score >= 75) return 'text-emerald-400';
    if (score >= 60) return 'text-cyan';
    if (score >= 50) return 'text-yellow-400';
    return 'text-orange-400';
  };

  const changeColor = (pct: number) => {
    if (pct > 0) return 'text-red-400';
    if (pct < 0) return 'text-emerald-400';
    return 'text-secondary-text';
  };

  return (
    <div className="flex min-h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-gradient shadow-[0_12px_28px_var(--nav-brand-shadow)]">
          <Filter className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alphasift 选股</h1>
          <p className="text-sm text-secondary-text">全市场策略筛选 · AI 智能排序</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        <button
          onClick={() => setActiveTab('screen')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'screen'
              ? 'border-cyan text-cyan'
              : 'border-transparent text-secondary-text hover:text-foreground'
          }`}
        >
          筛选
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-cyan text-cyan'
              : 'border-transparent text-secondary-text hover:text-foreground'
          }`}
        >
          历史记录
        </button>
      </div>

      {/* History Tab */}
      {activeTab === 'history' && (
        loadingRuns ? (
          <Loading label="加载历史记录..." />
        ) : runs.length === 0 ? (
          <EmptyState title="暂无历史记录" description="筛选后会在这里显示历史记录" />
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <HistoryRow key={run.runId} run={run} onRerun={handleRerun} onDelete={handleDeleteRun} strategies={strategies} />
            ))}
          </div>
        )
      )}

      {/* Screen Tab */}
      {activeTab === 'screen' && (
        <>
          {/* Strategy Selection */}
          <Card title="选择策略" subtitle="STRATEGY">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {strategies.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSelectedStrategy(s.name)}
                  className={cn(
                    'flex flex-col items-start rounded-xl border p-3 text-left transition-all',
                    selectedStrategy === s.name
                      ? 'border-cyan/50 bg-cyan/10 text-cyan'
                      : 'border-border/50 bg-card text-secondary-text hover:border-border hover:bg-hover'
                  )}
                >
                  <span className="font-medium">{s.displayName || s.name}</span>
                  <span className="mt-0.5 text-xs opacity-70">{s.description}</span>
                  <span className="mt-1 font-mono text-[10px] opacity-60">{s.name}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Options */}
          <Card title="筛选选项" subtitle="OPTIONS">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={useLlM}
                  onChange={(e) => setUseLlM(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-cyan"
                />
                <span className="text-sm">LLM 排序</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={deepAnalysis}
                  onChange={(e) => setDeepAnalysis(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-cyan"
                />
                <span className="text-sm">DSA 深度分析</span>
              </label>

              <div className="flex items-center gap-2">
                <label className="text-sm text-secondary-text">输出数量:</label>
                <select
                  value={maxOutput}
                  onChange={(e) => setMaxOutput(Number(e.target.value))}
                  className="h-9 rounded-xl border border-border/70 bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan/30"
                >
                  {[5, 10, 15, 20, 30].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-secondary-text">市场上下文:</label>
                <input
                  type="text"
                  value={llmContext}
                  onChange={(e) => setLlmContext(e.target.value)}
                  placeholder="可选，如：券商板块今日放量"
                  className="h-9 rounded-xl border border-border/70 bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan/30 w-64"
                />
              </div>
            </div>
          </Card>

          {/* Run Button */}
          <div className="flex items-center gap-3">
            <Button
              variant="gradient"
              size="lg"
              onClick={handleScreen}
              isLoading={isLoading}
              loadingText="筛选中..."
            >
              <Filter className="h-4 w-4" />
              开始筛选
            </Button>
            {hasRun && picks.length > 0 && (
              <span className="text-sm text-secondary-text">
                筛选出 <span className="text-cyan font-medium">{picks.length}</span> 只股票
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <ApiErrorAlert error={error} />
          )}

          {/* Loading */}
          {isLoading && (
            <Card variant="bordered" padding="sm">
              <div className="space-y-3">
                <Loading label={taskStatus?.message || '正在从全市场筛选候选股票...'} />
                <div className="h-2 overflow-hidden rounded-full bg-border/50">
                  <div
                    className="h-full rounded-full bg-cyan transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, taskStatus?.progress ?? 0))}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-secondary-text">
                  <span>任务状态：{taskStatus?.status || 'queued'}</span>
                  <span>{taskStatus?.progress ?? 0}%</span>
                </div>
              </div>
            </Card>
          )}

          {/* Empty */}
          {!isLoading && hasRun && picks.length === 0 && (
            <EmptyState
              title="无符合条件股票"
              description="当前策略未筛选出符合条件的股票，请尝试调整策略或参数"
            />
          )}

          {/* Results */}
          {!isLoading && picks.length > 0 && (
            <Card title={`筛选结果 (${picks.length})`} subtitle={'策略：' + (getStrategyLabel(strategies, selectedStrategy)) + ' · ' + selectedStrategy}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs text-secondary-text">
                      <th className="pb-2 pr-3 font-medium">排名</th>
                      <th className="pb-2 pr-3 font-medium">代码</th>
                      <th className="pb-2 pr-3 font-medium">名称</th>
                      <th className="pb-2 pr-3 font-medium">得分</th>
                      <th className="pb-2 pr-3 font-medium">价格</th>
                      <th className="pb-2 pr-3 font-medium">涨跌幅</th>
                      <th className="pb-2 pr-3 font-medium">PE</th>
                      <th className="pb-2 pr-3 font-medium">PB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picks.map((pick) => (
                      <tr
                        key={pick.code}
                        className="border-b border-border/30 hover:bg-hover/50 transition-colors"
                      >
                        <td className="py-2.5 pr-3">
                          <span className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                            pick.rank === 1 ? 'bg-yellow-400/20 text-yellow-400' :
                            pick.rank === 2 ? 'bg-slate-400/20 text-slate-300' :
                            pick.rank === 3 ? 'bg-orange-400/20 text-orange-400' :
                            'bg-cyan/10 text-cyan'
                          )}>
                            {pick.rank}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-cyan">{pick.code}</td>
                        <td className="py-2.5 pr-3 font-medium text-foreground">{pick.name}</td>
                        <td className={cn('py-2.5 pr-3 font-bold', scoreColor(pick.finalScore))}>
                          {pick.finalScore.toFixed(1)}
                        </td>
                        <td className="py-2.5 pr-3 text-foreground">{pick.price.toFixed(2)}</td>
                        <td className={cn('py-2.5 pr-3 font-medium', changeColor(pick.changePct))}>
                          {pick.changePct > 0 ? '+' : ''}{pick.changePct.toFixed(2)}%
                        </td>
                        <td className="py-2.5 pr-3 text-secondary-text">
                          {formatMetric(getPe(pick))}
                        </td>
                        <td className="py-2.5 pr-3 text-secondary-text">
                          {formatMetric(getPb(pick))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Info */}
          <Card variant="bordered" padding="sm">
            <div className="text-xs text-secondary-text">
              <p className="font-medium text-foreground mb-1">Alphasift 选股说明</p>
              <p>L1 筛选 → L2 LLM 排序 → L3 DSA 深度分析（可选）</p>
              <p className="mt-1">
                DSA_API_URL: <span className="font-mono text-cyan/70">{DSA_API_URL}</span>
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}