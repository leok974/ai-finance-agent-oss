-- Demo seed data for ML suggestions testing
-- Creates 5 uncategorized transactions across common merchants for UI validation

INSERT INTO transactions (id, merchant, description, amount, date, category, account, month)
VALUES
  -- Grocery transaction (should suggest "Groceries")
  (999001, 'HARRIS TEETER #0085', 'Weekly groceries', -64.17, CURRENT_DATE - INTERVAL '1 day', NULL, 'checking', TO_CHAR(CURRENT_DATE - INTERVAL '1 day', 'YYYY-MM')),

  -- Food delivery (should suggest "Dining")
  (999002, 'DD *DOORDASH POPEYES', 'Lunch order', -18.29, CURRENT_DATE - INTERVAL '2 days', NULL, 'checking', TO_CHAR(CURRENT_DATE - INTERVAL '2 days', 'YYYY-MM')),

  -- Online shopping (should suggest "Shopping")
  (999003, 'AMAZON.COM*N419L0K01', 'USB-C hub', -27.95, CURRENT_DATE - INTERVAL '3 days', NULL, 'checking', TO_CHAR(CURRENT_DATE - INTERVAL '3 days', 'YYYY-MM')),

  -- Transfer (should suggest "Transfer")
  (999004, 'Zelle', 'Zelle To Friend for rent split', -120.00, CURRENT_DATE - INTERVAL '1 day', NULL, 'checking', TO_CHAR(CURRENT_DATE - INTERVAL '1 day', 'YYYY-MM')),

  -- Income deposit (should suggest "Income")
  (999005, 'DIRECT DEPOSIT', 'INTERNET XFR FRM SAVGS for PC upgrade', 500.00, CURRENT_DATE - INTERVAL '4 days', NULL, 'checking', TO_CHAR(CURRENT_DATE - INTERVAL '4 days', 'YYYY-MM'))

ON CONFLICT (id) DO NOTHING;

-- Verify seeds
-- SELECT id, merchant, description, amount, category FROM transactions WHERE id >= 999001 ORDER BY id;
