# Demo Data Upgrade - Chart Visual Impact

## Before vs After Comparison

### Spending Trends Card

**Before (CSV-based):**
```
┌─────────────────────────────────┐
│ Spending Trends                 │
├─────────────────────────────────┤
│                                 │
│   No historical data            │
│                                 │
└─────────────────────────────────┘
```

**After (6 months Python-based):**
```
┌─────────────────────────────────┐
│ Spending Trends (6 months)      │
├─────────────────────────────────┤
│    $2,500                       │
│         ╱╲      ╱╲              │
│    ────╱  ╲────╱  ╲─────        │
│                                 │
│    May Jun Jul Aug Sep Oct      │
│                                 │
│ ● Spending  ● Income  ● Net     │
└─────────────────────────────────┘
```

---

### Top Categories Card

**Before:**
```
┌─────────────────────────────────┐
│ Top Categories                  │
├─────────────────────────────────┤
│ Unknown        ████████████ 95% │
│ Other          █ 5%             │
└─────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────┐
│ Top Categories                  │
├─────────────────────────────────┤
│ Restaurants    ████████ 32      │
│ Groceries      ███████ 29       │
│ Shopping       ███████ 26       │
│ Entertainment  █████ 18         │
│ Transfers      ████ 16          │
│ Income         ███ 13           │
│ Subscriptions  ███ 12           │
│ Transport      ██ 11            │
│ Health         █ 7              │
│ Coffee         █ 7              │
│ Games          █ 7              │
│ Bills/Utilities █ 6             │
└─────────────────────────────────┘
```

---

### Top Merchants Card (Visual Hierarchy)

**Before:**
```
┌─────────────────────────────────┐
│ Top Merchants                   │
├─────────────────────────────────┤
│ MERCHANT ABC   ████████████ $500│
│ MERCHANT XYZ   ████████████ $450│
│ (all similar)                   │
└─────────────────────────────────┘
```

**After (Red/Yellow/Green Bars):**
```
┌─────────────────────────────────┐
│ Top Merchants                   │
├─────────────────────────────────┤
│ 🔴 Tax Refund     ████████ $1,100 │ (High - one-time)
│ 🔴 Costco         ███████ $1,485  │ (High - bulk)
│ 🟡 Target         ████ $1,140     │ (Medium)
│ 🟡 Uber Eats      ████ $600       │ (Medium)
│ 🟡 Amazon         ████ $780       │ (Medium)
│ 🟢 Starbucks      ██ $84          │ (Low)
│ 🟢 Metro Transit  █ $120          │ (Low)
│ 🟢 Spotify        █ $48           │ (Low)
└─────────────────────────────────┘
```

---

### Forecast Card

**Before:**
```
┌─────────────────────────────────┐
│ Forecast (Next Month)           │
├─────────────────────────────────┤
│                                 │
│ Insufficient data for forecast  │
│ (Need at least 3 months)        │
│                                 │
└─────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────┐
│ Forecast (Next Month)           │
├─────────────────────────────────┤
│ Predicted Spending: $1,827      │
│ Predicted Income:   $2,400      │
│ Net Flow:          +$573        │
│                                 │
│ Confidence: High (6mo history)  │
│                                 │
│ ╭─ Run Forecast ─╮              │
│ │ Based on historical patterns  │
│ │ from May-Oct 2025             │
│ ╰───────────────────╯           │
└─────────────────────────────────┘
```

---

### Overview (Summary Cards)

**Before:**
```
Total Spend:    $523
Total Income:   $0
Net:           -$523
Categories:     2 (Unknown, Other)
```

**After:**
```
Total Spend:    $10,962
Total Income:   $10,021
Net:           -$941
Categories:     20 (diverse mix)
Merchants:      33 (realistic brands)
Transactions:   227 over 6 months
```

---

## Amount Distribution Strategy

### High-Value Merchants (Red Bars) - $500-$2,000 total
- **Costco**: $60-180 per trip × ~11 trips = ~$1,485
- **Tax Refund**: $500-1,200 one-time = ~$1,100
- **Best Buy**: $50-300 per visit × 3-5 visits = ~$600
- **Urgent Care**: $120-220 one-time = ~$170

### Medium-Value Merchants (Yellow Bars) - $200-$600 total
- **Target**: $20-120 × ~10 visits = ~$1,140
- **Walmart**: $20-120 × ~9 visits = ~$1,080
- **Amazon**: $20-150 × ~5 orders = ~$780
- **Uber Eats**: $20-60 × ~10 orders = ~$600

