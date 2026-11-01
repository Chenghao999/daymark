//! Shared HTTP transport. The frontend builds requests and interprets the
//! responses; this module exists because a WebView cannot send PROPFIND, MOVE,
//! custom headers or requests to endpoints without CORS headers.
//!
//! `webdav_request` serves `src/sync/webdav/client.ts`; `ai_request` serves the
//! OpenAI-compatible AI provider, whose vendors (DeepSeek, Qwen, …) do not send
//! CORS headers. Anthropic uses its official SDK, which handles the WebView
//! itself.

use std::collections::HashMap;
use std::time::Duration;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

/// One HTTP request. HTTP error statuses are returned as `Ok` with their status
/// code: the sync engine needs to react to 401, 404, 409 and 507 differently,
/// and the AI provider needs to see 400/422 to retry a weaker request shape.
/// Only transport failures (DNS, TLS, timeout) become `Err`.
async fn send(
    method: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    body: Option<String>,
    depth: Option<String>,
    headers: Option<HashMap<String, String>>,
    timeout: Duration,
) -> Result<HttpResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(timeout)
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

    Ok(HttpResponse {
        status,
        body,
        etag,
        last_modified,
    })
}

/// WebDAV transport used by the sync engine.
#[tauri::command]
pub async fn webdav_request(
    method: String,
    url: String,
    username: Option<String>,
    password: Option<String>,
    body: Option<String>,
    depth: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<HttpResponse, String> {
    send(
        method,
        url,
        username,
        password,
        body,
        depth,
        headers,
        Duration::from_secs(45),
    )
    .await
}

/// OpenAI-compatible AI transport. A 45 s timeout is too short for reasoning
/// models and long reports, so this command allows two minutes. Bearer keys
/// arrive through `headers`, never as parameters, so they are not logged with
/// the request line.
#[tauri::command]
pub async fn ai_request(
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    send(
        "POST".to_owned(),
        url,
        None,
        None,
        body,
        None,
        headers,
        Duration::from_secs(120),
    )
    .await
}

fn header(response: &reqwest::Response, name: &str) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}
