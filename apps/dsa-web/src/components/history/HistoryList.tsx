import type React from 'react';
import { useRef, useCallback, useEffect, useId } from 'react';
import type { HistoryItem } from '../../types/analysis';
import { getSentimentColor } from '../../types/analysis';
import { Badge, Button, ScrollArea } from '../common';
import { DashboardPanelHeader, DashboardStateBlock } from '../dashboard';
import { HistoryListItem } from './HistoryListItem';

interface GroupedHistoryItem {
  item: HistoryItem;
  count: number;
}

interface HistoryListProps {
  items: HistoryItem[];
  groupedItems?: GroupedHistoryItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  selectedId?: number;  // 当前选中的历史记录 ID
  selectedIds: Set<number>;
  isDeleting?: boolean;
  onItemClick: (recordId: number) => void;  // 点击记录的回调
  onStockClick?: (stockCode: string, stockName: string) => void;
  onDeleteStock?: (stockCode: string, stockName: string) => void;
  onDeleteItem?: (recordId: number) => void;
  onLoadMore: () => void;
  onToggleItemSelection: (recordId: number) => void;
  onToggleSelectAll: () => void;
  onDeleteSelected: () => void;
  className?: string;
}

/**
 * 历史记录列表组件 (升级版)
 * 使用新设计系统组件实现，支持批量选择和滚动加载
 */
export const HistoryList: React.FC<HistoryListProps> = ({
  items,
  groupedItems,
  isLoading,
  isLoadingMore,
  hasMore,
  selectedId,
  selectedIds,
  isDeleting = false,
  onItemClick,
  onStockClick,
  onDeleteStock,
  onDeleteItem,
  onLoadMore,
  onToggleItemSelection,
  onToggleSelectAll,
  onDeleteSelected,
  className = '',
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectAllId = useId();

  const selectedCount = items.filter((item) => selectedIds.has(item.id)).length;
  const allVisibleSelected = items.length > 0 && selectedCount === items.length;
  const someVisibleSelected = selectedCount > 0 && !allVisibleSelected;

  // 使用 IntersectionObserver 检测滚动到底部
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !isLoading && !isLoadingMore) {
        const container = scrollContainerRef.current;
        if (container && container.scrollHeight > container.clientHeight) {
          onLoadMore();
        }
      }
    },
    [hasMore, isLoading, isLoadingMore, onLoadMore]
  );

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    const container = scrollContainerRef.current;
    if (!trigger || !container) return;

    const observer = new IntersectionObserver(handleObserver, {
      root: container,
      rootMargin: '20px',
      threshold: 0.1,
    });

    observer.observe(trigger);
    return () => observer.disconnect();
  }, [handleObserver]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  return (
    <aside className={`glass-card overflow-hidden flex flex-col ${className}`}>
      <ScrollArea
        viewportRef={scrollContainerRef}
        viewportClassName="p-4"
        testId="home-history-list-scroll"
      >
        <div className="mb-4 space-y-3">
          <DashboardPanelHeader
            className="mb-1"
            title="历史分析"
            titleClassName="text-sm font-medium"
            leading={(
              <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            headingClassName="items-center"
            actions={
              selectedCount > 0 ? (
                <Badge variant="info" size="sm" className="history-selection-badge animate-in fade-in zoom-in duration-200">
                  已选 {selectedCount}
                </Badge>
              ) : undefined
            }
          />

          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <label
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1"
                htmlFor={selectAllId}
              >
                <input
                  id={selectAllId}
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={onToggleSelectAll}
                  disabled={isDeleting}
                  aria-label="全选当前已加载历史记录"
                  className="history-select-all-checkbox h-3.5 w-3.5 cursor-pointer bg-transparent accent-primary focus:ring-primary/30 disabled:opacity-50"
                />
                <span className="text-[11px] text-muted-text select-none">全选当前</span>
              </label>
              <Button
                variant="danger-subtle"
                size="xsm"
                onClick={onDeleteSelected}
                disabled={selectedCount === 0 || isDeleting}
                isLoading={isDeleting}
                className="history-batch-delete-button disabled:!border-transparent disabled:!bg-transparent"
              >
                {isDeleting ? '删除中' : '删除'}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <DashboardStateBlock
            loading
            compact
            title="加载历史记录中..."
          />
        ) : items.length === 0 ? (
          <DashboardStateBlock
            title="暂无历史分析记录"
            description="完成首次分析后，这里会保留最近结果。"
            icon={(
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          />
        ) : groupedItems ? (
          /* 按股票合并分组展示 */
          <div className="space-y-1">
            {groupedItems.map(({ item, count }) => {
              const sentimentColor = item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
              const stockName = item.stockName || item.stockCode;
              return (
                <div key={item.stockCode} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteStock?.(item.stockCode, stockName);
                    }}
                    className="flex h-8 w-6 shrink-0 items-center justify-center rounded-l-lg text-danger/70 transition-all hover:bg-danger/15 hover:text-danger"
                    title={`删除 ${stockName} 的所有分析记录`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onStockClick?.(item.stockCode, stockName)}
                    className="home-history-item flex flex-1 items-center gap-2.5 p-2.5 text-left rounded-lg"
                  >
                  {sentimentColor && (
                    <div
                      className="h-8 w-1 shrink-0 rounded-full"
                      style={{
                        backgroundColor: sentimentColor,
                        boxShadow: `0 0 10px ${sentimentColor}40`,
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground tracking-tight truncate">
                      {stockName}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-secondary-text font-mono">
                        {item.stockCode}
                      </span>
                      {sentimentColor && (
                        <span
                          className="text-[11px]"
                          style={{ color: sentimentColor }}
                        >
                          {item.sentimentScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {count} 次
                  </div>
                </button>
                </div>
              );
            })}

            {!hasMore && groupedItems.length > 0 && (
              <div className="text-center py-4">
                <div className="h-px bg-subtle w-full mb-3" />
                <span className="text-[10px] text-secondary-text uppercase tracking-[0.2em]">已到底部</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <HistoryListItem
                key={item.id}
                item={item}
                isViewing={selectedId === item.id}
                isChecked={selectedIds.has(item.id)}
                isDeleting={isDeleting}
                onToggleChecked={onToggleItemSelection}
                onClick={onItemClick}
                onDeleteItem={onDeleteItem}
              />
            ))}

            <div ref={loadMoreTriggerRef} className="h-4" />
            
            {isLoadingMore && (
              <div className="flex justify-center py-4">
                <div className="home-spinner h-5 w-5 animate-spin border-2" />
              </div>
            )}

            {!hasMore && items.length > 0 && (
              <div className="text-center py-5">
                <div className="h-px bg-subtle w-full mb-3" />
                <span className="text-[10px] text-secondary-text uppercase tracking-[0.2em]">已到底部</span>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
