import { readFileSync } from "fs";
import { basename, extname } from "path";
import type { Attachment } from "./types";

// Minimal extension → MIME map (the SDK is dependency-free). Unknown → octet-stream.
const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".json": "application/json",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ics": "text/calendar",
};

/**
 * Build an {@link Attachment} from a file on disk: reads it, base64-encodes it,
 * and guesses the content type from the filename. Pass the result to
 * `emails.send({ attachments: [...] })`.
 *
 * Set `contentId` to embed the file inline — reference it in your HTML with
 * `<img src="cid:the-id">`. To attach a remote file instead, pass an object with
 * a `path` (URL) and `filename` directly.
 */
export function attachment(
  path: string,
  options: { filename?: string; contentType?: string; contentId?: string } = {}
): Attachment {
  const buf = readFileSync(path);
  const name = options.filename ?? basename(path);
  return {
    filename: name,
    content: buf.toString("base64"),
    contentType: options.contentType ?? MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
    ...(options.contentId ? { contentId: options.contentId } : {}),
  };
}
