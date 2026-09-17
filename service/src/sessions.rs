// Account sessions for the Olien console. The only door here is a wallet signature: the
// service hands out the exact text to sign, the wallet signs it, and the address becomes
// the account's identity. Sessions are opaque tokens, stored as hashes, and the challenge
// row they consume is single-use.

use alloy::primitives::{keccak256, Address, Signature, B256};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Serialize;
use sqlx::{PgPool, Postgres, Transaction};
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

pub const CHALLENGE_TTL_SECS: i64 = 300; // 5 minutes
const ACCESS_TOKEN_TTL_SECS: i64 = 15 * 60;
const REFRESH_TOKEN_TTL_SECS: i64 = 30 * 24 * 60 * 60;

#[derive(Debug)]
pub enum AccountAuthError {
    BadRequest(String),
    Unauthorized(String),
    // Unreachable through the wallet login that is the only way in here. Kept so the
    // status mapping below stays complete if another way in is ever added.
    #[allow(dead_code)]
    Conflict(String),
    Internal(String),
}

impl AccountAuthError {
    pub fn parts(&self) -> (u16, String) {
        match self {
            Self::BadRequest(message) => (400, message.clone()),
            Self::Unauthorized(message) => (401, message.clone()),
            Self::Conflict(message) => (409, message.clone()),
            Self::Internal(message) => (500, message.clone()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub account_id: i64,
    // Which provider identifies this account. On the console that is "wallet", and the
    // subject is the address it signed with.
    pub provider: String,
    pub provider_user_id: String,
    pub email: Option<String>,
    pub given_name: Option<String>,
    pub family_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionGrant {
    pub access_token: String,
    pub refresh_token: String,
    pub access_expires_at: i64,
    pub refresh_expires_at: i64,
    pub account: AccountProfile,
}

pub struct Challenge {
    pub nonce: String,
    pub expires_at: i64,
}

// Issue a fresh single-use challenge, pruning expired rows so the table stays small.
pub async fn issue_challenge(pool: &PgPool) -> Result<Challenge, AccountAuthError> {
    let now = now_secs();
    let expires_at = now + CHALLENGE_TTL_SECS;
    let mut raw = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut raw);
    let nonce = format!("{:#x}", B256::from(raw));

    let _ = sqlx::query("DELETE FROM auth_challenges WHERE expires_at < $1")
        .bind(now)
        .execute(pool)
        .await;
    sqlx::query("INSERT INTO auth_challenges (nonce, expires_at) VALUES ($1, $2)")
        .bind(&nonce)
        .bind(expires_at)
        .execute(pool)
        .await
        .map_err(|e| AccountAuthError::Internal(format!("issuing challenge: {e}")))?;
    Ok(Challenge { nonce, expires_at })
}

// The text a wallet signs to enter the Olien console. The nonce is a single-use row of
// auth_challenges and the expiry is that row's, so the server rebuilds the exact text
// from what it stored; a signature over anything else recovers a different address.
pub fn wallet_login_message(address: Address, nonce: &str, expires_at: i64) -> String {
    format!(
        "Sign in to Olien\n\nAddress: {}\nNonce: {}\nExpires: {}",
        address.to_checksum(None),
        nonce,
        expires_at
    )
}

pub fn recover_wallet_signer(message: &str, signature: &str) -> Result<Address, AccountAuthError> {
    let raw = alloy::hex::decode(signature.trim().trim_start_matches("0x"))
        .map_err(|_| AccountAuthError::BadRequest("malformed signature".into()))?;
    if raw.len() != 65 {
        return Err(AccountAuthError::BadRequest("signature must be 65 bytes".into()));
    }
    let signature = Signature::from_raw(&raw)
        .map_err(|_| AccountAuthError::BadRequest("malformed signature".into()))?;
    signature
        .recover_address_from_msg(message)
        .map_err(|_| AccountAuthError::Unauthorized("signature does not recover an address".into()))
}

// Wallet sign-in: the address is the identity (provider "wallet"), the way Squads treats a
// connected wallet. The address is linked as a treasury address in the same transaction so
// every Olien naming it as a signer is visible from the first sign-in.
pub async fn login_wallet(
    pool: &PgPool,
    address: &str,
    nonce: &str,
    signature: &str,
) -> Result<SessionGrant, AccountAuthError> {
    let address = Address::from_str(address.trim())
        .map_err(|_| AccountAuthError::BadRequest("malformed address".into()))?;
    let now = now_secs();
    let mut transaction = pool.begin().await.map_err(|error| {
        AccountAuthError::Internal(format!("starting auth transaction: {error}"))
    })?;

    let expires_at = sqlx::query_scalar::<_, i64>(
        "UPDATE auth_challenges SET consumed = TRUE \
         WHERE nonce = $1 AND consumed = FALSE AND expires_at > $2 \
         RETURNING expires_at",
    )
    .bind(nonce)
    .bind(now)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("consuming wallet challenge: {error}")))?;
    let Some(expires_at) = expires_at else {
        return Err(AccountAuthError::Unauthorized(
            "challenge is invalid, expired, or already used".into(),
        ));
    };

    let message = wallet_login_message(address, nonce, expires_at);
    if recover_wallet_signer(&message, signature)? != address {
        return Err(AccountAuthError::Unauthorized(
            "signature was not made by this address".into(),
        ));
    }

    let subject = format!("{address:#x}");
    let account = upsert_account(&mut transaction, "wallet", subject.clone(), None, None, None).await?;
    sqlx::query(
        "INSERT INTO treasury_linked_addresses (account_id, address) VALUES ($1, $2) \
         ON CONFLICT DO NOTHING",
    )
    .bind(account.account_id)
    .bind(&subject)
    .execute(&mut *transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("linking wallet address: {error}")))?;
    let grant = insert_session(&mut transaction, account, now).await?;

