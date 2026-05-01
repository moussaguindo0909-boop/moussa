const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

router.get("/:id/stats", async (req, res, next) => {
  try {
    const commerce = await prisma.commerce.findUnique({
      where: { id: req.params.id },
      include: {
        listings: true,
      },
    });
    if (!commerce) {
      return res.status(404).json({ message: "Commerce introuvable." });
    }

    const impact = await prisma.impactLog.aggregate({
      where: { commerceId: commerce.id },
      _sum: { kgSaved: true, meals: true, co2Avoided: true },
      _count: true,
    });

    return res.json({
      commerceId: commerce.id,
      commerceName: commerce.name,
      score: commerce.score,
      totalListings: commerce.listings.length,
      kgSaved: impact._sum.kgSaved || 0,
      meals: impact._sum.meals || 0,
      co2Avoided: impact._sum.co2Avoided || 0,
      impactLogs: impact._count,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/ranking/global", async (_req, res, next) => {
  try {
    const commerces = await prisma.commerce.findMany({
      select: {
        id: true,
        name: true,
        score: true,
      },
      orderBy: [{ score: "desc" }, { name: "asc" }],
      take: 10,
    });
    return res.json(commerces);
  } catch (error) {
    return next(error);
  }
});

module.exports = { commerceRouter: router };
