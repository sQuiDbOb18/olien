// The /api/treasury routes (docs/treasury/11-service-api.md). Thin: parse, resolve the
// caller, hand to services::treasury, map its error to a status.

use actix_web::{web, HttpRequest, HttpResponse};
use serde::Deserialize;
use sqlx::PgPool;

use crate::handlers::auth::{account_error_response, bearer_token, error_response};
use crate::services::account_sessions::{self, AccountProfile};
use crate::services::treasury::{self, Treasury, TreasuryError};

async fn caller(pool: &PgPool, req: &HttpRequest) -> Result<AccountProfile, HttpResponse> {
    let token = match bearer_token(req) {
        Ok(token) => token,
        Err((status, message)) => return Err(error_response(status, &message)),
    };
    account_sessions::account_for_access_token(pool, token)
        .await
        .map_err(|error| account_error_response("reading account session", error))
}

fn failed(error: TreasuryError) -> HttpResponse {
    let (status, message) = error.parts();
    if status >= 500 {
        tracing::warn!("treasury route failed: {message}");
    }
    error_response(status, &message)
}

fn reply<T: serde::Serialize>(result: Result<T, TreasuryError>) -> HttpResponse {
    match result {
        Ok(value) => HttpResponse::Ok().json(value),
        Err(error) => failed(error),
    }
}

macro_rules! who {
    ($pool:expr, $req:expr) => {
        match caller($pool.get_ref(), &$req).await {
            Ok(profile) => profile.account_id,
            Err(response) => return response,
        }
    };
}

#[derive(Debug, Deserialize)]
pub struct LinkBody {
    pub address: String,
    pub signature: String,
}

pub async fn linked_addresses(pool: web::Data<PgPool>, req: HttpRequest) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::linked_addresses(pool.get_ref(), user).await)
}

pub async fn link_address(pool: web::Data<PgPool>, req: HttpRequest, body: web::Json<LinkBody>) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::link_address(pool.get_ref(), user, &body.address, &body.signature).await)
}

pub async fn list_accounts(pool: web::Data<PgPool>, req: HttpRequest) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::list_accounts(pool.get_ref(), user).await)
}

pub async fn create_account(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    body: web::Json<treasury::CreateAccountBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::create_account(pool.get_ref(), service.get_ref(), user, body.into_inner()).await)
}

pub async fn get_account(pool: web::Data<PgPool>, service: web::Data<Treasury>, req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::account_view(pool.get_ref(), service.get_ref(), user, &path).await)
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub status: Option<String>,
}

pub async fn list_proposals(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    query: web::Query<ListQuery>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::list_proposals(pool.get_ref(), service.get_ref(), user, &path, query.status.as_deref()).await)
}

pub async fn create_proposal(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::NewProposalBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::create_proposal(pool.get_ref(), service.get_ref(), user, &path, body.into_inner()).await)
}

pub async fn propose_transfer(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::TransferBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::propose_transfer(pool.get_ref(), service.get_ref(), user, &path, body.into_inner()).await)
}

pub async fn propose_signers(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::SignersProposalBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::propose_signers(pool.get_ref(), service.get_ref(), user, &path, body.into_inner()).await)
}

pub async fn propose_limit(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::LimitProposalBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::propose_limit(pool.get_ref(), service.get_ref(), user, &path, body.into_inner()).await)
}

pub async fn propose_remove_limit(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::RemoveLimitBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::propose_remove_limit(pool.get_ref(), service.get_ref(), user, &path, body.into_inner()).await)
}

pub async fn get_proposal(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::get_proposal(pool.get_ref(), service.get_ref(), user, &address, &hash).await)
}

pub async fn delete_proposal(pool: web::Data<PgPool>, req: HttpRequest, path: web::Path<(String, String)>) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    match treasury::delete_proposal(pool.get_ref(), user, &address, &hash).await {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(error) => failed(error),
    }
}