    transaction
        .commit()
        .await
        .map_err(|error| AccountAuthError::Internal(format!("committing wallet session: {error}")))?;
    Ok(grant)
}

pub async fn refresh_session(
    pool: &PgPool,
    refresh_token: &str,
) -> Result<SessionGrant, AccountAuthError> {
    let now = now_secs();
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| AccountAuthError::Internal(format!("starting refresh: {error}")))?;
    let row = sqlx::query_as::<
        _,
        (
            i64,
            i64,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        ),
    >(
        "SELECT s.session_id, a.account_id, a.provider, a.provider_subject, a.email, a.given_name, a.family_name \
         FROM account_sessions s JOIN accounts a ON a.account_id = s.account_id \
         WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.refresh_expires_at > $2 \
         FOR UPDATE",
    )
    .bind(token_hash(refresh_token))
    .bind(now)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("reading refresh session: {error}")))?
    .ok_or_else(|| AccountAuthError::Unauthorized("refresh token is invalid or expired".into()))?;

    let account = AccountProfile {
        account_id: row.1,
        provider: row.2,
        provider_user_id: row.3,
        email: row.4,
        given_name: row.5,
        family_name: row.6,
    };
    let access_token = random_token();
    let replacement_refresh_token = random_token();
    let access_expires_at = now + ACCESS_TOKEN_TTL_SECS;
    let refresh_expires_at = now + REFRESH_TOKEN_TTL_SECS;
    sqlx::query(
        "UPDATE account_sessions SET access_token_hash = $1, refresh_token_hash = $2, \
         access_expires_at = $3, refresh_expires_at = $4, updated_at = now() \
         WHERE session_id = $5",
    )
    .bind(token_hash(&access_token))
    .bind(token_hash(&replacement_refresh_token))
    .bind(access_expires_at)
    .bind(refresh_expires_at)
    .bind(row.0)
    .execute(&mut *transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("rotating session: {error}")))?;
    transaction
        .commit()
        .await
        .map_err(|error| AccountAuthError::Internal(format!("committing refresh: {error}")))?;

    Ok(SessionGrant {
        access_token,
        refresh_token: replacement_refresh_token,
        access_expires_at,
        refresh_expires_at,
        account,
    })
}

pub async fn account_for_access_token(
    pool: &PgPool,
    access_token: &str,
) -> Result<AccountProfile, AccountAuthError> {
    let row = sqlx::query_as::<_, (i64, String, String, Option<String>, Option<String>, Option<String>)>(
        "SELECT a.account_id, a.provider, a.provider_subject, a.email, a.given_name, a.family_name \
         FROM account_sessions s JOIN accounts a ON a.account_id = s.account_id \
         WHERE s.access_token_hash = $1 AND s.revoked_at IS NULL AND s.access_expires_at > $2",
    )
    .bind(token_hash(access_token))
    .bind(now_secs())
    .fetch_optional(pool)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("reading account session: {error}")))?
    .ok_or_else(|| AccountAuthError::Unauthorized("access token is invalid or expired".into()))?;

    Ok(profile_from_row(row))
}

