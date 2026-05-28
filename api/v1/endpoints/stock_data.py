# -*- coding: utf-8 -*-
"""
a-stock-data 数据接口
从 https://github.com/simonlin1212/a-stock-data 提取的核心数据源
七层数据架构：行情、研报、信号、资金面、新闻、基础数据、公告
"""

from __future__ import annotations

import json
import logging
import math
import re
import time
import urllib.request
import uuid
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException, Query

from api.v1.schemas.stock_data import (
    CLSNewsItem,
    CLSNewsResponse,
    EastMoneyDatacenterResponse,
    HotStockItem,
    HotStockResponse,
    IndustryRankingItem,
    IndustryRankingResponse,
    MarginTradingItem,
    ResearchReportItem,
    ResearchReportResponse,
    StockAnnouncementItem,
    StockAnnouncementResponse,
    StockBasicInfo,
    StockFundFlow120Item,
    StockFundFlow120Response,
    TencentQuoteItem,
    TencentQuoteResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def get_prefix(code: str) -> str:
    """6位代码 -> 市场前缀"""
    if code.startswith(("6", "9")):
        return "sh"
    elif code.startswith("8"):
        return "bj"
    else:
        return "sz"


DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"


def eastmoney_datacenter(
    report_name: str,
    columns: str = "ALL",
    filter_str: str = "",
    page_size: int = 50,
    sort_columns: str = "",
    sort_types: str = "-1",
) -> list[dict]:
    """东财数据中心统一查询"""
    params = {
        "reportName": report_name,
        "columns": columns,
        "filter": filter_str,
        "pageNumber": "1",
        "pageSize": str(page_size),
        "sortColumns": sort_columns,
        "sortTypes": sort_types,
        "source": "WEB",
        "client": "WEB",
    }
    r = requests.get(
        DATACENTER_URL, params=params, headers={"User-Agent": UA}, timeout=15
    )
    d = r.json()
    if d.get("result") and d["result"].get("data"):
        return d["result"]["data"]
    return []


def normalize_code(code: str) -> str:
    """归一化股票代码为纯6位数字"""
    code = code.strip().upper()
    code = re.sub(r"^(SH|SZ|BJ)", "", code)
    code = re.sub(r"\.(SH|SZ|BJ)$", "", code)
    return code


# ============================================================
# 1. 行情层 — 腾讯财经实时行情
# ============================================================

@router.get(
    "/tencent-quote",
    response_model=TencentQuoteResponse,
    summary="腾讯财经实时行情",
    description="批量拉取腾讯财经实时行情，含PE/PB/市值/换手率/涨跌停价等",
)
def tencent_quote(
    codes: str = Query(..., description="股票代码，逗号分隔，如 600519,300476,002463"),
) -> TencentQuoteResponse:
    """腾讯财经 API — PE/PB/市值/换手率/涨跌停/指数/ETF"""
    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    prefixed = []
    for c in code_list:
        p = get_prefix(c)
        prefixed.append(f"{p}{c}")

    url = "https://qt.gtimg.cn/q=" + ",".join(prefixed)
    req = urllib.request.Request(url)
    req.add_header("User-Agent", UA)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = resp.read().decode("gbk")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"腾讯财经API请求失败: {e}")

    items = []
    for line in data.strip().split(";"):
        if not line.strip() or "=" not in line or '"' not in line:
            continue
        key = line.split("=")[0].split("_")[-1]
        vals = line.split('"')[1].split("~")
        if len(vals) < 53:
            continue
        code = key[2:]
        try:
            item = TencentQuoteItem(
                code=code,
                name=vals[1],
                price=float(vals[3]) if vals[3] else 0,
                last_close=float(vals[4]) if vals[4] else 0,
                open=float(vals[5]) if vals[5] else 0,
                change_amt=float(vals[31]) if vals[31] else 0,
                change_pct=float(vals[32]) if vals[32] else 0,
                high=float(vals[33]) if vals[33] else 0,
                low=float(vals[34]) if vals[34] else 0,
                amount_wan=float(vals[37]) if vals[37] else 0,
                turnover_pct=float(vals[38]) if vals[38] else 0,
                pe_ttm=float(vals[39]) if vals[39] else 0,
                amplitude_pct=float(vals[43]) if vals[43] else 0,
                mcap_yi=float(vals[44]) if vals[44] else 0,
                float_mcap_yi=float(vals[45]) if vals[45] else 0,
                pb=float(vals[46]) if vals[46] else 0,
                limit_up=float(vals[47]) if vals[47] else 0,
                limit_down=float(vals[48]) if vals[48] else 0,
                vol_ratio=float(vals[49]) if vals[49] else 0,
                pe_static=float(vals[52]) if vals[52] else 0,
            )
            items.append(item)
        except (ValueError, IndexError) as e:
            logger.warning(f"解析腾讯行情失败 {code}: {e}")

    return TencentQuoteResponse(items=items, total=len(items))


