#!/usr/bin/env python3
"""
Generate a realistic 6-month demo CSV for LedgerMind.

Features:
- Income (paychecks + misc reimbursements)
- Transfers (in + out pairs)
- Core expenses across multiple categories
- Intentional anomalies in latest month (November 2025)
- Deterministic generation (fixed seed)

Output: apps/backend/sample_hints_pass3_real_data.csv
"""

import csv
import random
from datetime import date, timedelta
from pathlib import Path
from typing import List, Tuple

# Deterministic seed for reproducible data
random.seed(42)

# Output path
BACKEND_ROOT = Path(__file__).parent.parent
OUTPUT_CSV = BACKEND_ROOT / "sample_hints_pass3_real_data.csv"

# Date range: 6 months (June 1 to November 20, 2025)
START_DATE = date(2025, 6, 1)
END_DATE = date(2025, 11, 20)


def generate_transactions() -> List[Tuple[str, str, str, float, str]]:
    """
    Generate all transactions for 6 months.

    Returns list of tuples: (date, merchant, description, amount, category)
    """
    transactions = []

    # Iterate through each month
    current_date = START_DATE
    month_num = 0

    while current_date <= END_DATE:
        month_start = date(current_date.year, current_date.month, 1)

        # Calculate next month for boundary
        if current_date.month == 12:
            next_month = date(current_date.year + 1, 1, 1)
        else:
            next_month = date(current_date.year, current_date.month + 1, 1)

        is_november = current_date.month == 11  # Anomaly month        # --- INCOME ---

        # Two paychecks per month (1st and 15th)
        paycheck_dates = [month_start, month_start + timedelta(days=14)]

        for paycheck_date in paycheck_dates:
            if paycheck_date <= END_DATE:
                transactions.append(
                    (
                        paycheck_date.isoformat(),
                        "ACME CORP PAYROLL",
                        "Paycheck - Direct Deposit",
                        2200.00,
                        "income_salary",
                    )
                )

        # Misc income every 2 months (June, August, October)
        if month_num % 2 == 0:
            misc_date = month_start + timedelta(days=10)
            if misc_date <= END_DATE:
                transactions.append(
                    (
                        misc_date.isoformat(),
                        "ZELLE",
                        "Roommate reimbursement",
                        400.00,
                        "income_other",
                    )
                )

        # --- TRANSFERS (paired in + out) ---

        # Monthly savings transfer on 5th
        transfer_date = month_start + timedelta(days=4)
        if transfer_date <= END_DATE:
            transactions.append(
                (
                    transfer_date.isoformat(),
                    "SAVINGS TRANSFER OUT",
                    "Transfer to savings account",
                    -500.00,
                    "transfers",
                )
            )
            transactions.append(
                (
                    transfer_date.isoformat(),
                    "SAVINGS TRANSFER IN",
                    "Transfer from checking",
                    500.00,
                    "transfers",
                )
            )

        # --- CORE EXPENSES ---

        # Rent (1st of month)
        if month_start <= END_DATE:
            transactions.append(
                (
                    month_start.isoformat(),
                    "RENT PAYMENT",
                    "Monthly rent",
                    -2100.00,
                    "rent",
                )
            )

        # Groceries (4× per month with variation)
        grocery_base_amounts = [160.00, 120.00, 95.00, 180.00]
        grocery_merchants = [
            "WHOLE FOODS MARKET",
            "WHOLE FOODS MARKET",
            "TRADER JOES",
            "WHOLE FOODS MARKET",
        ]

        if is_november:
            # ANOMALY: Double grocery spend in November
            grocery_base_amounts = [amt * 1.8 for amt in grocery_base_amounts]

        for i, base_amt in enumerate(grocery_base_amounts):
            grocery_date = month_start + timedelta(days=5 + i * 7)
            if grocery_date <= END_DATE:
                # Add small random variance
                amount = base_amt + random.uniform(-10, 10)
                transactions.append(
                    (
                        grocery_date.isoformat(),
                        grocery_merchants[i],
                        "Grocery shopping",
                        -round(amount, 2),
                        "groceries",
                    )
                )

        # Restaurants (3× per month)
        restaurant_options = [
            ("CHIPOTLE", "Lunch", 25.00),
            ("SUSHI PLACE", "Dinner", 55.00),
            ("PIZZA PALACE", "Takeout", 35.00),
        ]

        if is_november:
            # ANOMALY: More dining out + higher amounts
            restaurant_options = [
                ("CHIPOTLE", "Lunch", 30.00),
                ("SUSHI PLACE", "Dinner", 75.00),
                ("PIZZA PALACE", "Takeout", 45.00),
                ("STEAKHOUSE", "Date night", 120.00),
            ]

        for i, (merchant, desc, base_amt) in enumerate(restaurant_options):
            rest_date = month_start + timedelta(days=8 + i * 8)
            if rest_date <= END_DATE:
                amount = base_amt + random.uniform(-5, 5)
                transactions.append(
                    (
                        rest_date.isoformat(),
                        merchant,
                        desc,
                        -round(amount, 2),
                        "restaurants",
                    )
                )

        # Subscriptions (consistent monthly)
        subs = [
            ("GITHUB, INC.", "GitHub Copilot", -19.00, "subscriptions_software"),
            ("SPOTIFY", "Music streaming", -10.00, "subscriptions_media"),
        ]

        if is_november:
            # ANOMALY: Add Netflix and HBO Max in November
            subs.extend(
                [
                    ("NETFLIX", "Streaming", -15.99, "subscriptions_media"),
                    ("HBOMAX", "Streaming", -15.99, "subscriptions_media"),
                ]
            )

        for merchant, desc, amount, category in subs:
            sub_date = month_start + timedelta(days=12)
            if sub_date <= END_DATE:
                transactions.append(
                    (sub_date.isoformat(), merchant, desc, amount, category)
                )

        # Fuel (2× per month)
        fuel_dates = [
            month_start + timedelta(days=10),
            month_start + timedelta(days=22),
        ]

        for fuel_date in fuel_dates:
            if fuel_date <= END_DATE:
                amount = 45.00 + random.uniform(0, 25)
                transactions.append(
                    (
                        fuel_date.isoformat(),
                        "SHELL GAS STATION",
                        "Gasoline",
                        -round(amount, 2),
                        "fuel",
                    )
                )

        # Random extras (1-2 per month)
        extras = [
            ("AMAZON.COM", "Online shopping", -75.00, "shopping_online"),
        ]

        if month_num % 2 == 0:  # Every other month
            extras.append(
                ("PLAYSTATION", "Game purchase", -59.99, "entertainment_games")
            )

        for merchant, desc, base_amt, category in extras:
            extra_date = month_start + timedelta(days=18)
            if extra_date <= END_DATE:
                amount = base_amt + random.uniform(-10, 10)
                transactions.append(
                    (extra_date.isoformat(), merchant, desc, round(amount, 2), category)
                )

        # --- NOVEMBER ANOMALIES ---

        if is_november:
            # Big one-off dentist bill
            dentist_date = date(2025, 11, 8)
            transactions.append(
                (
                    dentist_date.isoformat(),
                    "DENTAL CARE CENTER",
                    "Root canal + crown",
                    -850.00,
                    "health",
                )
            )

            # Extra large Amazon order (holiday shopping)
            shopping_date = date(2025, 11, 15)
            transactions.append(
                (
                    shopping_date.isoformat(),
                    "AMAZON.COM",
                    "Holiday gifts",
                    -320.00,
                    "shopping_online",
                )
            )

        # Move to next month
        current_date = next_month
        month_num += 1

    # Sort by date
    transactions.sort(key=lambda x: x[0])

    return transactions