pub async fn revoke_access_token(
    pool: &PgPool,
    access_token: &str,
) -> Result<(), AccountAuthError> {
    sqlx::query(
        "UPDATE account_sessions SET revoked_at = now(), updated_at = now() \
         WHERE access_token_hash = $1 AND revoked_at IS NULL",
    )
    .bind(token_hash(access_token))
    .execute(pool)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("revoking session: {error}")))?;
    Ok(())
}

async fn upsert_account(
    transaction: &mut Transaction<'_, Postgres>,
    provider: &str,
    subject: String,
    email: Option<String>,
    given_name: Option<String>,
    family_name: Option<String>,
) -> Result<AccountProfile, AccountAuthError> {
    let row = sqlx::query_as::<
        _,
        (
            i64,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
        ),
    >(
        "INSERT INTO accounts (provider, provider_subject, email, given_name, family_name) \
         VALUES ($1, $2, $3, $4, $5) \
         ON CONFLICT (provider, provider_subject) DO UPDATE SET \
           email = COALESCE(EXCLUDED.email, accounts.email), \
           given_name = COALESCE(EXCLUDED.given_name, accounts.given_name), \
           family_name = COALESCE(EXCLUDED.family_name, accounts.family_name), \
           updated_at = now() \
         RETURNING account_id, provider, provider_subject, email, given_name, family_name",
    )
    .bind(provider)
    .bind(subject)
    .bind(email)
    .bind(clean_optional(given_name))
    .bind(clean_optional(family_name))
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("saving {provider} account: {error}")))?;

    Ok(profile_from_row(row))
}

async fn insert_session(
    transaction: &mut Transaction<'_, Postgres>,
    account: AccountProfile,
    now: i64,
) -> Result<SessionGrant, AccountAuthError> {
    let access_token = random_token();
    let refresh_token = random_token();
    let access_expires_at = now + ACCESS_TOKEN_TTL_SECS;
    let refresh_expires_at = now + REFRESH_TOKEN_TTL_SECS;
    sqlx::query(
        "INSERT INTO account_sessions \
         (account_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at) \
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(account.account_id)
    .bind(token_hash(&access_token))
    .bind(token_hash(&refresh_token))
    .bind(access_expires_at)
    .bind(refresh_expires_at)
    .execute(&mut **transaction)
    .await
    .map_err(|error| AccountAuthError::Internal(format!("creating account session: {error}")))?;

    Ok(SessionGrant {
        access_token,
        refresh_token,
        access_expires_at,
        refresh_expires_at,
        account,
    })
}

fn profile_from_row(
    row: (
        i64,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ),
) -> AccountProfile {
    AccountProfile {
        account_id: row.0,
        provider: row.1,
        provider_user_id: row.2,
        email: row.3,
        given_name: row.4,
        family_name: row.5,
    }
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn token_hash(token: &str) -> Vec<u8> {
    keccak256(token.as_bytes()).to_vec()
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wallet_login_recovers_the_signer() {
        use alloy::signers::{local::PrivateKeySigner, SignerSync};
        let signer = PrivateKeySigner::random();
        let message = wallet_login_message(signer.address(), "0xabc", 1_800_000_000);
        assert!(message.starts_with("Sign in to Olien\n\nAddress: 0x"));
        let signature = signer.sign_message_sync(message.as_bytes()).unwrap();
        let hex = format!("0x{}", alloy::hex::encode(signature.as_bytes()));
        assert_eq!(recover_wallet_signer(&message, &hex).unwrap(), signer.address());
        let other = wallet_login_message(signer.address(), "0xabd", 1_800_000_000);
        assert_ne!(recover_wallet_signer(&other, &hex).unwrap(), signer.address());
        assert!(recover_wallet_signer(&message, "0x1234").is_err());
    }

    #[test]
    fn tokens_are_random_and_url_safe() {
        let first = random_token();
        let second = random_token();
        assert_ne!(first, second);
        assert_eq!(first.len(), 43);
        assert!(!first.contains('='));
    }
}
