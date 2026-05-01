const express = require("express");
const { prisma } = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/available", requireAuth, requireRole("VOLUNTEER"), async (_req, res, next) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      where: { status: "WAITING" },
      include: {
        reservation: {
          include: {
            listing: { include: { commerce: true } },
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(deliveries);
  } catch (error) {
    return next(error);
  }
});

router.get("/mine", requireAuth, requireRole("VOLUNTEER"), async (req, res, next) => {
  try {
    const deliveries = await prisma.delivery.findMany({
      where: { volunteerId: req.user.sub },
      include: {
        reservation: {
          include: {
            listing: { include: { commerce: true } },
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(deliveries);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/accept", requireAuth, requireRole("VOLUNTEER"), async (req, res, next) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: {
        reservation: { include: { listing: true } },
      },
    });
    if (!delivery) {
      return res.status(404).json({ message: "Livraison introuvable." });
    }
    if (delivery.status !== "WAITING") {
      return res.status(400).json({ message: "Cette livraison n'est plus disponible." });
    }

    const updated = await prisma.delivery.update({
      where: { id: req.params.id },
      data: {
        status: "ACCEPTED",
        volunteerId: req.user.sub,
      },
    });

    await prisma.reservation.update({
      where: { id: delivery.reservationId },
      data: { status: "CONFIRMED" },
    });

    req.io?.emit("delivery_accepted", {
      deliveryId: updated.id,
      reservationId: delivery.reservationId,
      volunteerId: req.user.sub,
      productTitle: delivery.reservation.listing.title,
    });

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/done", requireAuth, requireRole("VOLUNTEER"), async (req, res, next) => {
  try {
    const delivery = await prisma.delivery.findUnique({
      where: { id: req.params.id },
      include: {
        reservation: {
          select: {
            id: true,
            listingId: true,
          },
        },
      },
    });
    if (!delivery) {
      return res.status(404).json({ message: "Livraison introuvable." });
    }
    if (delivery.volunteerId !== req.user.sub) {
      return res.status(403).json({ message: "Action interdite sur cette livraison." });
    }

    const updated = await prisma.delivery.update({
      where: { id: req.params.id },
      data: { status: "DELIVERED" },
    });

    await prisma.$transaction([
      prisma.reservation.update({
        where: { id: delivery.reservation.id },
        data: { status: "COLLECTED" },
      }),
      prisma.listing.update({
        where: { id: delivery.reservation.listingId },
        data: { status: "COLLECTED" },
      }),
    ]);

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

module.exports = { deliveriesRouter: router };