def write_csv(transactions: List[Tuple[str, str, str, float, str]]) -> None:
    """Write transactions to CSV file."""

    print(f"Writing {len(transactions)} transactions to {OUTPUT_CSV}")

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_NONNUMERIC)

        # Header
        writer.writerow(["date", "merchant", "description", "amount", "category"])

        # Data rows
        for date_str, merchant, description, amount, category in transactions:
            writer.writerow([date_str, merchant, description, amount, category])

    print(f"✓ Generated demo CSV: {OUTPUT_CSV}")
    print(f"  Date range: {START_DATE} to {END_DATE}")
    print(f"  Total transactions: {len(transactions)}")

    # Summary stats
    income_count = sum(1 for t in transactions if t[3] > 0)
    expense_count = sum(1 for t in transactions if t[3] < 0)
    total_income = sum(t[3] for t in transactions if t[3] > 0)
    total_expenses = sum(abs(t[3]) for t in transactions if t[3] < 0)

    print("\nSummary:")
    print(f"  Income transactions: {income_count} (${total_income:,.2f})")
    print(f"  Expense transactions: {expense_count} (${total_expenses:,.2f})")
    print(f"  Net: ${total_income - total_expenses:,.2f}")


if __name__ == "__main__":
    transactions = generate_transactions()
    write_csv(transactions)

    print("\n✓ Done! Run the seed script to load this data:")
    print("  docker exec backend python -m app.scripts.reset_and_seed_demo")
