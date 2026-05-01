function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        message: "Donnees invalides.",
        errors: result.error.issues,
      });
    }
    req.validatedBody = result.data;
    return next();
  };
}

module.exports = { validate };
