import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort) || 5000;

app.listen(port, () => {
  logger.info({ port }, "Server listening");
});
