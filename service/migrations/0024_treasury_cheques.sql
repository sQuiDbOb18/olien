-- Cheques written by a treasury (docs/treasury/06-algorithms.md §10, "Cheques as
-- payables"). A cheque is USDC's own signed authorization; for an Olien the signature
-- is the account's EIP-1271 answer, threshold approvers over Message(digest). The
-- members sign here, one at a time, and once enough have the packed set becomes a
-- row in `cheques`, the same table the consumer app reads its inbox from. The
-- recipient cashes it there when they like.
--
-- Nothing on chain moves when a cheque is written. Cashed is the token's own
-- authorizationState, mirrored by the indexer; voided is the account's `cancel` over
-- the message hash, seen as a Cancelled event.

CREATE TABLE IF NOT EXISTS olien_cheques (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    to_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    valid_after BIGINT NOT NULL,
    valid_before BIGINT NOT NULL,
    nonce TEXT NOT NULL,
    -- The token's digest, and the account's Message(digest) the members sign.
    digest TEXT NOT NULL,
    message_hash TEXT NOT NULL UNIQUE,
    memo TEXT,
    -- open (collecting signatures) | issued | cashed | voiding | voided | expired
    status TEXT NOT NULL DEFAULT 'open',
    cheque_id BIGINT REFERENCES cheques(cheque_id) ON DELETE SET NULL,
    void_proposal_id BIGINT REFERENCES olien_proposals(id) ON DELETE SET NULL,
    proposer BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    issued_at TIMESTAMPTZ,
    cashed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olien_cheques_account_idx ON olien_cheques (olien_id, status);

CREATE TABLE IF NOT EXISTS olien_cheque_signatures (
    cheque_id BIGINT NOT NULL REFERENCES olien_cheques(id) ON DELETE CASCADE,
    signer_id TEXT NOT NULL,
    signature BYTEA NOT NULL,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (cheque_id, signer_id)
);
