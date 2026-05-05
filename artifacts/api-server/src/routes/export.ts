import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, booksTable, chaptersTable } from "@workspace/db";
import PDFDocument from "pdfkit";
import epub from "epub-gen-memory";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// GET /api/books/:id/export/pdf
router.get("/books/:id/export/pdf", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, id));
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.bookId, id))
    .orderBy(asc(chaptersTable.chapterNumber));

  try {
    const doc = new PDFDocument({ margin: 72, size: "A4" });
    const safeTitle = book.title.replace(/[^a-z0-9]/gi, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.pdf"`);
    doc.pipe(res);

    // Cover page
    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .text(book.title, { align: "center" });
    if (book.author) {
      doc.moveDown(0.5).fontSize(16).font("Helvetica").text(`by ${book.author}`, { align: "center" });
    }
    doc.moveDown(2).fontSize(11).fillColor("#888").text(`${book.totalChapters} chapters · ${book.totalWords?.toLocaleString() ?? 0} words`, { align: "center" });
    doc.fillColor("black");

    // Chapters
    for (const ch of chapters) {
      doc.addPage();
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(ch.title ?? `Chapter ${ch.chapterNumber}`);
      doc.moveDown(1.2);
      doc
        .fontSize(12)
        .font("Helvetica")
        .text(ch.content, { align: "justify", lineGap: 4 });
    }

    doc.end();
  } catch (err) {
    logger.error({ err }, "PDF export failed");
    if (!res.headersSent) res.status(500).json({ error: "PDF export failed" });
  }
});

// GET /api/books/:id/export/epub
router.get("/books/:id/export/epub", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [book] = await db.select().from(booksTable).where(eq(booksTable.id, id));
  if (!book) { res.status(404).json({ error: "Book not found" }); return; }

  const chapters = await db
    .select()
    .from(chaptersTable)
    .where(eq(chaptersTable.bookId, id))
    .orderBy(asc(chaptersTable.chapterNumber));

  try {
    const content = chapters.map((ch) => ({
      title: ch.title ?? `Chapter ${ch.chapterNumber}`,
      content: ch.content
        .split("\n")
        .filter(Boolean)
        .map((p) => `<p>${p.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
        .join(""),
    }));

    const buffer = await epub(
      {
        title: book.title,
        author: book.author ?? "Unknown Author",
        description: book.description ?? undefined,
        publisher: "NoveLit",
        lang: "en",
        tocTitle: "Table of Contents",
        prependChapterTitles: true,
        css: `
          body { font-family: Georgia, serif; line-height: 1.8; margin: 1em 1.5em; }
          h2 { font-size: 1.4em; margin-bottom: 1em; }
          p { text-indent: 1.5em; margin: 0 0 0.5em; }
        `,
      },
      content
    );

    const safeTitle = book.title.replace(/[^a-z0-9]/gi, "_");
    res.setHeader("Content-Type", "application/epub+zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.epub"`);
    res.setHeader("Content-Length", buffer.length.toString());
    res.send(buffer);
  } catch (err) {
    logger.error({ err }, "EPUB export failed");
    if (!res.headersSent) res.status(500).json({ error: "EPUB export failed" });
  }
});

export default router;