# ============================================================
# 2. 资金面 — 个股资金流120日
# ============================================================

@router.get(
    "/fund-flow-120d/{code}",
    response_model=StockFundFlow120Response,
    summary="个股资金流120日",
    description="东财push2his，个股主力/大单/中单/小单日级净流入",
)
def stock_fund_flow_120d(code: str) -> StockFundFlow120Response:
    """东财push2his个股资金流120日"""
    code = normalize_code(code)
    market = 1 if code.startswith("6") else 0
    secid = f"{market}.{code}"
    url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    params = {
        "secid": secid,
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
        "lmt": "120",
        "klt": "101",
    }
    headers = {"User-Agent": UA, "Referer": "https://data.eastmoney.com/"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        d = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"资金流API请求失败: {e}")

    klines = d.get("data", {}).get("klines", [])
    items = []
    for line in klines:
        parts = line.split(",")
        if len(parts) >= 7:
            items.append(StockFundFlow120Item(
                date=parts[0],
                main_net=float(parts[1]) if parts[1] != "-" else 0,
                small_net=float(parts[5]) if parts[5] != "-" else 0,
                mid_net=float(parts[4]) if parts[4] != "-" else 0,
                large_net=float(parts[3]) if parts[3] != "-" else 0,
                super_net=float(parts[2]) if parts[2] != "-" else 0,
            ))

    total_main_20d = sum(d.main_net for d in items[-20:]) / 1e8 if items else 0
    return StockFundFlow120Response(
        code=code, items=items, total_main_20d=round(total_main_20d, 2)
    )


# ============================================================
# 3. 信号层 — 东财数据中心通用查询
# ============================================================

@router.get(
    "/datacenter/{report_name}",
    response_model=EastMoneyDatacenterResponse,
    summary="东财数据中心通用查询",
    description="龙虎榜/解禁/融资融券/大宗交易/股东户数/分红",
)
def datacenter_query(
    report_name: str,
    filter_str: str = Query("", description="过滤条件"),
    page_size: int = Query(50, ge=1, le=200, description="每页条数"),
    sort_columns: str = Query("", description="排序列"),
    sort_types: str = Query("-1", description="排序方向"),
) -> EastMoneyDatacenterResponse:
    """东财数据中心通用查询"""
    items = eastmoney_datacenter(
        report_name=report_name,
        filter_str=filter_str,
        page_size=page_size,
        sort_columns=sort_columns,
        sort_types=sort_types,
    )
    return EastMoneyDatacenterResponse(
        report_name=report_name, items=items, total=len(items)
    )


# ============================================================
# 4. 信号层 — 同花顺当日强势股
# ============================================================

@router.get(
    "/hot-stocks",
    response_model=HotStockResponse,
    summary="同花顺当日强势股",
    description="当日强势股 + 题材归因，零鉴权",
)
def hot_stocks() -> HotStockResponse:
    """同花顺热点 — 当日强势股 + 题材归因"""
    url = "https://data.10jqka.com.cn/funds/hgtz/field/hspot/order/desc/page/1/ajax/1/free/1/"
    headers = {"User-Agent": UA}
    try:
        r = requests.get(url, headers=headers, timeout=15)
        data = r.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"同花顺热点请求失败: {e}")

    items = []
    pattern = r'<tr[^>]*id="tr_\d+"[^>]*>.*?</tr>'
    rows = re.findall(pattern, data, re.DOTALL)
    for row in rows:
        try:
            code_match = re.search(r'/stock/(\w+)/', row)
            name_match = re.search(r'class="m-font">([^<]+)</a>', row)
            price_match = re.search(r'<td\s+class="[^"]*tc[^"]*"[^>]*>([\d.]+)</td>', row)
            change_match = re.search(
                r'<td\s+class="[^"]*chang[^"]*"[^>]*>\s*<span[^>]*>([-\d.]+)%</span>', row
            )
            reason_match = re.search(r'class="reason">([^<]*)</span>', row)

            code = code_match.group(1) if code_match else ""
            name = name_match.group(1) if name_match else ""
            price = float(price_match.group(1)) if price_match else 0.0
            change_pct = float(change_match.group(1)) if change_match else 0.0
            hot_reason = reason_match.group(1).strip() if reason_match else ""

            if code:
                items.append(HotStockItem(
                    code=code,
                    name=name,
                    price=price,
                    change_pct=change_pct,
                    hot_reason=hot_reason,
                    reason_tags=[hot_reason] if hot_reason else [],
                ))
        except (ValueError, AttributeError):
            continue

    return HotStockResponse(items=items, total=len(items))


