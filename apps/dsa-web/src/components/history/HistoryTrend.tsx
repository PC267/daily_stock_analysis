import type React from 'react';
import { ArrowLeft } from 'lucide-react';
import type { HistoryItem } from '../../types/analysis';
import { getSentimentColor } from '../../types/analysis';
import { Button } from '../common';

interface HistoryTrendProps {
  items: HistoryItem[];
  stockName: string;
  stockCode: string;
  selectedId?: number;
  isLoading?: boolean;
  onItemClick: (recordId: number) => void;
  onDeleteItem?: (recordId: number) => void;
  onBack: () => void;
  className?: string;
}

/** Format change percentage with sign */
const formatChangePct = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

/** Format number to 2 decimal places */
const formatNum = (value: number | undefined | null, decimals = 2): string => {
  if (value === undefined || value === null) return '—';
  return value.toFixed(decimals);
};

/** Get a short label from the advice string */
const getOperationLabel = (advice?: string): string => {
  const text = advice?.trim();
  if (!text) return '—';
  if (text.includes('买入') || text.includes('加仓') || text.includes('布局')) return '买入';
  if (text.includes('卖出') || text.includes('减仓')) return '卖出';
  if (text.includes('观望') || text.includes('持有') || text.includes('等待')) return '观望';
  return text.slice(0, 4);
};

/** Get display color for change pct */
const getChangeColor = (pct: number | undefined | null): string | undefined => {
  if (pct === undefined || pct === null) return undefined;
  if (pct > 0) return '#22c55e';
  if (pct < 0) return '#ef4444';
  return undefined;
};

/** Format datetime to short display */
const formatShortDateTime = (value: string): string => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mi = `${d.getMinutes()}`.padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return value;
  }
};

/**
 * HistoryTrend — shows a tabular trend view of multiple analysis
 * records for a single stock.
 */
export const HistoryTrend: React.FC<HistoryTrendProps> = ({
  items,
  stockName,
  stockCode,
  selectedId,
  isLoading = false,
  onItemClick,
  onDeleteItem,
  onBack,
  className = '',
}) => {
  if (isLoading) {
    return (
      <aside className={`glass-card overflow-hidden flex flex-col ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="home-spinner h-5 w-5 animate-spin border-2" />
        </div>
      </aside>
    );
  }

  return (
    <aside className={`glass-card overflow-hidden flex flex-col ${className}`}>
      <div className="p-4">
        {/* Header with back button + stock info */}
        <div className="mb-4 flex items-center gap-2">
          <Button
            variant="ghost"
            size="xsm"
            onClick={onBack}
            className="!p-1"
            aria-label="返回历史列表"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {stockName}
              </span>
              <span className="shrink-0 text-[11px] text-muted-text font-mono">
                {stockCode}
              </span>
            </div>
            <p className="text-[11px] text-secondary-text mt-0.5">
              近 {items.length} 次分析
            </p>
          </div>
        </div>

        {/* Trend table */}
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <svg className="mb-2 h-8 w-8 text-subtle-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <p className="text-xs text-secondary-text">暂无该股票的历史分析记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] leading-tight">
              <thead>
                <tr className="border-b border-subtle text-secondary-text">
                  <th className="pb-2 pr-2 text-left font-medium">时间</th>
                  <th className="pb-2 pr-2 text-left font-medium">分析结果</th>
                  <th className="pb-2 pl-2 text-right font-medium">操作</th>
                  <th className="pb-2 pr-2 text-right font-medium">分数</th>
                  <th className="pb-2 pr-2 text-right font-medium">涨跌幅</th>
                  <th className="pb-2 pr-2 text-right font-medium">量比</th>
                  <th className="pb-2 text-right font-medium">换手率</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const sentimentColor = item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
                  const changeColor = getChangeColor(item.changePct);
                  const isSelected = selectedId === item.id;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onItemClick(item.id)}
                      className={`cursor-pointer border-b border-subtle/50 transition-colors hover:bg-hover/50 ${
                        isSelected ? 'bg-primary/5' : ''
                      }`}
                    >
                      {/* 时间 */}
                      <td className="py-2.5 pr-2 align-top">
                        <span className="whitespace-nowrap text-muted-text">
                          {formatShortDateTime(item.createdAt)}
                        </span>
                      </td>

                      {/* 分析结果 */}
                      <td className="py-2.5 pr-2 align-top">
                        <div className="flex items-center gap-1.5">
                          {sentimentColor && (
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: sentimentColor }}
                            />
                          )}
                          <span
                            className="font-medium"
                            style={sentimentColor ? { color: sentimentColor } : undefined}
                          >
                            {getOperationLabel(item.operationAdvice)}
                          </span>
                          {item.trendPrediction && (
                            <span className="text-muted-text">
                              ({item.trendPrediction})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 操作 */}
                      <td className="py-2.5 pl-2 text-right align-top">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteItem?.(item.id);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-secondary-text transition-all hover:bg-danger/10 hover:text-danger"
                          title="删除此条分析记录"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>

                      {/* 分数 */}
                      <td className="py-2.5 pr-2 text-right align-top font-mono">
                        {item.sentimentScore ?? '—'}
                      </td>

                      {/* 涨跌幅 */}
                      <td className="py-2.5 pr-2 text-right align-top">
                        <span
                          className="font-mono font-semibold"
                          style={changeColor ? { color: changeColor } : undefined}
                        >
                          {formatChangePct(item.changePct)}
                        </span>
                      </td>

                      {/* 量比 */}
                      <td className="py-2.5 pr-2 text-right align-top font-mono">
                        {formatNum(item.volumeRatio, 2)}
                      </td>

                      {/* 换手率 */}
                      <td className="py-2.5 text-right align-top font-mono">
                        {formatNum(item.turnoverRate, 2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </aside>
  );
};

export default HistoryTrend;
