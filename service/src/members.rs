// Naming a member by something other than an address.
//
// An Olien only ever needs addresses. A directory is the optional extra that lets a
// team write `@ada` instead of `0x1d4f...` when they add a signer, and it belongs to
// whatever product is carrying the people: on Arc that is Recourse, which already
// serves `GET /api/handles/{handle}`. Monad has no such product, so there the
// directory is `None` and members are named by address, which loses nothing.
//
// This is the seam the two repositories meet at. It is one HTTP call in one direction,
// and the Olien service never reads the other product's tables.

use serde::Deserialize;

/// A member the directory could name. The address is lowercased, because every address
/// this service stores and compares is lowercased.
#[derive(Debug, Clone)]
pub struct Member {
    pub handle: String,
    pub address: String,
}

#[derive(Deserialize)]
struct HandleResponse {
    handle: String,
    address: String,
}

#[derive(Clone)]
pub enum Members {
    /// No directory. Handles are refused with an explanation rather than silently
    /// resolving to nothing, so a console that offers the field gets a usable error.
    None,
    Http {
        base: String,
        token: Option<String>,
        http: reqwest::Client,
    },
}

impl Members {
    pub fn from_config(url: Option<&str>, token: Option<&str>) -> Members {
        match url {
            Some(base) => Members::Http {
                base: base.trim_end_matches('/').to_string(),
                token: token.map(str::to_string),
                http: reqwest::Client::new(),
            },
            None => Members::None,
        }
    }

    pub fn configured(&self) -> bool {
        matches!(self, Members::Http { .. })
    }

    /// Resolve `@name` to the address that stands for that person.
    ///
    /// The error is the message a person reads, so it says what went wrong with their
    /// handle rather than what went wrong with the request.
    pub async fn resolve(&self, handle: &str) -> Result<Member, String> {
        let name = handle.trim().trim_start_matches('@');
        if name.is_empty() {
            return Err("a handle cannot be empty".into());
        }
        let (base, token, http) = match self {
            Members::None => {
                return Err("members are named by address on this chain".into())
            }
            Members::Http { base, token, http } => (base, token, http),
        };

        let mut request = http
            .get(format!("{base}/api/handles/{name}"))
            .timeout(std::time::Duration::from_secs(5));
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "the member directory did not answer".to_string())?;

        if response.status().as_u16() == 404 {
            return Err("no such handle".into());
        }
        if !response.status().is_success() {
            return Err("the member directory refused the lookup".into());
        }
        let body: HandleResponse = response
            .json()
            .await
            .map_err(|_| "the member directory answered something unreadable".to_string())?;

        // Trusting a remote service's address format would put an unchecked string into
        // a signer row, so it is parsed here and re-rendered rather than passed through.
        let address: alloy::primitives::Address = body
            .address
            .trim()
            .parse()
            .map_err(|_| "the member directory answered with an address that does not parse".to_string())?;

        Ok(Member {
            handle: body.handle,
            address: format!("{address:#x}"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn without_a_directory_a_handle_is_refused_and_says_why() {
        let error = Members::None.resolve("@ada").await.unwrap_err();
        assert_eq!(error, "members are named by address on this chain");
    }

    #[tokio::test]
    async fn an_empty_handle_never_reaches_the_network() {
        // Checked before the branch on purpose: a blank field is the client's mistake
        // on every chain, with or without a directory.
        let error = Members::from_config(Some("http://127.0.0.1:1"), None)
            .resolve("  @  ")
            .await
            .unwrap_err();
        assert_eq!(error, "a handle cannot be empty");
    }

    #[test]
    fn a_url_decides_whether_the_directory_exists() {
        assert!(!Members::from_config(None, None).configured());
        assert!(Members::from_config(Some("https://api.example/"), None).configured());
    }
}
