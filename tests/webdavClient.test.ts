import { describe, expect, it } from "vitest";
import {
  normalizeRemotePath,
  parsePropfind,
  relativeHref,
  remoteFileUrl,
  remoteRootUrl,
} from "../src/sync/webdav/client";

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
