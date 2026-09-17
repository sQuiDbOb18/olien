-- A ledger row that is not a token transfer needs a sentence of its own. The first
-- such row is gas: a user operation the account sent is paid from its EntryPoint
-- deposit, which is the treasury's money leaving with no Transfer log to explain it.
-- The note is also where a reverted operation says so, since the gas was paid anyway.
ALTER TABLE olien_ledger ADD COLUMN IF NOT EXISTS note TEXT;
