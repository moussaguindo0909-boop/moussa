function notFound(_req, res) {
  res.status(404).json({ message: "Route introuvable." });
}

function errorHandler(error, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error(error);
  if (res.headersSent) {
    return;
  }
  res.status(error.status || 500).json({
    message: error.message || "Erreur interne du serveur.",
  });
}

module.exports = { notFound, errorHandler };
