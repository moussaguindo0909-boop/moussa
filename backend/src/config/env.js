const dotenv = require("dotenv");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || "change-me",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
  defaultRadiusKm: Number(process.env.DEFAULT_RADIUS_KM || 3),
};

module.exports = { env };
