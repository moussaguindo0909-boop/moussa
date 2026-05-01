const express = require("express");
const { prisma } = require("../lib/prisma");

const router = express.Router();

router.get("/global", async (_req, res, next) => {
  try {
    const impact = await prisma.impactLog.aggregate({
      _sum: {
        kgSaved: true,
        meals: true,
        co2Avoided: true,
      },
      _count: true,
    });

    const [donors, receivers, volunteers] = await Promise.all([
      prisma.user.count({ where: { role: "DONOR" } }),
      prisma.user.count({ where: { role: "RECEIVER" } }),
      prisma.user.count({ where: { role: "VOLUNTEER" } }),
    ]);

    return res.json({
      kgSaved: impact._sum.kgSaved || 0,
      meals: impact._sum.meals || 0,
      co2Avoided: impact._sum.co2Avoided || 0,
      logs: impact._count,
      donors,
      receivers,
      volunteers,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/map", async (_req, res, next) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        title: true,
        category: true,
        imageUrl: true,
        lat: true,
        lng: true,
        expiresAt: true,
        commerce: {
          select: {
            name: true,
            address: true,
          },
        },
      },
      take: 200,
    });

    const now = Date.now();
    const points = listings.map((listing) => {
      const isUrgent = new Date(listing.expiresAt).getTime() - now < 2 * 60 * 60 * 1000;
      return {
        ...listing,
        urgency: isUrgent ? "URGENT" : "NORMAL",
      };
    });

    return res.json(points);
  } catch (error) {
    return next(error);
  }
});

module.exports = { impactRouter: router };
