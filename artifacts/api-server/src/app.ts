import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(authMiddleware);

app.use("/api", router);

// Serve compiled frontend in production (full-stack deployment).
// Set PUBLIC_DIR env var to the built frontend directory, or place the built
// frontend in a "public" folder next to the server entry point.
if (process.env.NODE_ENV === "production") {
  const publicPath = process.env.PUBLIC_DIR ?? path.resolve(process.cwd(), "public");
  app.use(express.static(publicPath, { maxAge: "7d", index: false }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(publicPath, "index.html"));
  });
}

export default app;
