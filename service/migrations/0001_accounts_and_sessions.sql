-- Off-chain account identity for the Olien console. The identity is
-- (provider, provider_subject); on this service that pair is always ('wallet', address),
-- and the linked Arc addresses in treasury_linked_addresses remain the authority for
-- anything the chain has to accept.

-- One-time challenges for wallet-signature sign-in. The service issues a random nonce,
-- the wallet signs the login text built around it, and the nonce is consumed atomically at
-- verify time so a captured signature cannot be replayed. Rows are short lived; expired
-- ones are pruned on issue.
CREATE TABLE IF NOT EXISTS auth_challenges (
    nonce      TEXT PRIMARY KEY,       -- 0x-prefixed 32-byte hex
    expires_at BIGINT NOT NULL,        -- unix seconds
    consumed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
    account_id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_subject TEXT NOT NULL,
    email TEXT,
    given_name TEXT,
    family_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT accounts_provider_identity_key UNIQUE (provider, provider_subject)
);

-- Sessions store only hashes: a stolen row cannot be replayed as a token.
CREATE TABLE IF NOT EXISTS account_sessions (
    session_id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    access_token_hash BYTEA NOT NULL UNIQUE,
    refresh_token_hash BYTEA NOT NULL UNIQUE,
    access_expires_at BIGINT NOT NULL,
    refresh_expires_at BIGINT NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_account ON account_sessions (account_id);
CREATE INDEX IF NOT EXISTS idx_account_sessions_refresh ON account_sessions (refresh_token_hash);
