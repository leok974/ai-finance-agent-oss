from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import pandas as pd

from sqlalchemy.orm import Session

try:
    # Import lazily/optionally to avoid hard dependency at import time
    from statsmodels.tsa.statespace.sarimax import SARIMAX  # type: ignore
    _HAS_SM = True
except Exception:
    SARIMAX = None  # type: ignore
    _HAS_SM = False


def _fit_forecast(series: List[float], horizon: int, seasonal: bool) -> List[float]:
    """Fit a small SARIMAX and forecast.
    Falls back to naive last value replication if model cannot be fit.
    """
    if not _HAS_SM or len(series) < 6:
        last = series[-1] if series else 0.0
        return [last for _ in range(horizon)]

    # Keep model simple and robust
    order = (1, 1, 1)
    seasonal_order = (0, 1, 1, 12) if seasonal else (0, 0, 0, 0)
    try:
        model = SARIMAX(series, order=order, seasonal_order=seasonal_order, enforce_stationarity=False, enforce_invertibility=False)
        res = model.fit(disp=False)
        fc = res.forecast(steps=horizon)
        return [float(x) for x in fc]
    except Exception:
        last = series[-1] if series else 0.0
        return [last for _ in range(horizon)]


def sarimax_cashflow_forecast(db: Session, base_series_fn, month: Optional[str], horizon: int) -> Optional[Dict]:
    """Generate cashflow forecast using SARIMAX.

    Parameters
    - db: Session
    - base_series_fn: callable to compute (series, by_month) like analytics._monthly_sums
    - month: reference month
    - horizon: months to forecast

    Returns a dict matching analytics.forecast_cashflow shape and model='sarimax',
    or None when SARIMAX is unavailable or insufficient data.
    """
    if not _HAS_SM:
        return None

    # Use up to 36 months to capture yearly seasonality when present
    series, _ = base_series_fn(db, lookback=36, ref_month=month)
    months = sorted(series.keys())
    if len(months) < 12:
        # need at least a year for seasonal model to be meaningful
        return None

    infl = [series[m]["in"] for m in months]
    outf = [series[m]["out"] for m in months]

    # Fit two small SARIMAX models independently, with seasonal component
    f_in = _fit_forecast(infl, horizon=horizon, seasonal=True)
    f_out = _fit_forecast(outf, horizon=horizon, seasonal=True)
    f_net = [round(a - b, 2) for a, b in zip(f_in, f_out)]

    forecast = [
        {"t": i + 1, "inflows": float(f_in[i]), "outflows": float(f_out[i]), "net": float(f_net[i])}
        for i in range(horizon)
    ]
    return {"months": months, "series": series, "forecast": forecast, "model": "sarimax"}


def sarimax_forecast(
    month_series: Dict[str, float],
    horizon: int = 3,
    seasonal_periods: int = 12,
    alpha: float = 0.20,
) -> Optional[Tuple[List[float], List[float], List[float]]]:
    """
    Return (forecast, low, high) for the NET series.
    alpha=0.20 -> 80% CI; alpha=0.05 -> 95% CI.
    """
    if not _HAS_SM:
        return None
    min_needed = max(6, seasonal_periods // 2)
    if len(month_series) < min_needed:
        return None

    try:
        s = pd.Series(month_series).astype(float).sort_index()
        model = SARIMAX(
            s,
            order=(1, 1, 1),
            seasonal_order=(1, 1, 1, seasonal_periods),
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        fit = model.fit(disp=False)
        fc_res = fit.get_forecast(steps=horizon)
        fc = [float(x) for x in fc_res.predicted_mean.tolist()]
        ci = fc_res.conf_int(alpha=alpha)
        low = ci.iloc[:, 0].astype(float).tolist()
        high = ci.iloc[:, 1].astype(float).tolist()
        return fc, low, high
    except Exception:
        return None
