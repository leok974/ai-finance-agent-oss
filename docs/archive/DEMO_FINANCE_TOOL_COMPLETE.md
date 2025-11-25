# Demo Finance Tool Implementation

## Summary

Successfully implemented Part 2: Backend demo finance tool that enables the finance agent to describe demo data spending patterns by category.

## Implementation Complete

### Backend Components

**1. Helper Function** (`apps/backend/app/agent/finance_utils.py`):
```python
def get_demo_category_monthly_averages(
    db: Session,
    user_id: int,
    months: int = 6,
) -> List[DemoCategoryAverage]:
```
- Queries transactions grouped by category
- Calculates monthly averages over N months
- Excludes income and transfers (spend only)
- Returns sorted by spend (highest first)
- Creates human-readable labels from slugs (e.g., `housing.utilities` → "Housing › Utilities")

**2. API Endpoint** (`apps/backend/app/routers/agent_tools_charts.py`):
```python
POST /agent/tools/charts/demo-overview
```
**Request:**
```json
{
  "months": 6,
  "user_id": 123  // Optional; defaults to demo user
}
```

**Response:**
```json
{
  "categories": [
    {
      "category_slug": "groceries",
      "category_label": "Groceries",
      "monthly_avg": 285.50,
      "txn_count": 29
    },
    {
      "category_slug": "restaurants",
      "category_label": "Restaurants",
      "monthly_avg": 245.75,
      "txn_count": 32
    }
  ],
  "months_analyzed": 6,
  "total_categories": 20
}
```

**3. Finance Mode Integration** (`apps/backend/app/agent/modes_finance_llm.py`):
- Detects demo users by email (`settings.DEMO_USER_EMAIL`)
- Calls demo-overview endpoint for demo users
- Adds `demo_averages` to LLM context
- Provides top 5 category averages to LLM

**4. Prompt Updates** (`apps/backend/app/agent/prompts.py`):
- Updated `FINANCE_QUICK_RECAP_PROMPT` to handle `demo_averages`
- Instructs LLM to naturally mention category averages for demo users
- Example output: "In your demo data, groceries average $285/month"

**5. Comprehensive Tests** (`apps/backend/app/tests/test_agent_demo_finance.py`):
- ✅ All 8 tests passing
- Tests model validation
- Tests label formatting logic
- Tests helper function structure
- Tests prompt integration
- Tests LLM mode integration (demo vs regular users)

## How It Works

### For Demo Users

1. **User asks**: "What's my spending summary?"

2. **Agent detects demo user**:
   ```python
   user_email = user_context.get("email", "")
   if user_email == settings.DEMO_USER_EMAIL:
       # Call demo overview tool
   ```

3. **Demo tool returns averages**:
   ```json
   {
     "categories": [
       {"category": "Groceries", "monthly_avg": 285.50},
       {"category": "Restaurants", "monthly_avg": 150.00},
       {"category": "Shopping", "monthly_avg": 120.00}
     ]
   }
   ```

4. **LLM receives enriched context**:
   ```json
   {
     "month": "2025-11",
     "income": 2500,
     "spend": 1200,
     "demo_averages": [
       {"category": "Groceries", "monthly_avg": 285.50},
       {"category": "Restaurants", "monthly_avg": 150.00}
     ]
   }
   ```

5. **Agent responds naturally**:
   > Here's your summary for **November 2025**:
   >
   > - Income: $2,500
   > - Spend: $1,200
   > - Net: $1,300
   > - In your demo data, groceries average $285/month and restaurants $150/month
   >
   > **Next steps**: Try a deeper breakdown or check for subscriptions
   >
   > You can also check the Spending trends card I highlighted below.

### For Regular Users

- Demo tool is NOT called (email check fails)
- No `demo_averages` in LLM context
- Agent provides standard financial summary
- No mention of demo data

## Data Flow

```
User → Finance Mode → Demo Detection → Demo Tool → Database
                                  ↓
                           LLM Context ← Category Averages
                                  ↓
                            Natural Language Response
```

## Key Features

### Safety & Isolation
- Only called for demo users (email check)
- User-specific queries (WHERE user_id = ?)
- Excludes income/transfers (spend analysis only)
- Graceful fallback if demo tool fails

