const express = require("express");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { validate } = require("../middleware/validate");
const { requireAuth, requireRole } = require("../middleware/auth");
const { distanceInKm } = require("../utils/geo");

const router = express.Router();

const createListingSchema = z.object({
  title: z.string().min(2),
  category: z.enum(["BAKERY", "COOKED_MEALS", "FRUITS_VEGETABLES", "DAIRY", "PASTRY", "GROCERY"]),
  quantity: z.string(),
  unit: z.string().default("kg"),
  imageUrl: z.string().url().optional(),
  expiresAt: z.coerce.date(),
  type: z.enum(["DONATION", "REDUCED_PRICE", "BOTH"]).default("DONATION"),
  price: z.number().optional(),
  reduction: z.number().int().min(0).max(100).optional(),
  pickupMode: z.enum(["ON_SITE", "DELIVERY", "BOTH"]).default("BOTH"),
  description: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
});

router.get("/", async (req, res, next) => {
  try {
    const category = req.query.category;
    const status = req.query.status || "ACTIVE";
    const lat = req.query.lat ? Number(req.query.lat) : null;
    const lng = req.query.lng ? Number(req.query.lng) : null;
    const radius = req.query.radius ? Number(req.query.radius) : null;

    const listings = await prisma.listing.findMany({
      where: {
        status: status === "ALL" ? undefined : status,
        category: category || undefined,
      },
      include: {
        commerce: {
          select: { id: true, name: true, address: true, lat: true, lng: true },
        },
        _count: {
          select: { reservations: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const filtered = lat && lng && radius
      ? listings.filter((listing) => distanceInKm(lat, lng, listing.lat, listing.lng) <= radius)
      : listings;

    return res.json(filtered);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { commerce: true, reservations: true },
    });
    if (!listing) {
      return res.status(404).json({ message: "Listing introuvable." });
    }
    return res.json(listing);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, requireRole("DONOR"), validate(createListingSchema), async (req, res, next) => {
  try {
    const donor = await prisma.user.findUnique({
      where: { id: req.user.sub },
      include: { commerce: true },
    });
    if (!donor?.commerce) {
      return res.status(400).json({ message: "Commerce introuvable pour ce compte donneur." });
    }

    const listing = await prisma.listing.create({
      data: {
        ...req.validatedBody,
        userId: donor.id,
        commerceId: donor.commerce.id,
      },
    });

    req.io?.emit("new_listing", {
      listingId: listing.id,
      title: listing.title,
      category: listing.category,
      lat: listing.lat,
      lng: listing.lng,
      expiresAt: listing.expiresAt,
      type: listing.type,
    });

    return res.status(201).json(listing);
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", requireAuth, requireRole("DONOR"), validate(createListingSchema.partial()), async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Listing introuvable." });
    }
    if (existing.userId !== req.user.sub) {
      return res.status(403).json({ message: "Action interdite pour ce listing." });
    }
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: req.validatedBody,
    });
    return res.json(listing);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, requireRole("DONOR"), async (req, res, next) => {
  try {
    const existing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ message: "Listing introuvable." });
    }
    if (existing.userId !== req.user.sub) {
      return res.status(403).json({ message: "Action interdite pour ce listing." });
    }
    await prisma.listing.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = { listingsRouter: router };