# ============================================================
# 5. 研报层 — 东财研报
# ============================================================

@router.get(
    "/reports/{code}",
    response_model=ResearchReportResponse,
    summary="东财研报列表",
    description="拉取指定股票的研报列表 + PDF下载链接",
)
def eastmoney_reports(
    code: str,
    max_pages: int = Query(3, ge=1, le=10, description="最大页数"),
) -> ResearchReportResponse:
    """东财研报API"""
    code = normalize_code(code)
    REPORT_API = "https://reportapi.eastmoney.com/report/list"
    items = []

    session = requests.Session()
    session.headers.update({
        "User-Agent": UA,
        "Referer": "https://data.eastmoney.com/",
    })

    for page in range(1, max_pages + 1):
        params = {
            "industryCode": "*", "pageSize": "100", "industry": "*",
            "rating": "*", "ratingChange": "*",
            "beginTime": "2000-01-01", "endTime": "2030-01-01",
            "pageNo": str(page), "fields": "", "qType": "0",
            "orgCode": "", "code": code, "rcode": "",
            "p": str(page), "pageNum": str(page), "pageNumber": str(page),
        }
        try:
            r = session.get(REPORT_API, params=params, timeout=30)
            d = r.json()
            rows = d.get("data") or []
            if not rows:
                break
            for row in rows:
                info_code = row.get("infoCode", "")
                pdf_url = f"https://pdf.dfcfw.com/pdf/H3_{info_code}_1.pdf" if info_code else ""
                items.append(ResearchReportItem(
                    title=row.get("title", ""),
                    org_name=row.get("orgName", ""),
                    analyst=row.get("analyst", ""),
                    rating=row.get("rating", ""),
                    rating_change=row.get("ratingChange", ""),
                    report_date=row.get("publishDate", ""),
                    predict_eps_cur=row.get("predictThisYearEps"),
                    predict_eps_next=row.get("predictNextYearEps"),
                    pdf_url=pdf_url,
                ))
            if page >= (d.get("TotalPage", 1) or 1):
                break
            time.sleep(0.3)
        except Exception as e:
            logger.warning(f"研报API第{page}页失败: {e}")
            break

    return ResearchReportResponse(code=code, items=items, total=len(items))
# ============================================================
# 6. 融资融券明细
# ============================================================

@router.get(
    "/margin-trading/{code}",
    response_model=list[MarginTradingItem],
    summary="融资融券明细",
    description="日级融资余额/买入/偿还 + 融券",
)
def margin_trading(
    code: str,
    page_size: int = Query(10, ge=1, le=120, description="获取天数"),
):
    """融资融券明细"""
    code = normalize_code(code)
    report_name = "RPTA_WEB_MARGINTRADING_DETAIL"
    columns = "SECURITY_CODE,SECURITY_NAME_ABBR,TRADE_DATE,RZMQE,RZMYE,RZCHE,RQYE,RQMCL"
    filter_str = f'(SECURITY_CODE="{code}")'
    data = eastmoney_datacenter(
        report_name=report_name,
        columns=columns,
        filter_str=filter_str,
        page_size=page_size,
        sort_columns="TRADE_DATE",
    )
    items = []
    for d in data:
        items.append(MarginTradingItem(
            date=str(d.get("TRADE_DATE", "")),
            rzye=float(d.get("RZMQE", 0)),
            rzmre=float(d.get("RZMYE", 0)),
            rzche=float(d.get("RZCHE", 0)),
            rqye=float(d.get("RQYE", 0)),
            rqmcl=float(d.get("RQMCL", 0)),
        ))
    return items


