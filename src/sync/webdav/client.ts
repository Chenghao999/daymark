import { invoke } from "@tauri-apps/api/core";
import type { RemoteEntry, WebDavConfig } from "./types";

interface WebDavResponse {
  status: number;
  body: string;
  etag: string | null;
  lastModified: string | null;
}

interface ParsedEntry {
  href: string;
  isDirectory: boolean;
  size: number | null;
  etag: string | null;
  lastModified: string | null;
}

const PROPFIND_BODY = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<d:propfind xmlns:d="DAV:">',
  "<d:prop>",
  "<d:resourcetype/>",
  "<d:getcontentlength/>",
  "<d:getlastmodified/>",
  "<d:getetag/>",
  "</d:prop>",
  "</d:propfind>",
].join("");

export class WebDavError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WebDavError";
  }
}

/** `""` → `/`, `daymark` → `/daymark/`. */
export function normalizeRemotePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/** Absolute URL of the remote root, always ending in `/`. */
export function remoteRootUrl(config: Pick<WebDavConfig, "url" | "remotePath">): string {
  const base = config.url.trim().replace(/\/+$/, "");
  return `${base}${encodePath(normalizeRemotePath(config.remotePath))}`;
}

/** Absolute URL of a file or folder below the remote root. */
export function remoteFileUrl(
  config: Pick<WebDavConfig, "url" | "remotePath">,
  path: string,
  directory = false,
): string {
  const suffix = encodePath(path.replace(/^\/+/, ""));
  const url = `${remoteRootUrl(config)}${suffix}`;
  return directory && !url.endsWith("/") ? `${url}/` : url;
}

/** Path of a PROPFIND `href`, relative to the remote root. */
export function relativeHref(href: string, rootUrl: string): string | null {
  const hrefPath = absolutePath(href);
  const rootPath = pathOfUrl(rootUrl);
  if (hrefPath === null || rootPath === null) return null;

  const decodedHref = safeDecode(hrefPath);
  const decodedRoot = safeDecode(rootPath).replace(/\/+$/, "");
  if (decodedHref.replace(/\/+$/, "") === decodedRoot) return null;
  if (!decodedHref.startsWith(`${decodedRoot}/`)) return null;

  const relative = decodedHref.slice(decodedRoot.length + 1).replace(/\/+$/, "");
  return relative || null;
}

/**
 * Namespace-agnostic PROPFIND parser. Servers use `D:`, `d:`, `DAV:` or no
 * prefix at all, so the regexes treat a prefix as optional. This keeps the
 * client testable in Node, where `DOMParser` does not exist.
 */
export function parsePropfind(xml: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const responseRe =
    /<(?:[A-Za-z0-9.-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9.-]+:)?response>/gi;
  let match: RegExpExecArray | null;
  while ((match = responseRe.exec(xml)) !== null) {
    const block = match[1];
    const href = tagText(block, "href");
    if (href === null) continue;
    const sizeText = tagText(block, "getcontentlength");
    const size = sizeText === null ? null : Number.parseInt(sizeText, 10);
    entries.push({
      href: decodeXml(href),
      isDirectory: /<(?:[A-Za-z0-9.-]+:)?collection\b/i.test(block),
      size: size !== null && Number.isFinite(size) ? size : null,
      etag: tagText(block, "getetag"),
      lastModified: tagText(block, "getlastmodified"),
    });
  }
  return entries;
}

