const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { env } = require("./config/env");
const { authRouter } = require("./routes/auth.routes");
const { listingsRouter } = require("./routes/listings.routes");
const { reservationsRouter } = require("./routes/reservations.routes");
const { deliveriesRouter } = require("./routes/deliveries.routes");
const { impactRouter } = require("./routes/impact.routes");
const { commerceRouter } = require("./routes/commerce.routes");
const { notFound, errorHandler } = require("./middleware/error-handler");

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(morgan("dev"));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use((req, _res, next) => {
    req.io = req.app.get("io");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", app: "Food Rescue API" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/reservations", reservationsRouter);
  app.use("/api/deliveries", deliveriesRouter);
  app.use("/api/impact", impactRouter);
  app.use("/api/commerce", commerceRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