# ============================================================
# 7. 行业板块排名
# ============================================================

@router.get(
    "/industry-ranking",
    response_model=IndustryRankingResponse,
    summary="东财行业板块排名",
    description="东财行业板块涨跌/上涨下跌家数/领涨股",
)
def industry_ranking() -> IndustryRankingResponse:
    """东财行业板块排名"""
    url = "https://push2.eastmoney.com/api/qt/clist/get"
    params = {
        "fid": "f3",
        "po": "1",
        "pz": "100",
        "pn": "1",
        "np": "1",
        "fltt": "2",
        "invt": "2",
        "fs": "m:90+t:2",
        "fields": "f12,f14,f3,f104,f105,f128,f140",
    }
    headers = {"User-Agent": UA}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        d = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"行业板块请求失败: {e}")

    items = []
    for row in d.get("data", {}).get("diff", []):
        items.append(IndustryRankingItem(
            code=str(row.get("f12", "")),
            name=str(row.get("f14", "")),
            change_pct=float(row.get("f3", 0)),
            rise_count=int(row.get("f104", 0)),
            fall_count=int(row.get("f105", 0)),
            leader_code=str(row.get("f140", "")),
            leader_name=str(row.get("f128", "")),
        ))

    return IndustryRankingResponse(items=items, total=len(items))


# ============================================================
# 8. 财联社快讯
# ============================================================

@router.get(
    "/cls-news",
    response_model=CLSNewsResponse,
    summary="财联社快讯",
    description="全市场实时电报，直连cls.cn",
)
def cls_telegraph(
    page_size: int = Query(50, ge=1, le=200, description="获取条数"),
) -> CLSNewsResponse:
    """财联社电报"""
    url = "https://www.cls.cn/nodeapi/telegraphList"
    params = {"rn": str(page_size), "page": "1"}
    headers = {"User-Agent": UA, "Referer": "https://www.cls.cn/"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        d = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"财联社请求失败: {e}")

    items = []
    for item in d.get("data", {}).get("roll_data", []):
        items.append(CLSNewsItem(
            title=item.get("title", "") or item.get("brief", ""),
            content=item.get("content", "") or item.get("brief", ""),
            time=item.get("ctime", ""),
        ))

    return CLSNewsResponse(items=items, total=len(items))


# ============================================================
# 9. 东财全球资讯
# ============================================================

@router.get(
    "/global-news",
    response_model=CLSNewsResponse,
    summary="东财全球资讯",
    description="东方财富全球财经资讯（7x24滚动）",
)
def eastmoney_global_news(
    page_size: int = Query(50, ge=1, le=200, description="获取条数"),
) -> CLSNewsResponse:
    """东财全球资讯"""
    url = "https://np-weblist.eastmoney.com/comm/web/getFastNewsList"
    params = {
        "client": "web", "biz": "web_724",
        "fastColumn": "102", "sortEnd": "",
        "pageSize": str(page_size),
        "req_trace": str(uuid.uuid4()),
    }
    headers = {"User-Agent": UA, "Referer": "https://kuaixun.eastmoney.com/"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        d = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"全球资讯请求失败: {e}")

    items = []
    for item in d.get("data", {}).get("fastNewsList", []):
        items.append(CLSNewsItem(
            title=item.get("title", ""),
            content=item.get("summary", "")[:200],
            time=item.get("showTime", ""),
        ))

    return CLSNewsResponse(items=items, total=len(items))


# ============================================================
# 10. 个股基本面
# ============================================================

