import { describe, expect, it } from "vitest";
import {
  CalDavClient,
  CalDavError,
  normalizeServerUrl,
  parseMultiStatus,
  resolveHref,
} from "../src/sync/caldav/client";
import type { CalDavRequest, CalDavTransport } from "../src/sync/caldav/types";

const ROOT = "https://cal.example.com/";

const PRINCIPAL_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/</d:href>
    <d:propstat>
      <d:prop>
        <d:current-user-principal><d:href>/principals/u/</d:href></d:current-user-principal>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

const HOME_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/principals/u/</d:href>
    <d:propstat>
      <d:prop>
        <c:calendar-home-set><d:href>/calendars/u/</d:href></c:calendar-home-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

const CALENDARS_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
  <d:response>
    <d:href>/calendars/u/work/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>Work &amp; Life</d:displayname>
        <cs:getctag>"ctag-1"</cs:getctag>
        <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/calendars/u/inbox/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
        <d:displayname>Inbox</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/calendars/u/notes/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:displayname>Notes</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

const REPORT_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:response>
    <d:href>/calendars/u/work/event.ics</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"etag-1"</d:getetag>
        <c:calendar-data>BEGIN:VCALENDAR&#13;
BEGIN:VEVENT&#13;
UID:event-1&#13;
SUMMARY:Meeting&#13;
END:VEVENT&#13;
END:VCALENDAR</c:calendar-data>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

function transportFor(
  routes: Array<{ match: (request: CalDavRequest) => boolean; status: number; body: string }>,
): { transport: CalDavTransport; requests: CalDavRequest[] } {
  const requests: CalDavRequest[] = [];
  const transport: CalDavTransport = async (request) => {
    requests.push(request);
    const route = routes.find((candidate) => candidate.match(request));
    if (!route) {
      return { status: 500, body: `unexpected ${request.method} ${request.url}` };
    }
    return { status: route.status, body: route.body };
  };
  return { transport, requests };
}

describe("CalDAV helpers", () => {
  it("normalizes server URLs", () => {
    expect(normalizeServerUrl(" cal.example.com ")).toBe("https://cal.example.com/");
    expect(normalizeServerUrl("https://cal.example.com/dav")).toBe(
      "https://cal.example.com/dav/",
    );
    expect(normalizeServerUrl("")).toBe("");
  });

  it("resolves relative hrefs", () => {
    expect(resolveHref(ROOT, "/calendars/u/")).toBe("https://cal.example.com/calendars/u/");
    expect(resolveHref(ROOT, "calendars/u/")).toBe("https://cal.example.com/calendars/u/");
    expect(resolveHref(ROOT, "https://other.example.com/c/")).toBe(
      "https://other.example.com/c/",
    );
  });

  it("parses a multistatus without namespace prefixes", () => {
    const [entry] = parseMultiStatus(
      `<multistatus><response><href>/c/</href><propstat><prop>
        <resourcetype><collection/><calendar/></resourcetype>
        <displayname>Personal</displayname>
        <getctag>42</getctag>
        <supported-calendar-component-set><comp name="VEvent"/></supported-calendar-component-set>
      </prop></propstat></response></multistatus>`,
    );
    expect(entry.href).toBe("/c/");
    expect(entry.isCalendar).toBe(true);
    expect(entry.displayName).toBe("Personal");
    expect(entry.ctag).toBe("42");
    expect(entry.components).toEqual(["VEVENT"]);
  });

  it("decodes calendar-data entities and CDATA", () => {
    const [entry] = parseMultiStatus(
      `<multistatus><response><href>/c/e.ics</href><propstat><prop>
        <calendar-data><![CDATA[BEGIN:VCALENDAR
BEGIN:VEVENT
END:VEVENT
END:VCALENDAR]]></calendar-data>
      </prop></propstat></response></multistatus>`,
    );
    expect(entry.calendarData).toContain("BEGIN:VEVENT");
  });
});

describe("CalDAV client", () => {
  it("discovers calendars through principal and home set", async () => {
    const { transport, requests } = transportFor([
      {
        match: (request) => request.url === ROOT && request.depth === "0",
        status: 207,
        body: PRINCIPAL_RESPONSE,
      },
      {
        match: (request) => request.url === `${ROOT}principals/u/`,
        status: 207,
        body: HOME_RESPONSE,
      },
      {
        match: (request) => request.url === `${ROOT}calendars/u/` && request.depth === "1",
        status: 207,
        body: CALENDARS_RESPONSE,
      },
    ]);
    const client = new CalDavClient(
      { serverUrl: "cal.example.com", username: "u", password: "p" },
      transport,
    );

    await expect(client.discover()).resolves.toEqual([
      { href: "https://cal.example.com/calendars/u/work/", name: "Work & Life" },
    ]);
    expect(requests.every((request) => request.username === "u")).toBe(true);
    expect(requests[0].body).toContain("current-user-principal");
  });

  it("reads a ctag and falls back to null when unsupported", async () => {
    const { transport } = transportFor([
      {
        match: (request) => request.url.endsWith("/work/") && request.method === "PROPFIND",
        status: 207,
        body: `<multistatus><response><href>/work/</href><propstat><prop><getctag>"7"</getctag></prop></propstat></response></multistatus>`,
      },
    ]);
    const client = new CalDavClient({ serverUrl: ROOT, username: "", password: "" }, transport);
    await expect(client.ctag(`${ROOT}work/`)).resolves.toBe('"7"');

    const { transport: unsupported } = transportFor([
      {
        match: () => true,
        status: 404,
        body: "not found",
      },
    ]);
    const fallback = new CalDavClient(
      { serverUrl: ROOT, username: "", password: "" },
      unsupported,
    );
    await expect(fallback.ctag(`${ROOT}work/`)).resolves.toBeNull();
  });

  it("reports events with their etag and iCalendar text", async () => {
    const { transport, requests } = transportFor([
      {
        match: (request) => request.method === "REPORT",
        status: 207,
        body: REPORT_RESPONSE,
      },
    ]);
    const client = new CalDavClient({ serverUrl: ROOT, username: "", password: "" }, transport);
    const events = await client.events(`${ROOT}calendars/u/work/`);
    expect(events).toHaveLength(1);
    expect(events[0].etag).toBe('"etag-1"');
    expect(events[0].data).toContain("BEGIN:VEVENT");
    expect(requests[0].headers?.["Content-Type"]).toContain("application/xml");
    expect(requests[0].depth).toBe("1");
  });

  it("raises a typed error for 401", async () => {
    const { transport } = transportFor([
      { match: () => true, status: 401, body: "unauthorized" },
    ]);
    const client = new CalDavClient({ serverUrl: ROOT, username: "u", password: "bad" }, transport);
    await expect(client.discover()).rejects.toMatchObject({
      name: "CalDavError",
      status: 401,
    });
    expect(new CalDavError(401, "x").status).toBe(401);
  });
});
