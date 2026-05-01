const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.replace("Bearer ", "")
    : null;

  if (!token) {
    return res.status(401).json({ message: "Token manquant." });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Token invalide." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Acces refuse pour ce role." });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
