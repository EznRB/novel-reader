import { Router, type IRouter } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import { db, booksTable, chaptersTable, readingProgressTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

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

function parseChapters(content: string): { chapterNumber: number; title: string | null; content: string }[] {
  const chapterPattern = /(?:^|\n)(Chapter\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*|Cap[íi]tulo\s+\d+[^\n]*|\d+\.\s+[^\n]{0,80})/gi;
  const matches = [...content.matchAll(chapterPattern)];

  if (matches.length < 2) {
    const words = content.split(/\s+/);
    const CHUNK = 2000;
    const chapters: { chapterNumber: number; title: string | null; content: string }[] = [];
    for (let i = 0; i < words.length; i += CHUNK) {
      chapters.push({ chapterNumber: chapters.length + 1, title: null, content: words.slice(i, i + CHUNK).join(" ") });
    }
    return chapters.length ? chapters : [{ chapterNumber: 1, title: null, content }];
  }

  const chapters: { chapterNumber: number; title: string | null; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? content.length : content.length;
    const chapterContent = content.slice(start, end).trim();
    if (chapterContent.length > 10) {
      chapters.push({ chapterNumber: chapters.length + 1, title: matches[i][1].trim() || null, content: chapterContent });
    }
  }
  return chapters.length ? chapters : [{ chapterNumber: 1, title: null, content }];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// POST /books/epub-meta — lightweight: returns just title + author from EPUB, no DB writes
router.post("/books/epub-meta", upload.single("epub"), (req, res): void => {
  try {
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const zip = new AdmZip(req.file.buffer);
    let opfContent = "";

    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.entryName.endsWith(".opf")) {
        opfContent = entry.getData().toString("utf8");
        break;
      }
    }

    if (!opfContent) {
      // Try via container.xml
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith("container.xml")) {
          const containerXml = entry.getData().toString("utf8");
          const rootfileMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
          if (rootfileMatch) {
            const opfEntry = zip.getEntry(rootfileMatch[1]);
            if (opfEntry) opfContent = opfEntry.getData().toString("utf8");
          }
          break;
        }
      }
    }

    const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

    res.json({
      title: titleMatch?.[1]?.trim() ?? "",
      author: authorMatch?.[1]?.trim() ?? "",
    });
  } catch (err) {
    logger.error({ err }, "EPUB meta read failed");
    res.status(500).json({ error: "Failed to read EPUB metadata" });
  }
});

// POST /books/import-epub
// Multipart fields: epub (file), title? (text), author? (text), tags? (text, comma-separated)
router.post("/books/import-epub", upload.single("epub"), async (req, res): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const zip = new AdmZip(req.file.buffer);
    const entries: Record<string, string> = {};

    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory) {
        const name = entry.entryName.toLowerCase();
        if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".xhtml") || name.endsWith(".opf") || name.endsWith(".ncx") || name.includes("container.xml")) {
          try {
            entries[entry.entryName] = entry.getData().toString("utf8");
          } catch {
            // skip unreadable entries
          }
        }
      }
    }

    // Find OPF via container.xml first
    const containerKey = Object.keys(entries).find((k) => k.toLowerCase().endsWith("container.xml"));
    let opfPath: string | undefined;
    if (containerKey) {
      const rootfileMatch = entries[containerKey].match(/full-path="([^"]+\.opf)"/i);
      if (rootfileMatch) opfPath = rootfileMatch[1];
    }
    if (!opfPath) opfPath = Object.keys(entries).find((k) => k.endsWith(".opf"));

    if (!opfPath || !entries[opfPath]) {
      res.status(422).json({ error: "Could not find OPF file in EPUB" });
      return;
    }

    const { title: epubTitle, author: epubAuthor, spineIds } = parseOpf(entries[opfPath]);

    // Resolve spine hrefs relative to OPF dir
    const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";
    const textChunks: string[] = [];

    for (const href of spineIds) {
      // Strip fragment identifiers
      const cleanHref = href.split("#")[0];
      const resolvedHref = cleanHref.startsWith("/") ? cleanHref.slice(1) : opfDir + cleanHref;
      const entryKey =
        Object.keys(entries).find((k) => k === resolvedHref) ??
        Object.keys(entries).find((k) => k.toLowerCase() === resolvedHref.toLowerCase());

      if (entryKey && entries[entryKey]) {
        const text = stripHtml(entries[entryKey]);
        if (text.trim().length > 20) textChunks.push(text);
      }
    }

    // Fallback: all HTML files sorted by name
    if (textChunks.length === 0) {
      const htmlKeys = Object.keys(entries)
        .filter((k) => k.endsWith(".html") || k.endsWith(".htm") || k.endsWith(".xhtml"))
        .sort();
      for (const key of htmlKeys) {
        const text = stripHtml(entries[key]);
        if (text.trim().length > 20) textChunks.push(text);
      }
    }

    const rawContent = textChunks.join("\n\n");

    if (!rawContent.trim()) {
      res.status(422).json({ error: "Could not extract text from EPUB" });
      return;
    }

    // Use caller-supplied title/author if provided (from form fields)
    const titleOverride = (req.body as Record<string, string>)?.title?.trim();
    const authorOverride = (req.body as Record<string, string>)?.author?.trim();
    const tagsRaw = (req.body as Record<string, string>)?.tags?.trim();

    const finalTitle = titleOverride || epubTitle;
    const finalAuthor = authorOverride || epubAuthor || null;
    const finalTags: string[] = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

    // Parse into chapters and create book directly in DB
    const chapters = parseChapters(rawContent);
    const totalWords = chapters.reduce((sum, c) => sum + countWords(c.content), 0);

    const [book] = await db
      .insert(booksTable)
      .values({
        title: finalTitle,
        author: finalAuthor,
        description: null,
        totalChapters: chapters.length,
        totalWords,
        tags: finalTags,
        isFavorite: false,
      })
      .returning();

    // Insert chapters in batches to avoid hitting query size limits
    const BATCH = 50;
    const chapterRows = chapters.map((c) => ({
      bookId: book.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      content: c.content,
      wordCount: countWords(c.content),
    }));
    for (let i = 0; i < chapterRows.length; i += BATCH) {
      await db.insert(chaptersTable).values(chapterRows.slice(i, i + BATCH));
    }

    // Initialize reading progress
    await db.insert(readingProgressTable).values({
      bookId: book.id,
      currentChapter: 1,
      characterPosition: 0,
      lastReadAt: new Date(),
    });

    logger.info({ bookId: book.id, chapters: chapters.length, words: totalWords }, "EPUB imported");

    res.status(201).json({
      bookId: book.id,
      title: finalTitle,
      author: finalAuthor,
      chapterCount: chapters.length,
      wordCount: totalWords,
    });
  } catch (err) {
    logger.error({ err }, "EPUB import failed");
    res.status(500).json({ error: "Failed to parse or import EPUB file" });
  }
});

export default router;
