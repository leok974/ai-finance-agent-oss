from datetime import date
from app.routers.agent_tools_transactions import parse_time_window_from_query


def test_last_90_days_default():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("transactions > $50 last 90 days", today)
    assert end == today
    assert (end - start).days == 90


def test_this_month():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("Starbucks this month", today)
    assert start == date(2025, 11, 1)
    assert end == today


def test_last_month():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("rent last month", today)
    assert start == date(2025, 10, 1)
    assert end == date(2025, 10, 31)


def test_august_2025():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("Delta in Aug 2025", today)
    assert start == date(2025, 8, 1)
    assert end == date(2025, 8, 31)


def test_september_2024():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("rent in September 2024", today)
    assert start == date(2024, 9, 1)
    assert end == date(2024, 9, 30)


def test_fallback_to_90_days():
    today = date(2025, 11, 21)
    start, end = parse_time_window_from_query("some random query", today)
    assert end == today
    assert (end - start).days == 90
