import { Hono } from "hono";
import type { WorkerEnv } from "./lib/env";
import { getHanoiNow } from "../lib/time";
import { authRoutes } from "./routes/auth";
import { depositsRoutes } from "./routes/deposits";
import { adminRoutes } from "./routes/admin";
import { botRoutes } from "./routes/bot";
import { telegramRoutes } from "./routes/telegram";

const app = new Hono<{ Bindings: WorkerEnv }>();

app.onError((err, c) => {
  console.error("[worker-error]", err);
  return c.json({ message: "Lỗi máy chủ nội bộ." }, 500);
});

app.get("/api/time", (c) => {
  return c.json(getHanoiNow());
});

app.route("/api/auth", authRoutes);
app.route("/api/deposits", depositsRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/bot", botRoutes);
app.route("/api/telegram", telegramRoutes);

app.all("/api/*", (c) => c.json({ message: "API endpoint not found" }, 404));

app.all("*", async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("Not Found", 404);
});

export default app;
