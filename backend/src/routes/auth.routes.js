const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { prisma } = require("../lib/prisma");
const { validate } = require("../middleware/validate");
const { requireAuth } = require("../middleware/auth");
const { signToken } = require("../utils/auth");

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["DONOR", "RECEIVER", "VOLUNTEER"]).default("RECEIVER"),
  commerce: z
    .object({
      name: z.string().min(2),
      type: z.string().min(2),
      address: z.string().min(4),
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const body = req.validatedBody;
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) {
      return res.status(409).json({ message: "Email deja utilise." });
    }

    const hashedPassword = await bcrypt.hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        password: hashedPassword,
        commerce:
          body.role === "DONOR" && body.commerce
            ? { create: body.commerce }
            : undefined,
      },
      include: { commerce: true },
    });

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        commerce: user.commerce,
      },
    });
  } catch (error) {
    return next(error);
  }
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validatedBody;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { commerce: true },
    });
    if (!user) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: "Identifiants invalides." });
    }
    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        commerce: user.commerce,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, name: true, email: true, role: true, phone: true, commerce: true },
    });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

module.exports = { authRouter: router };
