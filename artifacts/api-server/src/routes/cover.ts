import { Router, type IRouter } from "express";
import multer from "multer";
import { eq } from "drizzle-orm";
import { db, booksTable } from "@workspace/db";

const router: IRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function parseBookId(param: unknown): number | null {
  const id = parseInt(String(param), 10);
  return isNaN(id) || id <= 0 ? null : id;
}

// POST /books/:id/cover — upload a cover image (stored as base64 in DB)
router.post(
  "/books/:id/cover",
  upload.single("cover"),
  async (req, res): Promise<void> => {
    const id = parseBookId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid book ID" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    if (!ALLOWED_TYPES.includes(req.file.mimetype)) {
      res.status(400).json({ error: "Unsupported image type. Use JPEG, PNG, WebP or GIF." });
      return;
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const [book] = await db
      .update(booksTable)
      .set({ coverImage: base64 })
      .where(eq(booksTable.id, id))
      .returning({ id: booksTable.id });

    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    res.json({ coverImage: base64 });
  },
);

// DELETE /books/:id/cover — remove cover image
router.delete("/books/:id/cover", async (req, res): Promise<void> => {
  const id = parseBookId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }

  await db
    .update(booksTable)
    .set({ coverImage: null })
    .where(eq(booksTable.id, id));

  res.sendStatus(204);
});

export default router;
