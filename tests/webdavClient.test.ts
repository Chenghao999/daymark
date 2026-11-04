import { describe, expect, it } from "vitest";
import {
  WebDavClient,
  WebDavError,
  normalizeRemotePath,
  parsePropfind,
  relativeHref,
  remoteFileUrl,
  remoteRootUrl,
  strongEtag,
} from "../src/sync/webdav/client";
import type {
  WebDavConfig,
  WebDavHttpResponse,
  WebDavRequest,
} from "../src/sync/webdav/types";

const CONFIG: WebDavConfig = {
  url: "https://dav.example.com/dav",
  remotePath: "daymark/",
  username: "user",
  password: "secret",
  autoSyncMinutes: 0,
};

function recorder(statuses: number[] = []) {
  const calls: WebDavRequest[] = [];
  return {
    calls,
    transport: async (request: WebDavRequest): Promise<WebDavHttpResponse> => {
      calls.push(request);
      return {
        status: statuses[calls.length - 1] ?? 200,
        body: "",
        etag: null,
        lastModified: null,
      };
    },
  };
}

describe("WebDAV URLs", () => {
  it("normalizes the remote folder to a leading and trailing slash", () => {
    expect(normalizeRemotePath("daymark")).toBe("/daymark/");
    expect(normalizeRemotePath("/daymark")).toBe("/daymark/");
    expect(normalizeRemotePath("/")).toBe("/");
    expect(normalizeRemotePath("")).toBe("/");
  });

  it("builds the root URL without a double slash", () => {
    expect(remoteRootUrl({ url: "https://dav.example.com/dav/", remotePath: "notes" })).toBe(
      "https://dav.example.com/dav/notes/",
    );
  });

  it("encodes spaces, # and % in file paths", () => {
    expect(
      remoteFileUrl(
        { url: "https://dav.example.com/dav", remotePath: "/my notes/" },
        "2026-10/a #1 100%.md",
      ),
    ).toBe("https://dav.example.com/dav/my%20notes/2026-10/a%20%231%20100%25.md");
  });

  it("adds a trailing slash for collections", () => {
    expect(
      remoteFileUrl({ url: "https://dav.example.com/dav", remotePath: "/daymark/" }, "2026-10", true),
    ).toBe("https://dav.example.com/dav/daymark/2026-10/");
  });

  it("resolves href values against the remote root", () => {
    const root = "https://dav.example.com/dav/daymark/";
    expect(relativeHref("/dav/daymark/2026-10/a%20b.md", root)).toBe("2026-10/a b.md");
    expect(relativeHref("https://dav.example.com/dav/daymark/2026-10/a.md", root)).toBe(
      "2026-10/a.md",
    );
    expect(relativeHref("/dav/daymark/2026-10/", root)).toBe("2026-10");
    expect(relativeHref("/dav/daymark/", root)).toBeNull();
    expect(relativeHref("/other/a.md", root)).toBeNull();
  });
});

describe("PROPFIND parsing", () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/daymark/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/daymark/2026-10/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/daymark/_backlog.md</d:href>
    <d:propstat><d:prop>
      <d:resourcetype/>
      <d:getcontentlength>42</d:getcontentlength>
      <d:getlastmodified>Thu, 22 Oct 2026 08:00:00 GMT</d:getlastmodified>
      <d:getetag>"abc"</d:getetag>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;

  it("reads hrefs, directories, sizes, mtimes and etags", () => {
    const entries = parsePropfind(xml);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ href: "/dav/daymark/", isDirectory: true });
    expect(entries[1]).toMatchObject({ href: "/dav/daymark/2026-10/", isDirectory: true });
    expect(entries[2]).toMatchObject({
      href: "/dav/daymark/_backlog.md",
      isDirectory: false,
      size: 42,
      etag: '"abc"',
      lastModified: "Thu, 22 Oct 2026 08:00:00 GMT",
    });
  });

  it("works without namespace prefixes", () => {
    const plain = `<multistatus><response><href>/a.md</href><prop><resourcetype/>
      <getcontentlength>7</getcontentlength></prop></response></multistatus>`;
    expect(parsePropfind(plain)).toEqual([
      {
        href: "/a.md",
        isDirectory: false,
        size: 7,
        etag: null,
        lastModified: null,
      },
    ]);
  });

  it("decodes XML entities in hrefs", () => {
    const escaped = "<response><href>/a&amp;b.md</href><prop><resourcetype/></prop></response>";
    expect(parsePropfind(escaped)[0].href).toBe("/a&b.md");
  });
});