### Smart Calculations
- Monthly averages over configurable window (default 6 months)
- Transaction counts per category
- Sorted by total spend (highest first)
- Rounds to 2 decimal places

### Label Formatting
- Converts slugs to readable names
- Handles nested categories: `housing.utilities` → "Housing › Utilities"
- Title-cases labels
- Replaces underscores with spaces

## Testing

All tests passing:
```bash
$ pytest app/tests/test_agent_demo_finance.py -v
8 passed in 0.13s
```

### Test Coverage
1. ✅ DemoCategoryAverage Pydantic model validation
2. ✅ Category label formatting from slugs
3. ✅ Helper function returns correct structure
4. ✅ Helper function handles empty data
5. ✅ Prompt mentions demo_averages
6. ✅ Prompt instructs natural language
7. ✅ LLM mode calls demo tool for demo users
8. ✅ LLM mode skips demo tool for regular users

## Integration with Previous Work

### Part 1: Category Colors (commit d5fdf534)
- Charts now show categories with semantic colors
- Categories visually distinct
- Groceries = emerald, Restaurants = red, etc.

### Part 2: Demo Finance Tool (commit 099f435a - THIS COMMIT)
- Agent can describe demo category averages
- Natural language insights: "groceries average $285/month"
- Helps users understand their sample dataset

### Demo Data Upgrade (commit 091312a6)
- 227 transactions, 20 categories, 6 months
- Realistic spending patterns
- Varied merchants across categories

## Combined Impact

**Before**: Demo data was just numbers in charts
- User saw spending but didn't know what it represented
- No context for "is this normal?"
- Categories existed but weren't explained

**After**: Demo data is interactive and explained
- Charts use semantic colors (groceries = green)
- Agent says "groceries average $285/month in your demo"
- User understands: "This is sample data showing typical spending"
- Visual + conversational intelligence

## Example User Experience

### Demo User Chat Session

**User**: "Show me my finances"

**Agent**:
> Here's your summary for **November 2025**:
>
> - Income: $2,500
> - Spend: $1,245
> - Net: $1,255
>
> Top spending:
> - Groceries: $285 (in your demo data, groceries average $285/month)
> - Restaurants: $245 (demo average: $245/month)
> - Shopping: $120
>
> **Next steps**: Review subscriptions or check spending trends
>
> You can also check the Spending trends card I highlighted below.

**Visual**: Charts show groceries in emerald, restaurants in red (semantic colors from Part 1)

**Result**: User sees both visual distinction AND conversational context about their demo data

## Files Modified

### Created
- `apps/backend/app/tests/test_agent_demo_finance.py` - Comprehensive test suite

### Modified
- `apps/backend/app/agent/finance_utils.py` - Added helper function + model
- `apps/backend/app/agent/modes_finance_llm.py` - Integrated demo tool call
- `apps/backend/app/agent/prompts.py` - Updated prompt for demo awareness
- `apps/backend/app/routers/agent_tools_charts.py` - Added demo-overview endpoint

## Success Criteria

✅ Demo user can ask "What are my average spending patterns?"
✅ Agent responds with category-specific monthly averages
✅ Data comes from demo transactions (6 months of sample data)
✅ Works only for demo users (safety check)
✅ Tool registered and callable from finance mode
✅ Tests validate behavior (8/8 passing)
✅ Agent prompt mentions demo data capability

## Next Steps

### Potential Enhancements
1. **Frontend renderer**: Display demo insights as a table/card
2. **Category details**: Allow drilling down into specific categories
3. **Comparison mode**: Compare current month vs demo averages
4. **Admin toggle**: Enable/disable demo insights feature
5. **Custom time windows**: Let users ask for 3-month or 12-month averages

### Production Considerations
- Demo tool only runs for demo email (already implemented)
- Graceful fallback if tool fails (already implemented)
- No impact on regular users (verified in tests)
- Efficient query with proper indexes on user_id, date, category

## Commits

**Part 1** (d5fdf534): Frontend category colors
**Part 2** (099f435a): Backend demo finance tool ← THIS COMMIT

Both parts work together to make demo data visually distinct and conversationally explained.
