-- Webhooks for a treasury: the other half of API keys. A key lets a system put
-- payouts in the queue and read the ledger; a webhook tells it when money moved or a
-- proposal changed, so an accounting system reconciles as it happens instead of
-- polling. docs/treasury/11-service-api.md, "Webhooks".
--
-- Deliveries are an outbox: each webhook keeps a cursor into the ledger and into
-- proposal updates, the indexer's cycle turns what is new into rows here, and a
-- sender works through them with retries. Nothing is sent from inside a request.

CREATE TABLE IF NOT EXISTS olien_webhooks (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    -- Signs every delivery (HMAC-SHA256); kept as is because signing needs it.
    secret TEXT NOT NULL,
    -- ["ledger", "proposals"]
    events JSONB NOT NULL,
    -- The last ledger row and the last proposal update already turned into deliveries.
    ledger_cursor BIGINT NOT NULL DEFAULT 0,
    proposal_cursor TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Consecutive deliveries that never got through; past a point the hook is switched off.
    failures INT NOT NULL DEFAULT 0,
    disabled_at TIMESTAMPTZ,
    disabled_reason TEXT,
    last_delivery_at TIMESTAMPTZ,
    last_status INT,
    created_by BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olien_webhooks_account_idx ON olien_webhooks (olien_id);

CREATE TABLE IF NOT EXISTS olien_webhook_deliveries (
    id BIGSERIAL PRIMARY KEY,
    webhook_id BIGINT NOT NULL REFERENCES olien_webhooks(id) ON DELETE CASCADE,
    event TEXT NOT NULL,
    payload JSONB NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    -- Given up: the attempts ran out. Kept so the console can show what was missed.
    abandoned_at TIMESTAMPTZ,
    last_status INT,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olien_webhook_deliveries_due_idx ON olien_webhook_deliveries (next_attempt_at)
    WHERE delivered_at IS NULL AND abandoned_at IS NULL;
