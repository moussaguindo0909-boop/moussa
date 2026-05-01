const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

const router = express.Router();

function parseKg(quantityRaw, unitRaw) {
  const quantity = Number.parseFloat(String(quantityRaw).replace(",", "."));
  if (Number.isNaN(quantity) || quantity <= 0) return 1;
  const unit = String(unitRaw || "").toLowerCase();
  if (unit.includes("kg")) return quantity;
  if (unit.includes("g")) return quantity / 1000;
  return quantity;
}

function supportsDelivery(pickupMode) {
  return pickupMode === "DELIVERY" || pickupMode === "BOTH";
}

const createReservationSchema = z.object({
  listingId: z.string().min(1, "Listing manquant."),
  needsDelivery: z.boolean().default(false),
  deliveryMode: z.enum(["VOLUNTEER"]).optional().nullable(),
});

router.post("/", requireAuth, requireRole("RECEIVER"), validate(createReservationSchema), async (req, res, next) => {
  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUnique({
        where: { id: req.validatedBody.listingId },
        include: {
          reservations: {
            where: {
              status: { in: ["PENDING", "CONFIRMED"] },
            },
            select: {
              id: true,
              userId: true,
            },
          },
        },
      });

      if (!listing || listing.status !== "ACTIVE") {
        const error = new Error("Listing indisponible.");
        error.status = 400;
        throw error;
      }

      if (req.validatedBody.needsDelivery && !supportsDelivery(listing.pickupMode)) {
        const error = new Error("Ce surplus est disponible uniquement sur place.");
        error.status = 400;
        throw error;
      }

      const ownReservation = listing.reservations.find((item) => item.userId === req.user.sub);
      if (ownReservation) {
        const error = new Error("Vous avez deja une demande en cours pour ce surplus.");
        error.status = 409;
        throw error;
      }

      if (listing.reservations.length > 0) {
        const error = new Error("Ce surplus est deja reserve par un autre beneficiaire.");
        error.status = 409;
        throw error;
      }

      const listingUpdate = await tx.listing.updateMany({
        where: {
          id: listing.id,
          status: "ACTIVE",
        },
        data: { status: "RESERVED" },
      });

      if (listingUpdate.count !== 1) {
        const error = new Error("Listing indisponible.");
        error.status = 409;
        throw error;
      }

      const createdReservation = await tx.reservation.create({
        data: {
          listingId: req.validatedBody.listingId,
          userId: req.user.sub,
          needsDelivery: req.validatedBody.needsDelivery,
          deliveryMode: req.validatedBody.deliveryMode,
          status: req.validatedBody.needsDelivery ? "PENDING" : "CONFIRMED",
        },
      });

      if (createdReservation.needsDelivery) {
        await tx.delivery.create({
          data: {
            reservationId: createdReservation.id,
            status: "WAITING",
          },
        });
      }

      const kgSaved = parseKg(listing.quantity, listing.unit);
      await tx.impactLog.create({
        data: {
          commerceId: listing.commerceId,
          kgSaved,
          co2Avoided: Number((kgSaved * 2.5).toFixed(2)),
          meals: Math.max(1, Math.floor(kgSaved / 0.35)),
        },
      });

      return tx.reservation.findUnique({
        where: { id: createdReservation.id },
        include: {
          listing: {
            include: {
              commerce: {
                select: { id: true, name: true, address: true },
              },
            },
          },
          delivery: true,
        },
      });
    });

    if (!reservation) {
      return res.status(500).json({ message: "Reservation non creee." });
    }

    req.io?.emit("new_reservation", {
      reservationId: reservation.id,
      listingId: reservation.listingId,
      listingTitle: reservation.listing.title,
    });

    if (reservation.needsDelivery) {
      req.io?.emit("delivery_request", {
        reservationId: reservation.id,
        productTitle: reservation.listing.title,
        quantity: `${reservation.listing.quantity} ${reservation.listing.unit}`,
      });
    }

    return res.status(201).json(reservation);
  } catch (error) {
    return next(error);
  }
});

router.get("/mine", requireAuth, async (req, res, next) => {
  try {
    const reservations = await prisma.reservation.findMany({
      where: { userId: req.user.sub },
      include: {
        listing: {
          include: {
            commerce: {
              select: { id: true, name: true, address: true, lat: true, lng: true },
            },
          },
        },
        delivery: {
          include: {
            volunteer: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json(reservations);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const reservation = await prisma.reservation.findUnique({ where: { id: req.params.id } });
    if (!reservation) {
      return res.status(404).json({ message: "Reservation introuvable." });
    }
    if (reservation.userId !== req.user.sub) {
      return res.status(403).json({ message: "Action interdite." });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const updatedReservation = await tx.reservation.update({
        where: { id: req.params.id },
        data: { status: "COLLECTED" },
      });

      await tx.listing.update({
        where: { id: reservation.listingId },
        data: { status: "COLLECTED" },
      });

      return updatedReservation;
    });
    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

module.exports = { reservationsRouter: router };
