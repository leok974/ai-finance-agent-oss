#!/usr/bin/env python3
"""
Generate rich demo sample data for LedgerMind.

Creates 6 months of realistic transaction data (June - November 2025) with:
- Monthly salary and rent
- Recurring subscriptions
- Varied spending across categories
- Some unknown/uncategorized transactions
- Freelance income spikes
- Realistic merchant patterns
"""

import csv
from pathlib import Path


def generate_demo_data():
    """Generate 6 months of demo transactions."""
    transactions = []

    # Monthly recurring charges (same each month)
    monthly_recurring = [
        ("01", "ACME Corporation", "Monthly Salary", "4200.00", "income.salary"),
        ("02", "Landlord Payment Service", "{month} Rent", "-1450.00", "housing.rent"),
        (
            "07",
            "NETFLIX.COM",
            "Monthly streaming",
            "-15.99",
            "subscriptions.entertainment",
        ),
        (
            "07",
            "SPOTIFY PREMIUM",
            "Music subscription",
            "-10.99",
            "subscriptions.entertainment",
        ),
        (
            "08",
            "GITHUB INC COPILOT",
            "Developer tools",
            "-10.00",
            "subscriptions.software",
        ),
        ("12", "VERIZON WIRELESS", "Phone bill", "-95.00", "utilities.mobile"),
        (
            "13",
            "PGE SAN FRANCISCO",
            "Electric bill",
            "-{electric}.{cents}",
            "utilities.electricity",
        ),
        ("14", "COMCAST CABLE", "Internet service", "-89.99", "utilities.internet"),
    ]

    months = [
        ("2025-06", "June", "145", "30", 850, 0),
        ("2025-07", "July", "132", "45", 650, 650),
        ("2025-08", "August", "156", "78", 425, 0),
        ("2025-09", "September", "168", "90", 312, 850),
        ("2025-10", "October", "142", "35", 378, 1200),
        ("2025-11", "November", "178", "45", 512, 0),
    ]

    for month_str, month_name, electric, cents, unknown_amount, freelance in months:
        # Add recurring charges
        for day, merchant, desc, amount, category in monthly_recurring:
            final_desc = desc.replace("{month}", month_name)
            final_amount = amount.replace("{electric}", electric).replace(
                "{cents}", cents
            )
            transactions.append(
                [f"{month_str}-{day}", merchant, final_desc, final_amount, category]
            )

        # Add freelance income if applicable
        if freelance > 0:
            if month_str == "2025-07":
                transactions.append(
                    [
                        f"{month_str}-02",
                        "UPWORK ESCROW",
                        "Freelance project",
                        str(freelance),
                        "income.freelance",
                    ]
                )
            elif month_str == "2025-09":
                transactions.append(
                    [
                        f"{month_str}-03",
                        "UPWORK ESCROW",
                        "Freelance consulting",
                        str(freelance),
                        "income.freelance",
                    ]
                )
            else:
                transactions.append(
                    [
                        f'{month_str}-{31 if month_str in ["2025-07", "2025-08", "2025-10"] else 30}',
                        "UPWORK ESCROW",
                        "Freelance web dev",
                        str(freelance),
                        "income.freelance",
                    ]
                )

        # Add Adobe if August+
        if month_str >= "2025-08":
            transactions.append(
                [
                    f"{month_str}-09",
                    "ADOBE CREATIVE CLOUD",
                    "Design tools",
                    "-54.99",
                    "subscriptions.software",
                ]
            )

        # Groceries (varied amounts)
        groceries = [
            (
                "03",
                "WHOLE FOODS MARKET #1234",
                "Weekly groceries",
                ["-127.45", "-134.89", "-145.67", "-152.34", "-167.89", "-178.45"],
            ),
            (
                "16",
                "COSTCO WHOLESALE #234",
                "Bulk shopping",
                ["-178.92", "-201.45", "-234.56", "-267.89", "-289.45", "-312.89"],
            ),
            (
                "22",
                "TRADER JOES #456",
                "Groceries",
                ["-92.18", "-87.45", "-95.23", "-102.45", "-108.90", "-156.78"],
            ),
            (
                "29",
                "SAFEWAY STORE 1892",
                "Weekend groceries",
                ["-103.67", "-112.34", "-118.90", "-125.78", "-134.67", "-89.45"],
            ),
        ]

        month_idx = int(month_str.split("-")[1]) - 6  # 0-5 for June-Nov
        for day, merchant, desc, amounts in groceries:
            transactions.append(
                [f"{month_str}-{day}", merchant, desc, amounts[month_idx], "groceries"]
            )

        # Transportation
        transactions.append(
            [
                f"{month_str}-04",
                "SHELL OIL #5678",
                "Gas station",
                f"-{52.30 + month_idx * 3.2:.2f}",
                "transportation.fuel",
            ]
        )
        transactions.append(
            [
                f"{month_str}-15",
                "UBER TRIP",
                "Ride",
                f"-{32.50 - month_idx:.2f}",
                "transportation.rideshare",
            ]
        )
        if month_idx % 2 == 1:
            transactions.append(
                [
                    f"{month_str}-{20 + month_idx}",
                    "LYFT RIDE",
                    "Transportation",
                    f"-{18.75 + month_idx * 2:.2f}",
                    "transportation.rideshare",
                ]
            )

        # Restaurants & food
        transactions.append(
            [
                f"{month_str}-05",
                "STARBUCKS STORE 4521",
                "Morning coffee",
                f"-{6.75 + month_idx:.2f}",
                "restaurants.coffee",
            ]
        )
        transactions.append(
            [
                f"{month_str}-{5 if month_idx == 0 else 10}",
                "CHIPOTLE MEXICAN GRILL #890",
                "Lunch" if month_idx < 2 else "Dinner",
                f"-{14.25 + month_idx:.5f}",
                "restaurants",
            ]
        )

        delivery_merchants = [
            "DOORDASH*PANERA",
            "UBER EATS*LOCAL",
            "DOORDASH*SUSHI",
            "UBER EATS*THAI",
            "DOORDASH*ITALIAN",
            "UBER EATS*PIZZA",
        ]
        transactions.append(
            [
                f"{month_str}-{18 + month_idx}",
                delivery_merchants[month_idx],
                "Food delivery",
                f"-{28.45 + month_idx * 8:.2f}",
                "restaurants.delivery",
            ]
        )

        # Shopping (Online & Retail)
        amazon_items = [
            "Office supplies",
            "Books",
            "Kitchen items",
            "Home decor",
            "Winter clothes",
            "Thanksgiving prep",
        ]
        transactions.append(
            [
                f"{month_str}-{10 - month_idx % 2}",
                f"AMZN Mktp US*{month_idx+2}K{8-month_idx}PQ1RT",
                amazon_items[month_idx],
                f"-{45.99 + month_idx * 30:.2f}",
                "shopping.online",
            ]
        )

        target_items = [
            "Household supplies",
            "Home goods",
            "Clothing",
            "School supplies",
            "Halloween decor",
            "Holiday shopping",
        ]
        transactions.append(
            [
                f"{month_str}-{9 + month_idx}",
                "TARGET STORE #1245",
                target_items[month_idx],
                f"-{89.34 + month_idx * 26:.2f}",
                "shopping.retail",
            ]
        )

        # Healthcare
        cvs_items = [
            "Prescriptions",
            "Health items",
            "Medications",
            "First aid supplies",
            "Flu shot & vitamins",
            "Cold medicine",
        ]
        transactions.append(
            [
                f"{month_str}-{18 + month_idx % 3}",
                "CVS PHARMACY #7890",
                cvs_items[month_idx],
                f"-{25.00 + month_idx * 6.67:.2f}",
                "healthcare.pharmacy",
            ]
        )

        # Entertainment/Gaming
        game_items = [
            "Video game",
            "Game purchase",
            "Games bundle",
            "Video games",
            "Horror games",
            "Game deals",
        ]
        transactions.append(
            [
                f"{month_str}-{19 + month_idx * 1}",
                "STEAM "
                + [
                    "PURCHASE",
                    "GAMES",
                    "SUMMER SALE",
                    "FALL SALE",
                    "HALLOWEEN",
                    "BLACK FRIDAY",
                ][month_idx],
                game_items[month_idx],
                f"-{39.99 + month_idx * 6.67:.2f}",
                "entertainment.games",
            ]
        )

        # Big ticket items (some months)
        if month_idx == 2:  # August
            transactions.append(
                [
                    f"{month_str}-29",
                    "BEST BUY #4567",
                    "Electronics",
                    "-289.99",
                    "shopping.retail",
                ]
            )
        if month_idx == 3 or month_idx == 4:  # Sept & Oct
            transactions.append(
                [
                    f"{month_str}-29",
                    "HOME DEPOT #8901" if month_idx == 3 else "BEST BUY #4567",
                    "Hardware supplies" if month_idx == 3 else "Laptop accessories",
                    "-156.34" if month_idx == 3 else "-178.90",
                    "shopping.retail",
                ]
            )
        if month_idx == 5:  # November - Black Friday
            transactions.append(
                [
                    f"{month_str}-24",
                    "BEST BUY BLACK FRIDAY",
                    "TV upgrade",
                    "-899.99",
                    "shopping.retail",
                ]
            )

        # Insurance (Aug+)
        if month_str >= "2025-08":
            transactions.append(
                [
                    f'{month_str}-{30 if month_str in ["2025-08", "2025-09"] else 25}',
                    "INSURANCE CO",
                    "Health insurance premium",
                    "-425.00",
                    "insurance.health",
                ]
            )

        # UNKNOWN transactions (important for demo - creates alerts!)
        unknown_merchants = [
            "UNKNOWN MERCHANT XYZ",
            "UNKNOWN VENDOR ABC",
            "UNKNOWN CHARGE 123",
            "UNKNOWN MERCHANT DEF",
            "UNKNOWN PAYMENT XYZ",
            "UNKNOWN MERCHANT GHI",
        ]
        transactions.append(
            [
                f"{month_str}-{21 + month_idx}",
                unknown_merchants[month_idx],
                [
                    "Unknown charge",
                    "Unknown charge",
                    "Unknown transaction",
                    "Suspicious charge",
                    "Unknown debit",
                    "Unrecognized charge",
                ][month_idx],
                f"-{unknown_amount}.00",
                "unknown",
            ]
        )

        # Misc utilities/services
        if month_idx == 0:
            transactions.append(
                [
                    f"{month_str}-26",
                    "ATT BILL PAYMENT",
                    "Landline",
                    "-45.00",
                    "utilities.phone",
                ]
            )
            transactions.append(
                [
                    f"{month_str}-30",
                    "VENMO CASHOUT",
                    "Transfer to bank",
                    "200.00",
                    "transfers",
                ]
            )
        if month_idx == 1:
            transactions.append(
                [
                    f"{month_str}-31",
                    "REFUND - AMAZON",
                    "Product return",
                    "42.50",
                    "income.refund",
                ]
            )

    # Sort by date
    transactions.sort(key=lambda x: x[0])

    return transactions


def main():
    """Generate and save demo data."""
    transactions = generate_demo_data()

    # Write to CSV
    csv_path = (
        Path(__file__).parent.parent / "apps" / "web" / "public" / "demo-sample.csv"
    )
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "merchant", "description", "amount", "category"])
        writer.writerows(transactions)

    print(f"✅ Generated {len(transactions)} demo transactions")
    print(f"📁 Saved to: {csv_path}")

    # Show summary by month
    from collections import Counter

    months = Counter(t[0][:7] for t in transactions)
    print("\n📊 Transactions by month:")
    for month, count in sorted(months.items()):
        print(f"   {month}: {count} transactions")


if __name__ == "__main__":
    main()
