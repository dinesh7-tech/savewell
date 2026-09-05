import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router, { healthRouter } from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: Request) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: Response) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(healthRouter);
app.use("/api", router);

// Centralized safe error handler: prevents internal paths, stack traces, or credentials from leaking
app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  logger.error(err, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "An unexpected error occurred. Please try again later." });
});

export default app;

