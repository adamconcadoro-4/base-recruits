import { describe, expect, it } from "vitest";

import {
  VIDEO_PICKER_ACCEPT,
  videoMimeTypeFor,
} from "@/lib/assessment/catalog/context";

describe("video picker", () => {
  it("offers the phone photo library, not the camera only", () => {
    expect(VIDEO_PICKER_ACCEPT.split(",")).toContain("video/*");
  });

  it("accepts an iPhone clip from Photos", () => {
    expect(
      videoMimeTypeFor({ name: "IMG_9169.MOV", type: "video/quicktime" }),
    ).toBe("video/quicktime");
  });

  it("uses the file extension when the browser reports no type or an unfamiliar one", () => {
    expect(videoMimeTypeFor({ name: "IMG_9169.MOV", type: "" })).toBe(
      "video/quicktime",
    );
    expect(
      videoMimeTypeFor({ name: "swing.mp4", type: "application/octet-stream" }),
    ).toBe("video/mp4");
    expect(videoMimeTypeFor({ name: "clip.m4v", type: "video/x-m4v" })).toBe(
      "video/mp4",
    );
    expect(videoMimeTypeFor({ name: "clip.webm", type: "" })).toBe(
      "video/webm",
    );
  });

  it("still refuses what the Film Room cannot store", () => {
    expect(
      videoMimeTypeFor({ name: "swing.avi", type: "video/x-msvideo" }),
    ).toBeNull();
    expect(
      videoMimeTypeFor({ name: "photo.heic", type: "image/heic" }),
    ).toBeNull();
    expect(
      videoMimeTypeFor({ name: "notes.mov", type: "text/plain" }),
    ).toBeNull();
    expect(videoMimeTypeFor({ name: "clip", type: "" })).toBeNull();
  });
});
