-- Payroll runs: a named list of people and amounts a treasury pays again and again.
-- Running one opens an ordinary batch proposal in the payroll lane, so it needs the
-- same signatures as any payment; the template only saves the typing and, when it
-- has a schedule, the remembering. docs/treasury/06-algorithms.md §10.

CREATE TABLE IF NOT EXISTS olien_payrolls (
    id BIGSERIAL PRIMARY KEY,
    olien_id BIGINT NOT NULL REFERENCES olien_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token TEXT NOT NULL,
    -- [{ to, amount, label, memo }], amounts in the token's smallest unit.
    recipients JSONB NOT NULL,
    -- none | weekly | fortnightly | monthly
    period TEXT NOT NULL DEFAULT 'none',
    -- When the service next opens the proposal by itself; null when period is none.
    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,
    last_run_proposal_id BIGINT REFERENCES olien_proposals(id) ON DELETE SET NULL,
    -- Why the last scheduled run did not open, so a missed month is not silent.
    last_error TEXT,
    created_by BIGINT REFERENCES accounts(account_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS olien_payrolls_account_idx ON olien_payrolls (olien_id);
CREATE INDEX IF NOT EXISTS olien_payrolls_due_idx ON olien_payrolls (next_run_at) WHERE period <> 'none';
