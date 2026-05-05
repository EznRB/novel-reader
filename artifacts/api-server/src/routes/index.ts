import { Router, type IRouter } from "express";
import healthRouter from "./health";
import booksRouter from "./books";
import chaptersRouter from "./chapters";
import progressRouter from "./progress";
import charactersRouter from "./characters";
import aiRouter from "./ai";
import ttsRouter from "./tts";
import exportRouter from "./export";

const router: IRouter = Router();

router.use(healthRouter);
router.use(booksRouter);
router.use(chaptersRouter);
router.use(progressRouter);
router.use(charactersRouter);
router.use(aiRouter);
router.use(ttsRouter);
router.use(exportRouter);

export default router;
