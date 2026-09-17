-- Olien accounts: the team treasury and, later, the consumer account itself. The chain
-- is the source of truth for everything in these tables except the off-chain signatures
-- and the human intent; the indexer overwrites the rest from events and views.
-- docs/treasury/04-architecture.md (Data model), 11-service-api.md.

-- Which addresses a signed-in user has proved control of. An account is visible to a
-- user when one of its ECDSA signers is linked here, so membership follows the chain's
-- signer set rather than an invite list of our own.
CREATE TABLE IF NOT EXISTS treasury_linked_addresses (
    account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, address)
);
CREATE INDEX IF NOT EXISTS treasury_linked_addresses_address_idx ON treasury_linked_addresses (address);

CREATE TABLE IF NOT EXISTS olien_accounts (
    id BIGSERIAL PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    chain_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    created_by BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    implementation TEXT,
    implementation_frozen BOOLEAN NOT NULL DEFAULT false,
    epoch BIGINT NOT NULL DEFAULT 0,
    threshold INT NOT NULL,
    veto_threshold INT NOT NULL DEFAULT 0,
    effective_veto_threshold INT NOT NULL DEFAULT 1,
    config_delay BIGINT NOT NULL,
    recovery_delay BIGINT NOT NULL,
    recovery_cosign_delay BIGINT NOT NULL,
    init JSONB NOT NULL,
    salt TEXT NOT NULL,
    -- deploying | live | disabled (the hash self-check failed: never sign against it)
    status TEXT NOT NULL,
    create_tx TEXT,
    created_block BIGINT,
    -- The last block the indexer has fully read for this account.
    indexed_block BIGINT NOT NULL DEFAULT 0,
    usdc_balance TEXT NOT NULL DEFAULT '0',
    entry_point_deposit TEXT NOT NULL DEFAULT '0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS olien_signers (
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    signer_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    permissions INT NOT NULL,
    flags INT NOT NULL DEFAULT 0,
    address TEXT,
    x TEXT,
    y TEXT,
    label TEXT NOT NULL DEFAULT '',
    since BIGINT NOT NULL DEFAULT 0,
    -- active | removed; a removed signer keeps its row so old confirmations stay readable.
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (olien_id, signer_id)
);
CREATE INDEX IF NOT EXISTS olien_signers_address_idx ON olien_signers (address);

CREATE TABLE IF NOT EXISTS olien_proposals (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    tx_hash TEXT NOT NULL UNIQUE,
    nonce_key TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    epoch BIGINT NOT NULL,
    calls JSONB NOT NULL,
    valid_after BIGINT NOT NULL,
    valid_until BIGINT NOT NULL,
    kind TEXT NOT NULL,
    intent JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- threshold | recovery
    path TEXT NOT NULL DEFAULT 'threshold',
    status TEXT NOT NULL,
    proposer BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    scheduled_ready_at BIGINT,
    scheduled_window_ends BIGINT,
    scheduled_excluded TEXT,
    executed_tx TEXT,
    executed_at BIGINT,
    failure TEXT,
    simulation_ok BOOLEAN,
    simulation_error TEXT,
    simulated_at BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olien_proposals_account_idx ON olien_proposals (olien_id, status);
CREATE INDEX IF NOT EXISTS olien_proposals_slot_idx ON olien_proposals (olien_id, nonce_key, sequence);

CREATE TABLE IF NOT EXISTS olien_confirmations (
    proposal_id BIGINT NOT NULL REFERENCES olien_proposals(id) ON DELETE CASCADE,
    signer_id TEXT NOT NULL,
    signature BYTEA NOT NULL,
    -- offchain (a signature we verified) | onchain (an Approved event; empty signature)
    kind TEXT NOT NULL,
    onchain_tx TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (proposal_id, signer_id)
);

CREATE TABLE IF NOT EXISTS olien_vetoes (
    proposal_id BIGINT NOT NULL REFERENCES olien_proposals(id) ON DELETE CASCADE,
    signer_id TEXT NOT NULL,
    tx TEXT NOT NULL,
    block_time BIGINT NOT NULL,
    PRIMARY KEY (proposal_id, signer_id)
);

CREATE TABLE IF NOT EXISTS olien_spending_limits (
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    limit_id BIGINT NOT NULL,
    generation BIGINT NOT NULL,
    token TEXT NOT NULL,
    from_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    remaining TEXT NOT NULL,
    period BIGINT NOT NULL,
    reset_at BIGINT NOT NULL,
    any_destination BOOLEAN NOT NULL,
    signers JSONB NOT NULL DEFAULT '[]'::jsonb,
    destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    PRIMARY KEY (olien_id, limit_id)
);

CREATE TABLE IF NOT EXISTS olien_sub_accounts (
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    index BIGINT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    created_tx TEXT,
    PRIMARY KEY (olien_id, index)
);

CREATE TABLE IF NOT EXISTS olien_ledger (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    tx TEXT NOT NULL,
    log_index INT NOT NULL,
    token TEXT NOT NULL,
    direction TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    amount TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    block_time BIGINT NOT NULL,
    proposal_id BIGINT REFERENCES olien_proposals(id) ON DELETE SET NULL,
    limit_id BIGINT,
    sub_account TEXT,
    UNIQUE (tx, log_index)
);
CREATE INDEX IF NOT EXISTS olien_ledger_account_idx ON olien_ledger (olien_id, id DESC);

CREATE TABLE IF NOT EXISTS olien_address_book (
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    label TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    added_by BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (olien_id, address)
);

-- The chain's next sequence per lane, read from getNonce(key); the queue's "ready" and
-- "blocked" come from comparing a proposal's sequence with this.
CREATE TABLE IF NOT EXISTS olien_lanes (
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    nonce_key TEXT NOT NULL,
    chain_sequence BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (olien_id, nonce_key)
);
