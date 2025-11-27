# TODO: Demo Finance Tool (Part 2)

## Status
**Part 1 (Frontend Category Colors): ✅ COMPLETE** (commit d5fdf534)

**Part 2 (Backend Demo Finance Tool): 📋 PENDING**

## Objective

Enable the finance agent to describe demo data insights like:
- "In your demo data, groceries average $X/month"
- "Your demo shows you spend about $Y on restaurants each month"
- "Based on your sample data, subscriptions total $Z monthly"

## Implementation Plan

### 1. Create Helper Function

**File**: `apps/backend/app/agent/data_finance.py` (or create new file)

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from apps.backend.app.models import Transaction
from typing import Optional
from pydantic import BaseModel

class DemoCategoryAverage(BaseModel):
    category_slug: str
    category_label: str
    monthly_avg: float
    txn_count: int

async def get_demo_category_monthly_averages(
    session: AsyncSession,
    user_id: int,
    months: int = 6
) -> list[DemoCategoryAverage]:
    """
    Query demo transactions for the given user and return category averages.

    Args:
        session: Database session
        user_id: User ID (demo user)
        months: Number of months to average over (default 6)

    Returns:
        List of category averages sorted by monthly spend (descending)
    """
    # Query transactions grouped by category
    # Filter by user_id and date range (last N months)
    # Calculate total spend and count per category
    # Divide by months to get monthly average
    # Return sorted by monthly_avg DESC
    pass
```

### 2. Create Tool Function

**File**: `apps/backend/app/agent/modes_finance_llm.py`

```python
async def tool_finance_demo_overview(ctx: AgentContext) -> ToolResult:
    """
    Provide overview of demo data category spending averages.

    Only works for demo users. Returns monthly averages for each
    category in the demo dataset.

    Returns:
        ToolResult with demo category averages
    """
    # Check if user is demo user
    # Call get_demo_category_monthly_averages()
    # Format as ToolResult
    # Include metadata: kind="finance_demo_overview"
    pass
```

### 3. Register Tool

**File**: `apps/backend/app/agent/orchestrator.py` (or wherever tools are registered)

```python
# In tool registry or mode definition
FINANCE_TOOLS = [
    # ... existing tools ...
    {
        "name": "finance_demo_overview",
        "function": tool_finance_demo_overview,
        "description": "Get spending averages from demo data by category"
    }
]
```

### 4. Update Prompts

**File**: `apps/backend/app/agent/prompts.py`

Update finance mode prompts to mention demo data awareness:

```python
FINANCE_SYSTEM_PROMPT = """
...existing prompt...

For demo users, you can access demo data insights using the
finance_demo_overview tool to describe typical spending patterns
in their sample dataset.
"""
```

### 5. Add Tests

**File**: `apps/backend/app/tests/test_agent_demo_finance.py` (create new)

```python
class TestDemoFinanceTool:
    async def test_demo_overview_returns_category_averages(self):
        # Create demo user with demo transactions
        # Call tool_finance_demo_overview
        # Assert returns DemoCategoryAverage list
        # Assert sorted by monthly_avg DESC
        # Assert categories match demo data
        pass

    async def test_demo_overview_non_demo_user_returns_empty(self):
        # Create non-demo user
        # Call tool should return empty or error
        pass
```

## Expected Output Format

```json
{
  "content": {
    "data": [
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
      // ... more categories
    ]
  },
  "meta": {
    "kind": "finance_demo_overview",
    "months": 6,
    "total_categories": 20
  }
}
```

## Frontend Integration (Optional)

If we want to display demo insights in the UI:

1. Add tool result renderer for `finance_demo_overview` in `AgentResultRenderers.tsx`
2. Display as a simple table or card with category name, monthly average, count
3. Use category colors from CATEGORY_DEFS for visual consistency

## Success Criteria

- ✅ Demo user can ask "What are my average spending patterns?"
- ✅ Agent responds with category-specific monthly averages
- ✅ Data comes from demo transactions (6 months of sample data)
- ✅ Works only for demo users (safety check)
- ✅ Tool registered and callable from finance mode
- ✅ Tests validate behavior
- ✅ Agent prompt mentions demo data capability

## Notes

- This builds on demo data upgrade (commit 091312a6) - 227 transactions, 20 categories
- Pairs with category colors (commit d5fdf534) - visual consistency
- Should only work for demo users (check user.is_demo or similar flag)
- Monthly averages calculated over 6 months of demo data
- Helps users understand what the demo data represents

## Files to Create/Modify

**Create**:
- `apps/backend/app/agent/data_finance.py` (helper functions)
- `apps/backend/app/tests/test_agent_demo_finance.py` (tests)

**Modify**:
- `apps/backend/app/agent/modes_finance_llm.py` (add tool)
- `apps/backend/app/agent/orchestrator.py` (register tool)
- `apps/backend/app/agent/prompts.py` (update prompt)

**Optional**:
- `apps/web/src/components/AgentResultRenderers.tsx` (UI renderer)