### Low-Value Merchants (Green Bars) - $50-$200 total
- **Metro Transit**: $5-15 × ~8 rides = ~$120
- **Starbucks**: $6-18 × ~7 visits = ~$84
- **Spotify**: $8-12 × 6 months = ~$48
- **Netflix**: $12-20 × 6 months = ~$72

---

## Category Balance for Visual Interest

### High-Frequency Categories (30+ transactions)
1. **Restaurants**: 32 txns (Chipotle, Panera, Uber Eats, Five Guys)
2. **Groceries**: 29 txns (Whole Foods, Giant, Costco, Trader Joe's)

### Medium-Frequency Categories (15-30 transactions)
3. **Shopping**: 26 txns (Amazon, Target, Walmart, Best Buy)
4. **Entertainment**: 18 txns (AMC, Regal, Steam)
5. **Transfers**: 16 txns (to/from savings)

### Low-Frequency Categories (5-15 transactions)
- Income: 13 txns (salary, freelance, tax refund)
- Subscriptions: 12 txns (Spotify, Netflix, Adobe, Amazon Prime)
- Transportation: 11 txns (Uber, Lyft, Shell, Metro)
- Health: 7 txns (CVS, Walgreens, Urgent Care)

---

## Monthly Pattern Simulation

### Week 1 (Days 1-2)
- ✅ Paycheck arrives ($2,200-$2,600)
- 💸 Bills auto-pay: Utilities ($80-160), Internet ($60-120), Mobile ($45-95)

### Week 2 (Days 5-8)
- 💳 Subscriptions: Spotify ($8-12), Netflix ($12-20), Adobe ($25-35)
- 🍕 Daily spending: restaurants, groceries, shopping

### Week 3 (Days 12-16)
- ✅ Paycheck #2 arrives ($2,200-$2,600)
- 🚗 Transportation: gas, rideshares, transit
- 🛒 Grocery run

### Week 4 (Days 20-27)
- 🎮 Entertainment & games
- 💰 Occasional transfer to/from savings (25% chance)
- 📦 Online shopping deliveries

---

## Real-World Merchant Names

All merchant descriptions use realistic formats:
- **Banks/Payroll**: "ACME CORP PAYROLL", "PAYPAL *FREELANCE"
- **Groceries**: "WHOLEFDS FAIRFAX", "GIANT FOOD #3142", "COSTCO WHSE #229"
- **Fast Food**: "CHIPOTLE #2743", "STARBUCKS 04213", "PANERA BREAD #1234"
- **Utilities**: "DOMINION ENERGY VA", "COMCAST *INTERNET", "VERIZON WIRELESS"
- **Subscriptions**: "SPOTIFY USA", "NETFLIX.COM", "ADOBE *CREATIVE CLD"
- **Transport**: "SHELL OIL 12345678", "LYFT *TRIP", "UBER *TRIP"
- **Stores**: "AMAZON MKTPLACE PMTS", "TARGET T-1234", "WALMART SUPERCENTER"

These match real bank statement formats for authenticity.

---

## Expected User Flow After Upgrade

1. **User signs up** for demo account
2. **Backend calls** `/demo/bootstrap` automatically
3. **227 transactions inserted** with pre-assigned categories
4. **Dashboard loads** showing:
   - ✅ Spending Trends: 6-month chart with visible trend lines
   - ✅ Top Categories: 15+ bars (not 90% Unknown)
   - ✅ Top Merchants: Red/yellow/green visual hierarchy
   - ✅ Forecast: "High confidence" based on 6-month history
   - ✅ Overview: Realistic $11k spend, $10k income

5. **User explores**:
   - "Show spending trends" → Card Pills scroll to populated chart
   - "What are my top merchants?" → Agent shows Costco, Target, Uber Eats
   - "Run forecast" → AI predicts next month based on patterns
   - Categorization: Most transactions already categorized, minimal unknowns

---

## Technical Notes

- All amounts are deterministic (seeded Random(42))
- Date range: Last 6 months from today (rolling window)
- 8 active days per month × 6 months = 48 days
- Average 4.7 transactions per day = 227 total
- Category slugs validated against VALID_CATEGORIES
- Merchant canonical names for aggregation

## Verification

Run the verification script to see exact counts:
```bash
cd apps/backend
python verify_demo_seed.py
```

This shows the actual distribution of transactions, categories, and merchants generated with the current date.