@router.get(
    "/stock-info/{code}",
    response_model=StockBasicInfo,
    summary="个股基本面信息",
    description="东财push2，获取行业/总股本/流通股/市值/上市日期",
)
def eastmoney_stock_info(code: str) -> StockBasicInfo:
    """东财个股基本面"""
    code = normalize_code(code)
    market = 1 if code.startswith("6") else 0
    url = "https://push2.eastmoney.com/api/qt/stock/get"
    params = {
        "fltt": "2", "invt": "2",
        "fields": "f57,f58,f84,f85,f127,f116,f117,f189,f43",
        "secid": f"{market}.{code}",
    }
    headers = {"User-Agent": UA}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=10)
        d = r.json().get("data", {})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"个股信息请求失败: {e}")

    if not d:
        raise HTTPException(status_code=404, detail=f"未找到股票 {code}")

    return StockBasicInfo(
        code=str(d.get("f57", code)),
        name=str(d.get("f58", "")),
        industry=str(d.get("f127", "")),
        total_shares=float(d.get("f84", 0)),
        float_shares=float(d.get("f85", 0)),
        mcap=float(d.get("f116", 0)),
        float_mcap=float(d.get("f117", 0)),
        list_date=str(d.get("f189", "")),
        price=float(d.get("f43", 0)),
    )


# ============================================================
# 11. 巨潮公告
# ============================================================

@router.get(
    "/announcements/{code}",
    response_model=StockAnnouncementResponse,
    summary="巨潮公告",
    description="巨潮公告全文检索，直连cninfo.com.cn",
)
def cninfo_announcements(
    code: str,
    page_size: int = Query(30, ge=1, le=100, description="获取条数"),
) -> StockAnnouncementResponse:
    """巨潮公告"""
    code = normalize_code(code)
    if code.startswith("6"):
        org_id = f"gssh0{code}"
    elif code.startswith("8") or code.startswith("4"):
        org_id = f"gsbj0{code}"
    else:
        org_id = f"gssz0{code}"

    url = "https://www.cninfo.com.cn/new/hisAnnouncement/query"
    payload = {
        "stock": f"{code},{org_id}",
        "tabName": "fulltext",
        "pageSize": str(page_size),
        "pageNum": "1",
        "column": "",
        "category": "",
        "plate": "",
        "seDate": "",
        "searchkey": "",
        "secid": "",
        "sortName": "",
        "sortType": "",
        "isHLtitle": "true",
    }
    headers = {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://www.cninfo.com.cn/new/disclosure",
        "Origin": "https://www.cninfo.com.cn",
    }
    try:
        r = requests.post(url, data=payload, headers=headers, timeout=15)
        d = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"巨潮公告请求失败: {e}")

    items = []
    for item in d.get("announcements", []) or []:
        items.append(StockAnnouncementItem(
            title=item.get("announcementTitle", ""),
            type=item.get("announcementTypeName", ""),
            date=item.get("announcementTime", ""),
            url=f"https://www.cninfo.com.cn/new/disclosure/detail?annoId={item.get('announcementId', '')}",
        ))

    return StockAnnouncementResponse(code=code, items=items, total=len(items))


# ============================================================
# 12. 东财个股新闻
# ============================================================

@router.get(
    "/stock-news/{code}",
    summary="东财个股新闻",
    description="东方财富个股相关新闻",
)
def eastmoney_stock_news(
    code: str,
    page_size: int = Query(20, ge=1, le=50, description="获取条数"),
):
    """东财个股新闻"""
    code = normalize_code(code)
    url = "https://search-api-web.eastmoney.com/search/jsonp"
    inner_params = json.dumps({
        "uid": "",
        "keyword": code,
        "type": ["cmsArticleWebOld"],
        "client": "web",
        "clientType": "web",
        "clientVersion": "curr",
        "param": {
            "cmsArticleWebOld": {
                "searchScope": "default", "sort": "default",
                "pageIndex": 1, "pageSize": page_size,
                "preTag": "", "postTag": "",
            }
        },
    }, separators=(",", ":"))
    params = {"cb": "jQuery_news", "param": inner_params}
    headers = {"User-Agent": UA, "Referer": "https://so.eastmoney.com/"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        text = r.text
        json_str = text[text.index("(") + 1 : text.rindex(")")]
        d = json.loads(json_str)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"个股新闻请求失败: {e}")

    items = []
    for a in d.get("result", {}).get("cmsArticleWebOld", {}).get("list", []):
        items.append({
            "title": re.sub(r"<[^>]+>", "", a.get("title", "")),
            "content": re.sub(r"<[^>]+>", "", a.get("content", ""))[:200],
            "time": a.get("date", ""),
            "source": a.get("mediaName", ""),
            "url": a.get("url", ""),
        })

    return {"items": items, "total": len(items)}