pub async fn confirm(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<(String, String)>,
    body: web::Json<treasury::ConfirmationBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::confirm(pool.get_ref(), service.get_ref(), user, &address, &hash, body.into_inner()).await)
}

pub async fn execute(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::execute(pool.get_ref(), service.get_ref(), user, &address, &hash).await)
}

pub async fn cancel(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::propose_cancel(pool.get_ref(), service.get_ref(), user, &address, &hash).await)
}

pub async fn list_scheduled(pool: web::Data<PgPool>, service: web::Data<Treasury>, req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::list_scheduled(pool.get_ref(), service.get_ref(), user, &path).await)
}

pub async fn veto_call(pool: web::Data<PgPool>, req: HttpRequest, path: web::Path<(String, String)>) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::veto_call(pool.get_ref(), user, &address, &hash).await)
}

pub async fn execute_scheduled(
    pool: web::Data<PgPool>,
    service: web::Data<Treasury>,
    req: HttpRequest,
    path: web::Path<(String, String)>,
) -> HttpResponse {
    let user = who!(pool, req);
    let (address, hash) = path.into_inner();
    reply(treasury::execute_scheduled(pool.get_ref(), service.get_ref(), user, &address, &hash).await)
}

#[derive(Debug, Deserialize)]
pub struct LedgerQuery {
    pub limit: Option<i64>,
    pub before: Option<i64>,
}

pub async fn ledger(pool: web::Data<PgPool>, req: HttpRequest, path: web::Path<String>, query: web::Query<LedgerQuery>) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::ledger(pool.get_ref(), user, &path, query.limit.unwrap_or(100), query.before).await)
}

pub async fn address_book(pool: web::Data<PgPool>, req: HttpRequest, path: web::Path<String>) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::address_book(pool.get_ref(), user, &path).await)
}

pub async fn add_address(
    pool: web::Data<PgPool>,
    req: HttpRequest,
    path: web::Path<String>,
    body: web::Json<treasury::AddressBookBody>,
) -> HttpResponse {
    let user = who!(pool, req);
    reply(treasury::add_address(pool.get_ref(), user, &path, body.into_inner()).await)
}

/// The route table, mounted under /api/treasury.
pub fn routes(scope: actix_web::Scope) -> actix_web::Scope {
    scope
        .route("/linked-addresses", web::get().to(linked_addresses))
        .route("/link-address", web::post().to(link_address))
        .route("/accounts", web::get().to(list_accounts))
        .route("/accounts", web::post().to(create_account))
        .route("/accounts/{address}", web::get().to(get_account))
        .route("/accounts/{address}/proposals", web::get().to(list_proposals))
        .route("/accounts/{address}/proposals", web::post().to(create_proposal))
        .route("/accounts/{address}/proposals/transfer", web::post().to(propose_transfer))
        .route("/accounts/{address}/proposals/signers", web::post().to(propose_signers))
        .route("/accounts/{address}/proposals/limit", web::post().to(propose_limit))
        .route("/accounts/{address}/proposals/remove-limit", web::post().to(propose_remove_limit))
        .route("/accounts/{address}/proposals/{hash}", web::get().to(get_proposal))
        .route("/accounts/{address}/proposals/{hash}", web::delete().to(delete_proposal))
        .route("/accounts/{address}/proposals/{hash}/confirmations", web::post().to(confirm))
        .route("/accounts/{address}/proposals/{hash}/execute", web::post().to(execute))
        .route("/accounts/{address}/proposals/{hash}/cancel", web::post().to(cancel))
        .route("/accounts/{address}/scheduled", web::get().to(list_scheduled))
        .route("/accounts/{address}/scheduled/{hash}/veto-call", web::get().to(veto_call))
        .route("/accounts/{address}/scheduled/{hash}/execute", web::post().to(execute_scheduled))
        .route("/accounts/{address}/ledger", web::get().to(ledger))
        .route("/accounts/{address}/address-book", web::get().to(address_book))
        .route("/accounts/{address}/address-book", web::post().to(add_address))
}
