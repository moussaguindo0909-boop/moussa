const jwt = require("jsonwebtoken");
const { env } = require("../config/env");

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    env.jwtSecret,
    { expiresIn: "7d" },
  );
}

module.exports = { signToken };