describe("WebDAV conditional writes", () => {
  const FILE_URL = "https://dav.example.com/dav/daymark/2026-10/a%20b.md";

  it("sends If-Match straight to the target instead of MOVE", async () => {
    const { calls, transport } = recorder([204]);
    const client = new WebDavClient(CONFIG, transport);

    await client.putText("2026-10/a b.md", "text", { ifMatch: '"abc"' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "PUT",
      url: FILE_URL,
      body: "text",
      headers: { "If-Match": '"abc"', "Content-Type": "text/markdown; charset=utf-8" },
    });
  });

  it("sends If-None-Match when creating a file", async () => {
    const { calls, transport } = recorder([201]);
    const client = new WebDavClient(CONFIG, transport);

    await client.putText("2026-10/a b.md", "text", { ifNoneMatch: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "PUT",
      url: FILE_URL,
      headers: { "If-None-Match": "*" },
    });
  });

  it("reports a 412 as a changed remote, not a generic HTTP error", async () => {
    const { transport } = recorder([412]);
    const client = new WebDavClient(CONFIG, transport);

    const failure = client.putText("2026-10/a b.md", "text", { ifMatch: '"old"' });

    await expect(failure).rejects.toBeInstanceOf(WebDavError);
    await expect(failure).rejects.toMatchObject({ status: 412 });
    await expect(failure).rejects.toThrow(/changed after it was read/);
  });

  it("keeps the temporary-file upload when there is no precondition", async () => {
    const { calls, transport } = recorder([201, 201]);
    const client = new WebDavClient(CONFIG, transport);

    await client.putText("2026-10/a b.md", "text");

    expect(calls.map((call) => call.method)).toEqual(["PUT", "MOVE"]);
    expect(calls[0].url).toBe(`${FILE_URL}.daymark-tmp`);
    expect(calls[1]).toMatchObject({ headers: { Destination: FILE_URL, Overwrite: "T" } });
  });

  it("reads a file's ETag with PROPFIND depth 0", async () => {
    const calls: WebDavRequest[] = [];
    const client = new WebDavClient(CONFIG, async (request) => {
      calls.push(request);
      return {
        status: 207,
        body: '<multistatus><response><href>/dav/daymark/a.md</href><prop><getetag>"abc"</getetag></prop></response></multistatus>',
        etag: null,
        lastModified: null,
      };
    });

    await expect(client.etag("a.md")).resolves.toBe('"abc"');
    expect(calls[0]).toMatchObject({ method: "PROPFIND", depth: "0" });
  });
});

describe("strong ETags", () => {
  it("keeps strong validators and rejects weak or empty ones", () => {
    expect(strongEtag('"abc"')).toBe('"abc"');
    expect(strongEtag('  "abc"  ')).toBe('"abc"');
    expect(strongEtag('W/"abc"')).toBeNull();
    expect(strongEtag('w/"abc"')).toBeNull();
    expect(strongEtag("")).toBeNull();
    expect(strongEtag(null)).toBeNull();
  });
});

describe("WebDAV reads", () => {
  it("returns the GET body with the ETag that belonged to it", async () => {
    const client = new WebDavClient(CONFIG, async () => ({
      status: 200,
      body: "# note",
      etag: '"v1"',
      lastModified: null,
    }));

    await expect(client.getTextWithEtag("a.md")).resolves.toEqual({
      text: "# note",
      etag: '"v1"',
    });
  });
});
