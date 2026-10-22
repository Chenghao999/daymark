//! Minimal WebDAV transport. The frontend builds requests and interprets the
//! responses; this module only exists because a WebView cannot send PROPFIND,
//! MOVE or Basic auth headers across origins.

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavResponse {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

/// One HTTP request against a WebDAV server.
///
/// HTTP error statuses are returned as `Ok` with their status code: the sync
/// engine needs to react to 401, 404, 409 and 507 differently. Only transport
/// failures (DNS, TLS, timeout) become `Err`.
#[tauri::command]
pub async fn webdav_request(
    method: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    body: Option<String>,
    depth: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<WebDavResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("Daymark/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    let method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|error| format!("invalid method: {error}"))?;
    let mut request = client.request(method, &url);

    if let Some(depth) = depth {
        request = request.header("Depth", depth);
    }
    if let Some(headers) = headers {
        for (name, value) in headers {
            request = request.header(name, value);
        }
    }
    if let (Some(username), Some(password)) = (username, password) {
        if !username.is_empty() {
            request = request.basic_auth(username, Some(password));
        }
    }
    if let Some(body) = body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("{url}: {error}"))?;
    let status = response.status().as_u16();
    let etag = header(&response, "etag");
    let last_modified = header(&response, "last-modified");
    let body = response
        .text()
        .await
        .map_err(|error| format!("{url}: {error}"))?;

    Ok(WebDavResponse {
        status,
        body,
        etag,
        last_modified,
    })
}

fn header(response: &reqwest::Response, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}
