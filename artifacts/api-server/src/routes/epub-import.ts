import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseOpf(opfXml: string): { title: string; author: string; spineIds: string[] } {
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

  const title = titleMatch?.[1]?.trim() ?? "Unknown Title";
  const author = authorMatch?.[1]?.trim() ?? "";

  // Parse manifest: id -> href
  const manifest: Record<string, string> = {};
  const manifestSection = opfXml.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] ?? "";
  const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(manifestSection)) !== null) {
    manifest[itemMatch[1]] = itemMatch[2];
  }

  // Parse spine: ordered idrefs
  const spineIds: string[] = [];
  const spineSection = opfXml.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? "";
  const itemrefRegex = /<itemref\s+[^>]*idref="([^"]+)"/gi;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = itemrefRegex.exec(spineSection)) !== null) {
    const href = manifest[refMatch[1]];
    if (href) spineIds.push(href);
  }

  return { title, author, spineIds };
}

// POST /books/import-epub
router.post("/books/import-epub", upload.single("epub"), (req, res): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const zip = new AdmZip(req.file.buffer);
    const entries: Record<string, string> = {};

    // Build a map of all entries (normalised path -> content)
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".xhtml") || name.endsWith(".opf") || name.endsWith(".ncx")) {
          entries[entry.entryName] = entry.getData().toString("utf8");
        }
      }
    }

    // Find OPF file
    const containerXml = Object.entries(entries).find(([k]) => k.toLowerCase().includes("container.xml"));
    let opfPath: string | undefined;
    if (containerXml) {
      const rootfileMatch = containerXml[1].match(/full-path="([^"]+\.opf)"/i);
      if (rootfileMatch) opfPath = rootfileMatch[1];
    }
    if (!opfPath) {
      opfPath = Object.keys(entries).find((k) => k.endsWith(".opf"));
    }

    if (!opfPath || !entries[opfPath]) {
      res.status(422).json({ error: "Could not find OPF file in EPUB" });
      return;
    }

    const { title, author, spineIds } = parseOpf(entries[opfPath]);

    // Resolve spine hrefs relative to OPF dir
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
    const textChunks: string[] = [];

    for (const href of spineIds) {
      // Resolve path
      const resolvedHref = href.startsWith("/") ? href.slice(1) : opfDir + href;
      // Try exact match first, then case-insensitive
      const entryKey =
        Object.keys(entries).find((k) => k === resolvedHref) ??
        Object.keys(entries).find((k) => k.toLowerCase() === resolvedHref.toLowerCase());

      if (entryKey && entries[entryKey]) {
        const text = stripHtml(entries[entryKey]);
        if (text.trim().length > 0) {
          textChunks.push(text);
        }
      }
    }

    // If spine parsing failed, fall back to all HTML files
    if (textChunks.length === 0) {
      for (const [key, content] of Object.entries(entries)) {
        if (key.endsWith(".html") || key.endsWith(".htm") || key.endsWith(".xhtml")) {
          const text = stripHtml(content);
          if (text.trim().length > 0) textChunks.push(text);
        }
      }
    }

    const content = textChunks.join("\n\n");

    if (!content.trim()) {
      res.status(422).json({ error: "Could not extract text from EPUB" });
      return;
    }

    res.json({ title, author, content });
  } catch (err) {
    logger.error({ err }, "EPUB import failed");
    res.status(500).json({ error: "Failed to parse EPUB file" });
  }
});

export default router;
