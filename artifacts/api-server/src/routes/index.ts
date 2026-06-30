import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import booksRouter from "./books";
import chaptersRouter from "./chapters";
import progressRouter from "./progress";
import charactersRouter from "./characters";
import aiRouter from "./ai";
import ttsRouter from "./tts";
import exportRouter from "./export";
import epubImportRouter from "./epub-import";
import coverRouter from "./cover";
import knowledgeRouter from "./knowledge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(booksRouter);
router.use(chaptersRouter);
router.use(progressRouter);
router.use(charactersRouter);
router.use(aiRouter);
router.use(ttsRouter);
router.use(exportRouter);
router.use(epubImportRouter);
router.use(coverRouter);
router.use(knowledgeRouter);

export default router;
