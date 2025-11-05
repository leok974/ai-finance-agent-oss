-- Demo seed data for ML suggestions testing
-- Creates 5 uncategorized transactions across common merchants for UI validation

-- Note: Adjust column names and table structure to match your actual schema
-- Transaction IDs use sequential integers for simplicity

INSERT INTO transactions (id, account_id, merchant, description, amount, currency, date, category)
VALUES
  -- Grocery transaction (should suggest "Groceries")
  (999001, 1, 'HARRIS TEETER #0085', 'Weekly groceries', -64.17, 'USD', CURRENT_DATE - INTERVAL '1 day', NULL),

  -- Food delivery (should suggest "Dining")
  (999002, 1, 'DD *DOORDASH POPEYES', 'Lunch order', -18.29, 'USD', CURRENT_DATE - INTERVAL '2 days', NULL),

  -- Online shopping (should suggest "Shopping")
  (999003, 1, 'AMAZON.COM*N419L0K01', 'USB-C hub', -27.95, 'USD', CURRENT_DATE - INTERVAL '3 days', NULL),

  -- Transfer (should suggest "Transfer")
  (999004, 1, 'Zelle', 'Zelle To Friend for rent split', -120.00, 'USD', CURRENT_DATE - INTERVAL '1 day', NULL),

  -- Income deposit (should suggest "Income")
  (999005, 1, 'DIRECT DEPOSIT', 'INTERNET XFR FRM SAVGS for PC upgrade', 500.00, 'USD', CURRENT_DATE - INTERVAL '4 days', NULL)

ON CONFLICT (id) DO NOTHING;

-- Verify seeds
-- SELECT id, merchant, description, amount, category FROM transactions WHERE id >= 999001 ORDER BY id;
