import { invoke } from "@tauri-apps/api/core";
import type {
  CalDavCalendar,
  CalDavConfig,
  CalDavHttpResponse,
  CalDavRequest,
  CalDavTransport,
} from "./types";

/**
 * CalDAV discovery and read-only event listing.
 *
 * PROPFIND and REPORT are not available from a WebView, so every request goes
 * through the Rust `webdav_request` command (it already carries Basic auth,
 * a custom method, `Depth` and a body). The XML is parsed here instead of with
 * `DOMParser`, which keeps the client unit-testable in Node.
 */

const DISCOVERY_BODY = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">',
  "<d:prop>",
  "<d:current-user-principal/>",
  "<d:resourcetype/>",
  "<d:displayname/>",
  "<c:calendar-home-set/>",
  "<c:supported-calendar-component-set/>",
  "<cs:getctag/>",
  "</d:prop>",
  "</d:propfind>",
].join("");

const CTAG_BODY = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">',
  "<d:prop><cs:getctag/></d:prop>",
  "</d:propfind>",
].join("");

const CALENDAR_QUERY = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">',
  "<d:prop><d:getetag/><c:calendar-data/></d:prop>",
  '<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter>',
  "</c:calendar-query>",
].join("");

export const TAURI_CALDAV_TRANSPORT: CalDavTransport = async (request) => {
  const response = await invoke<CalDavHttpResponse>("webdav_request", {
    method: request.method,
    url: request.url,
    username: request.username ?? null,
    password: request.password ?? null,
    body: request.body ?? null,
    depth: request.depth ?? null,
    headers: request.headers ?? null,
  });
  return { status: response.status, body: response.body };
};

export class CalDavError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CalDavError";
  }
}

export interface MultiStatusEntry {
  href: string;
  isCalendar: boolean;
  displayName: string | null;
  ctag: string | null;
  components: string[];
  calendarData: string | null;
  etag: string | null;
  principalHref: string | null;
  homeHref: string | null;
}

export interface CalendarObject {
  href: string;
  etag: string | null;
  data: string;
}

/** Adds `https://` when the user typed a bare host and a trailing `/`. */
export function normalizeServerUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.endsWith("/") ? withScheme : `${withScheme}/`;
}

