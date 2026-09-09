-- A treasury that holds euros could not see them.
--
-- The ledger already carried a token column, so movements only needed the indexer to
-- look for a second token. The balance did not: it was one number named for one coin.
ALTER TABLE olien_accounts ADD COLUMN IF NOT EXISTS eurc_balance TEXT NOT NULL DEFAULT '0';
