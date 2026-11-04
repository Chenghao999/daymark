import { describe, expect, it } from "vitest";
import { detectSyncFolder } from "../src/storage/syncFolder";

describe("sync-folder detection", () => {
  it("recognises iCloud Drive on macOS", () => {
    expect(
      detectSyncFolder(
        "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Daymark",
      ),
    ).toEqual({ id: "icloud", name: "iCloud Drive" });
  });

  it("recognises OneDrive, including business and CloudStorage folders", () => {
    expect(detectSyncFolder("C:\\Users\\me\\OneDrive\\Daymark")).toEqual({
      id: "onedrive",
      name: "OneDrive",
    });
    expect(detectSyncFolder("/Users/me/OneDrive - Contoso/Daymark")?.id).toBe("onedrive");
    expect(
      detectSyncFolder("/Users/me/Library/CloudStorage/OneDrive-Personal/Daymark")?.id,
    ).toBe("onedrive");
  });

  it("recognises Google Drive names on Windows and macOS", () => {
    // "My Drive" alone is ambiguous, so it is not a hint.
    expect(detectSyncFolder("G:\\My Drive\\Daymark")).toBeNull();
    expect(detectSyncFolder("G:\\Google Drive\\My Drive\\Daymark")?.id).toBe("googleDrive");
    expect(
      detectSyncFolder("/Users/me/Library/CloudStorage/GoogleDrive-me@gmail.com/My Drive/Daymark")
        ?.id,
    ).toBe("googleDrive");
  });

  it("recognises Dropbox, Nutstore and Syncthing folders", () => {
    expect(detectSyncFolder("/Users/me/Dropbox/Daymark")?.id).toBe("dropbox");
    expect(detectSyncFolder("/Users/me/Dropbox (Acme)/Daymark")?.id).toBe("dropbox");
    expect(detectSyncFolder("/Users/me/Nutstore/Daymark")?.id).toBe("nutstore");
    expect(detectSyncFolder("/Users/me/坚果云/Daymark")?.id).toBe("nutstore");
    expect(detectSyncFolder("/Users/me/Syncthing/Daymark")?.id).toBe("syncthing");
  });

  it("is case-insensitive and accepts either separator", () => {
    expect(detectSyncFolder("C:\\Users\\me\\oNeDrIvE\\Daymark")?.id).toBe("onedrive");
    expect(detectSyncFolder("/users/me/dROPBOX/daymark")?.id).toBe("dropbox");
  });

  it("does not match unrelated names that merely start with a provider", () => {
    expect(detectSyncFolder("/Users/me/OneDriveStuff/Daymark")).toBeNull();
    expect(detectSyncFolder("/Users/me/DropboxArchive/Daymark")).toBeNull();
    expect(detectSyncFolder("/Users/me/GoogleDriveNotes/Daymark")).toBeNull();
  });

  it("returns null for plain folders and empty input", () => {
    expect(detectSyncFolder("/Users/me/Documents/Daymark")).toBeNull();
    expect(detectSyncFolder("")).toBeNull();
    expect(detectSyncFolder("   ")).toBeNull();
  });
});