export function resolveHref(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/**
 * Namespace-agnostic multistatus parser. Servers use `D:`, `d:`, `DAV:` or no
 * prefix, so every tag regex treats the prefix as optional.
 */
export function parseMultiStatus(xml: string): MultiStatusEntry[] {
  const entries: MultiStatusEntry[] = [];
  const responseRe =
    /<(?:[A-Za-z0-9._-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9._-]+:)?response>/gi;
  let match: RegExpExecArray | null;

  while ((match = responseRe.exec(xml)) !== null) {
    const block = match[1];
    // The response-level href comes before the first propstat; later hrefs
    // belong to current-user-principal and calendar-home-set.
    const head = block.split(/<(?:[A-Za-z0-9._-]+:)?propstat\b/i)[0];
    const href = tagText(head, "href");
    if (href === null) continue;

    const resource = tagBlock(block, "resourcetype");
    const supported = tagBlock(block, "supported-calendar-component-set");
    entries.push({
      href: decodeXml(href),
      isCalendar: resource !== null && /<(?:[A-Za-z0-9._-]+:)?calendar\b/i.test(resource),
      displayName: decodeXmlOrNull(tagText(block, "displayname")),
      ctag: decodeXmlOrNull(tagText(block, "getctag")),
      components: supported ? componentNames(supported) : [],
      calendarData: decodeXmlOrNull(tagText(block, "calendar-data")),
      etag: decodeXmlOrNull(tagText(block, "getetag")),
      principalHref: nestedHref(block, "current-user-principal"),
      homeHref: nestedHref(block, "calendar-home-set"),
    });
  }
  return entries;
}

function componentNames(block: string): string[] {
  const names: string[] = [];
  const re = /<(?:[A-Za-z0-9._-]+:)?comp\b[^>]*\bname="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) names.push(match[1].toUpperCase());
  return names;
}

function nestedHref(block: string, container: string): string | null {
  const inner = tagBlock(block, container);
  return inner ? decodeXmlOrNull(tagText(inner, "href")) : null;
}

function tagBlock(block: string, tag: string): string | null {
  const re = new RegExp(
    `<(?:[A-Za-z0-9._-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9._-]+:)?${tag}>`,
    "i",
  );
  const match = re.exec(block);
  return match ? match[1] : null;
}

function tagText(block: string, tag: string): string | null {
  const inner = tagBlock(block, tag);
  return inner === null ? null : inner.trim();
}

function decodeXmlOrNull(value: string | null): string | null {
  return value === null ? null : decodeXml(value);
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => codePoint(Number(decimal)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function codePoint(value: number): string {
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

export class CalDavClient {
  constructor(
    private readonly config: Pick<CalDavConfig, "serverUrl" | "username" | "password">,
    private readonly transport: CalDavTransport = TAURI_CALDAV_TRANSPORT,
  ) {}

  /**
   * Finds the user's calendars:
   * server → `current-user-principal` → `calendar-home-set` → collections.
   * When a server exposes calendars at the URL itself, that listing is used.
   */
  async discover(): Promise<CalDavCalendar[]> {
    const base = normalizeServerUrl(this.config.serverUrl);
    if (!base) throw new CalDavError(0, "Enter a CalDAV server URL first.");

    let root = await this.propfind(base, "0");
    if (root === null) {
      // Some services publish only the well-known URL.
      root = await this.propfind(resolveHref(base, "/.well-known/caldav"), "0");
    }
    if (root === null) {
      throw new CalDavError(0, "The server did not answer a CalDAV PROPFIND.");
    }

    let home = firstHref(root, "homeHref");
    if (!home) {
      const principal = firstHref(root, "principalHref");
      if (principal) {
        const principalUrl = resolveHref(base, principal);
        const entries = await this.propfind(principalUrl, "0");
        home = entries ? firstHref(entries, "homeHref") : null;
      }
    }

    const homeUrl = home ? resolveHref(base, home) : base;
    let listing = await this.propfind(homeUrl, "1");
    if (listing === null || listing.length === 0) {
      listing = await this.propfind(base, "1");
    }

    const calendars = (listing ?? [])
      .filter((entry) => entry.isCalendar)
      .filter((entry) => !isSystemCollection(entry.href))
      .map((entry) => ({
        href: resolveHref(homeUrl, entry.href),
        name: entry.displayName?.trim() || lastSegment(entry.href),
      }));

    const seen = new Set<string>();
    return calendars.filter((calendar) => {
      if (seen.has(calendar.href)) return false;
      seen.add(calendar.href);
      return true;
    });
  }

  /** `getctag`, or null when the server does not expose it. */
  async ctag(href: string): Promise<string | null> {
    const response = await this.send("PROPFIND", href, "0", CTAG_BODY);
    assertAuthorized(response, `PROPFIND ${href}`);
    if (response.status !== 207 && response.status !== 200) return null;
    return parseMultiStatus(response.body)[0]?.ctag ?? null;
  }

  /** Every VEVENT object in the calendar, with the server's iCalendar text. */
  async events(href: string): Promise<CalendarObject[]> {
    const response = await this.send("REPORT", href, "1", CALENDAR_QUERY);
    assertAuthorized(response, `REPORT ${href}`);
    if (response.status !== 207 && response.status !== 200) {
      throw new CalDavError(
        response.status,
        `REPORT failed: ${response.status} — ${response.body.trim().slice(0, 300)}`,
      );
    }
    return parseMultiStatus(response.body)
      .filter((entry) => entry.calendarData !== null)
      .map((entry) => ({
        href: entry.href,
        etag: entry.etag,
        data: entry.calendarData as string,
      }));
  }

  private async propfind(url: string, depth: string): Promise<MultiStatusEntry[] | null> {
    const response = await this.send("PROPFIND", url, depth, DISCOVERY_BODY);
    assertAuthorized(response, `PROPFIND ${url}`);
    if (response.status !== 207 && response.status !== 200) return null;
    return parseMultiStatus(response.body);
  }

  private send(
    method: string,
    url: string,
    depth: string | undefined,
    body: string | undefined,
  ): Promise<CalDavHttpResponse> {
    const request: CalDavRequest = {
      method,
      url,
      username: this.config.username || null,
      password: this.config.password || null,
      depth,
      body,
      headers: body ? { "Content-Type": "application/xml; charset=utf-8" } : undefined,
    };
    return this.transport(request);
  }
}

function assertAuthorized(response: CalDavHttpResponse, action: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new CalDavError(
      response.status,
      `${action} was refused (${response.status}). Check the username and app-specific password.`,
    );
  }
}

function firstHref(entries: MultiStatusEntry[], key: "homeHref" | "principalHref"): string | null {
  for (const entry of entries) {
    if (entry[key]) return entry[key];
  }
  return null;
}

function isSystemCollection(href: string): boolean {
  return /\/(inbox|outbox|notification|trash)\/?$/i.test(href);
}

function lastSegment(href: string): string {
  const path = href.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const segment = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(segment) || "Calendar";
  } catch {
    return segment || "Calendar";
  }
}
