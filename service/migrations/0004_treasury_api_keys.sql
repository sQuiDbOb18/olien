-- API keys for a treasury, so a payroll or accounting system can read the ledger and
-- put payouts in the queue without a person at a browser. A key never signs: the
-- proposals it opens still need the threshold's signatures, the same as one a member
-- opened by hand. docs/treasury/04-architecture.md (API keys), 11-service-api.md.
--
-- A key acts as the member who minted it and stops working the moment that member is
-- no longer one, so removing a person from the signer set also removes every key they
-- handed out. The key itself is shown once and only its hash is kept.

CREATE TABLE IF NOT EXISTS olien_api_keys (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- read | propose
    scope TEXT NOT NULL,
    key_hash BYTEA NOT NULL UNIQUE,
    -- The last four characters, so two keys with the same name can be told apart.
    hint TEXT NOT NULL,
    created_by BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS olien_api_keys_account_idx ON olien_api_keys (olien_id);

-- Which key opened a proposal, when one did, so the queue can say so.
ALTER TABLE olien_proposals ADD COLUMN IF NOT EXISTS api_key_id BIGINT REFERENCES olien_api_keys(id) ON DELETE SET NULL;
