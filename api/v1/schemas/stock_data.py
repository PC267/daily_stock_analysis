# -*- coding: utf-8 -*-
"""a-stock-data 数据接口 - Pydantic Schemas"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class TencentQuoteItem(BaseModel):
    """腾讯财经实时行情"""
    code: str = Field(..., description="股票代码")
    name: str = Field("", description="股票名称")
    price: float = Field(0.0, description="当前价")
    last_close: float = Field(0.0, description="昨收")
    open: float = Field(0.0, description="今开")
    high: float = Field(0.0, description="最高")
    low: float = Field(0.0, description="最低")
    change_amt: float = Field(0.0, description="涨跌额")
    change_pct: float = Field(0.0, description="涨跌幅%")
    amount_wan: float = Field(0.0, description="成交额(万)")
    turnover_pct: float = Field(0.0, description="换手率%")
    pe_ttm: float = Field(0.0, description="PE(TTM)")
    pb: float = Field(0.0, description="PB(市净率)")
    mcap_yi: float = Field(0.0, description="总市值(亿)")
    float_mcap_yi: float = Field(0.0, description="流通市值(亿)")
    limit_up: float = Field(0.0, description="涨停价")
    limit_down: float = Field(0.0, description="跌停价")
    amplitude_pct: float = Field(0.0, description="振幅%")
    vol_ratio: float = Field(0.0, description="量比")
    pe_static: float = Field(0.0, description="PE(静)")


class TencentQuoteResponse(BaseModel):
    """腾讯财经批量行情响应"""
    items: list[TencentQuoteItem] = Field(default_factory=list)
    total: int = 0


class StockFundFlow120Item(BaseModel):
    """个股资金流120日"""
    date: str = Field(..., description="日期")
    main_net: float = Field(0.0, description="主力净流入")
    small_net: float = Field(0.0, description="小单净流入")
    mid_net: float = Field(0.0, description="中单净流入")
    large_net: float = Field(0.0, description="大单净流入")
    super_net: float = Field(0.0, description="超大单净流入")


class StockFundFlow120Response(BaseModel):
    """资金流120日响应"""
    code: str = Field(..., description="股票代码")
    items: list[StockFundFlow120Item] = Field(default_factory=list)
    total_main_20d: float = Field(0.0, description="近20日主力累计净流入(亿)")


class EastMoneyDatacenterItem(BaseModel):
    """东财数据中心通用条目"""
    data: dict[str, Any] = Field(default_factory=dict)


class EastMoneyDatacenterResponse(BaseModel):
    """东财数据中心通用查询响应"""
    report_name: str
    items: list[dict[str, Any]] = Field(default_factory=list)
    total: int = 0


class HotStockItem(BaseModel):
    """同花顺当日强势股"""
    code: str = Field(..., description="股票代码")
    name: str = Field("", description="股票名称")
    price: float = Field(0.0, description="现价")
    change_pct: float = Field(0.0, description="涨跌幅%")
    hot_reason: str = Field("", description="题材原因")
    reason_tags: list[str] = Field(default_factory=list, description="题材标签")


class HotStockResponse(BaseModel):
    """当日强势股响应"""
    items: list[HotStockItem] = Field(default_factory=list)
    total: int = 0
    update_time: str = ""


class MarginTradingItem(BaseModel):
    """融资融券明细"""
    date: str = Field("", description="日期")
    rzye: float = Field(0.0, description="融资余额(元)")
    rzmre: float = Field(0.0, description="融资买入额(元)")
    rzche: float = Field(0.0, description="融资偿还额(元)")
    rqye: float = Field(0.0, description="融券余额(元)")
    rqmcl: float = Field(0.0, description="融券卖出量")


class ResearchReportItem(BaseModel):
    """研报条目"""
    title: str = Field("", description="标题")
    org_name: str = Field("", description="机构名称")
    analyst: str = Field("", description="分析师")
    rating: str = Field("", description="评级")
    rating_change: str = Field("", description="评级变动")
    report_date: str = Field("", description="报告日期")
    predict_eps_cur: Optional[float] = Field(None, description="当年预测EPS")
    predict_eps_next: Optional[float] = Field(None, description="下年预测EPS")
    pdf_url: str = Field("", description="PDF下载链接")


class ResearchReportResponse(BaseModel):
    """研报列表响应"""
    code: str = Field(..., description="股票代码")
    items: list[ResearchReportItem] = Field(default_factory=list)
    total: int = 0


class CLSNewsItem(BaseModel):
    """财联社快讯"""
    title: str = Field("", description="标题")
    content: str = Field("", description="内容")
    time: str = Field("", description="时间")


class CLSNewsResponse(BaseModel):
    """财联社快讯响应"""
    items: list[CLSNewsItem] = Field(default_factory=list)
    total: int = 0


class StockBasicInfo(BaseModel):
    """个股基本面"""
    code: str = Field("", description="股票代码")
    name: str = Field("", description="股票名称")
    industry: str = Field("", description="行业")
    total_shares: float = Field(0.0, description="总股本(股)")
    float_shares: float = Field(0.0, description="流通股(股)")
    mcap: float = Field(0.0, description="总市值(元)")
    float_mcap: float = Field(0.0, description="流通市值(元)")
    list_date: str = Field("", description="上市日期")
    price: float = Field(0.0, description="当前价")


class StockAnnouncementItem(BaseModel):
    """巨潮公告"""
    title: str = Field("", description="标题")
    type: str = Field("", description="类型")
    date: str = Field("", description="日期")
    url: str = Field("", description="链接")


class StockAnnouncementResponse(BaseModel):
    """公告响应"""
    code: str = Field(..., description="股票代码")
    items: list[StockAnnouncementItem] = Field(default_factory=list)
    total: int = 0


class IndustryRankingItem(BaseModel):
    """行业板块排名"""
    code: str = Field(..., description="板块代码")
    name: str = Field(..., description="板块名称")
    change_pct: float = Field(0.0, description="涨跌幅%")
    rise_count: int = Field(0, description="上涨家数")
    fall_count: int = Field(0, description="下跌家数")
    leader_code: str = Field("", description="领涨股代码")
    leader_name: str = Field("", description="领涨股名称")


class IndustryRankingResponse(BaseModel):
    """行业板块排名响应"""
    items: list[IndustryRankingItem] = Field(default_factory=list)
    total: int = 0