function tagText(block: string, tag: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z0-9.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9.-]+:)?${tag}>`,
    "i",
  );
  const match = re.exec(block);
  return match ? match[1].trim() : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function absolutePath(href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) {
    try {
      return new URL(href).pathname;
    } catch {
      return null;
    }
  }
  return href.split("?")[0] || null;
}

function pathOfUrl(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

/**
 * Thin wrapper over the Rust `webdav_request` command. All methods throw
 * `WebDavError` for an HTTP status the caller did not expect; network failures
 * arrive as a plain `Error` from the command.
 */
export class WebDavClient {
  constructor(private readonly config: WebDavConfig) {}

  rootUrl(): string {
    return remoteRootUrl(this.config);
  }

  fileUrl(path: string, directory = false): string {
    return remoteFileUrl(this.config, path, directory);
  }

  /** Verifies the URL, credentials and that the remote root is reachable. */
  async test(): Promise<void> {
    const response = await this.request("PROPFIND", this.rootUrl(), {
      depth: "0",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: PROPFIND_BODY,
    });
    if (response.status !== 207 && response.status !== 200) {
      throw failure(response, "PROPFIND");
    }
  }

  /** Entries directly inside `path` (default: the remote root). */
  async list(path = ""): Promise<RemoteEntry[]> {
    const url = path ? this.fileUrl(path, true) : this.rootUrl();
    const response = await this.request("PROPFIND", url, {
      depth: "1",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: PROPFIND_BODY,
    });
    if (response.status !== 207 && response.status !== 200) {
      throw failure(response, "PROPFIND");
    }
    return parsePropfind(response.body)
      .map((entry) => {
        const relative = relativeHref(entry.href, this.rootUrl());
        if (!relative) return null;
        return {
          path: relative,
          isDirectory: entry.isDirectory,
          size: entry.size,
          etag: entry.etag,
          lastModified: entry.lastModified,
        } satisfies RemoteEntry;
      })
      .filter((entry): entry is RemoteEntry => entry !== null);
  }

  /**
   * Files in the root and one level of month folders — the same two levels
   * `tree_signature` scans. Other directories are ignored.
   */
  async listTree(): Promise<RemoteEntry[]> {
    const root = await this.list();
    const directories = root.filter((entry) => entry.isDirectory);
    const children = await Promise.all(directories.map((entry) => this.list(entry.path)));
    return [...root, ...children.flat()].filter((entry) => !entry.isDirectory);
  }

  async getText(path: string): Promise<string> {
    const response = await this.request("GET", this.fileUrl(path));
    if (response.status !== 200) throw failure(response, `GET ${path}`);
    return response.body;
  }

  async mkcol(path = ""): Promise<void> {
    const response = await this.request("MKCOL", path ? this.fileUrl(path, true) : this.rootUrl());
    // 405 means it already exists; both outcomes leave a usable collection.
    if (response.status !== 201 && response.status !== 405) {
      throw failure(response, `MKCOL ${path || "/"}`);
    }
  }

  /**
   * Uploads through a temporary name and moves it into place, so readers never
   * see half a file. Servers without MOVE fall back to a direct PUT.
   */
  async putText(path: string, contents: string): Promise<void> {
    const tempPath = `${path}.daymark-tmp`;
    const put = await this.request("PUT", this.fileUrl(tempPath), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
      body: contents,
    });
    if (put.status !== 201 && put.status !== 200 && put.status !== 204) {
      throw failure(put, `PUT ${path}`);
    }

    const move = await this.request("MOVE", this.fileUrl(tempPath), {
      headers: { Destination: this.fileUrl(path), Overwrite: "T" },
    });
    if (move.status >= 200 && move.status < 300) return;
    if (move.status === 405 || move.status === 501) {
      const retry = await this.request("PUT", this.fileUrl(path), {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: contents,
      });
      if (retry.status === 201 || retry.status === 200 || retry.status === 204) return;
      throw failure(retry, `PUT ${path}`);
    }
    throw failure(move, `MOVE ${path}`);
  }

  private request(
    method: string,
    url: string,
    options: { body?: string; depth?: string; headers?: Record<string, string> } = {},
  ): Promise<WebDavResponse> {
    return invoke<WebDavResponse>("webdav_request", {
      method,
      url,
      username: this.config.username || null,
      password: this.config.password || null,
      body: options.body ?? null,
      depth: options.depth ?? null,
      headers: options.headers ?? null,
    });
  }
}

function failure(response: WebDavResponse, action: string): WebDavError {
  const detail = response.body.trim().slice(0, 300);
  return new WebDavError(
    response.status,
    `${action} failed: ${response.status}${detail ? ` — ${detail}` : ""}`,
  );
}
