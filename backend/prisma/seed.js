const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const MAHDIA_CENTER = { lat: 35.5047, lng: 11.0622 };

const listingsSeed = [
  { title: "Pain tradition et baguettes", category: "BAKERY", quantity: "22", unit: "unites", imageUrl: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=1200&q=80", pickupMode: "BOTH", type: "DONATION", description: "Pain du jour encore frais.", hours: 3, lat: 35.5061, lng: 11.0595 },
  { title: "Croissants et pains au chocolat", category: "BAKERY", quantity: "16", unit: "unites", imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80", pickupMode: "ON_SITE", type: "DONATION", description: "Viennoiseries invendues de fin d'apres-midi.", hours: 2, lat: 35.5025, lng: 11.0662 },
  { title: "Couscous poulet portions", category: "COOKED_MEALS", quantity: "8", unit: "portions", imageUrl: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=1200&q=80", pickupMode: "DELIVERY", type: "BOTH", description: "Portions cuisinees et conservees au chaud.", hours: 4, lat: 35.4999, lng: 11.0703 },
  { title: "Tajine tunisien", category: "COOKED_MEALS", quantity: "6", unit: "portions", imageUrl: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80", pickupMode: "BOTH", type: "DONATION", description: "Tajine aux legumes de saison.", hours: 5, lat: 35.5121, lng: 11.0601 },
  { title: "Tomates, concombres et poivrons", category: "FRUITS_VEGETABLES", quantity: "14", unit: "kg", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80", pickupMode: "BOTH", type: "DONATION", description: "Legumes frais proches date de rotation.", hours: 20, lat: 35.4978, lng: 11.0557 },
  { title: "Panier fruits melanges", category: "FRUITS_VEGETABLES", quantity: "10", unit: "kg", imageUrl: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=1200&q=80", pickupMode: "DELIVERY", type: "DONATION", description: "Pommes, bananes et oranges.", hours: 12, lat: 35.5087, lng: 11.0721 },
  { title: "Yaourts nature et fromage frais", category: "DAIRY", quantity: "24", unit: "unites", imageUrl: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?auto=format&fit=crop&w=1200&q=80", pickupMode: "ON_SITE", type: "REDUCED_PRICE", reduction: 40, description: "A consommer sous 48h.", hours: 26, lat: 35.5104, lng: 11.0514 },
  { title: "Lait et laban", category: "DAIRY", quantity: "18", unit: "unites", imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=1200&q=80", pickupMode: "BOTH", type: "REDUCED_PRICE", reduction: 35, description: "Produits refrigeres, chaine du froid respectee.", hours: 22, lat: 35.4954, lng: 11.0668 },
  { title: "Assortiment patisseries", category: "PASTRY", quantity: "5", unit: "kg", imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80", pickupMode: "BOTH", type: "DONATION", description: "Makroudh, millefeuille, tartelettes.", hours: 2, lat: 35.5013, lng: 11.0625 },
  { title: "Gateaux individuels", category: "PASTRY", quantity: "20", unit: "unites", imageUrl: "https://mamanguide.com/petit-gateau-individuel-facile/", pickupMode: "DELIVERY", type: "BOTH", reduction: 50, description: "Parfaits pour associations enfants.", hours: 6, lat: 35.5158, lng: 11.0589 },
  { title: "Pates, riz et conserves", category: "GROCERY", quantity: "30", unit: "unites", imageUrl: "https://fr.123rf.com/photo_199103188_dons-alimentaires-avec-p%C3%A2tes-riz-huile-beurre-de-cacahu%C3%A8te-conserves-confiture-et-autres-sur.html", pickupMode: "BOTH", type: "DONATION", description: "Lots epicerie avec DLC longue.", hours: 48, lat: 35.5073, lng: 11.0675 },
  { title: "Huiles et legumes secs", category: "GROCERY", quantity: "15", unit: "unites", imageUrl: "https://www.lanutrition.fr/comment-cuisiner-les-legumes-secs", pickupMode: "ON_SITE", type: "REDUCED_PRICE", reduction: 30, description: "Pack eco anti-gaspillage.", hours: 72, lat: 35.4929, lng: 11.0617 },
];

async function main() {
  const password = await bcrypt.hash("FoodRescue123!", 10);

  await prisma.delivery.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.impactLog.deleteMany();
  await prisma.commerce.deleteMany();
  await prisma.user.deleteMany();

  const donorUsers = await Promise.all([
    prisma.user.create({
      data: {
        email: "boulangerie.elamel@foodrescue.tn",
        password,
        name: "Boulangerie El Amel",
        phone: "+21620111222",
        role: "DONOR",
        commerce: {
          create: {
            name: "Boulangerie El Amel",
            type: "Boulangerie",
            address: "Avenue Habib Bourguiba, Mahdia",
            lat: MAHDIA_CENTER.lat + 0.0014,
            lng: MAHDIA_CENTER.lng - 0.0011,
            plan: "BUSINESS",
            score: 92,
          },
        },
      },
      include: { commerce: true },
    }),
    prisma.user.create({
      data: {
        email: "restaurant.dar.mahdia@foodrescue.tn",
        password,
        name: "Restaurant Dar Mahdia",
        phone: "+21625444555",
        role: "DONOR",
        commerce: {
          create: {
            name: "Restaurant Dar Mahdia",
            type: "Restaurant",
            address: "Rue de la Medina, Mahdia",
            lat: MAHDIA_CENTER.lat - 0.0012,
            lng: MAHDIA_CENTER.lng + 0.0016,
            plan: "PREMIUM",
            score: 95,
          },
        },
      },
      include: { commerce: true },
    }),
    prisma.user.create({
      data: {
        email: "epicerie.centrale@foodrescue.tn",
        password,
        name: "Epicerie Centrale",
        phone: "+21629666777",
        role: "DONOR",
        commerce: {
          create: {
            name: "Epicerie Centrale",
            type: "Epicerie",
            address: "Boulevard de la Corniche, Mahdia",
            lat: MAHDIA_CENTER.lat + 0.0023,
            lng: MAHDIA_CENTER.lng + 0.0004,
            plan: "STARTER",
            score: 84,
          },
        },
      },
      include: { commerce: true },
    }),
  ]);

  const receiverUsers = await Promise.all([
    prisma.user.create({
      data: {
        email: "association.alamal@foodrescue.tn",
        password,
        name: "Association Al Amal",
        phone: "+21622123456",
        role: "RECEIVER",
      },
    }),
    prisma.user.create({
      data: {
        email: "famille.benali@foodrescue.tn",
        password,
        name: "Famille Ben Ali",
        phone: "+21655333444",
        role: "RECEIVER",
      },
    }),
  ]);

  await Promise.all([
    prisma.user.create({
      data: {
        email: "volunteer.mouss@foodrescue.tn",
        password,
        name: "Moussa Guindo",
        phone: "+21699001122",
        role: "VOLUNTEER",
      },
    }),
    prisma.user.create({
      data: {
        email: "volunteer.sara@foodrescue.tn",
        password,
        name: "Sara Jebali",
        phone: "+21644009988",
        role: "VOLUNTEER",
      },
    }),
    prisma.user.create({
      data: {
        email: "admin@foodrescue.tn",
        password,
        name: "Admin Food Rescue",
        role: "ADMIN",
      },
    }),
  ]);

  let listingIndex = 0;
  for (const listing of listingsSeed) {
    const donor = donorUsers[listingIndex % donorUsers.length];
    listingIndex += 1;
    await prisma.listing.create({
      data: {
        title: listing.title,
        category: listing.category,
        quantity: listing.quantity,
        unit: listing.unit,
        imageUrl: listing.imageUrl,
        expiresAt: new Date(Date.now() + listing.hours * 60 * 60 * 1000),
        type: listing.type,
        reduction: listing.reduction ?? null,
        pickupMode: listing.pickupMode,
        description: listing.description,
        lat: listing.lat,
        lng: listing.lng,
        commerceId: donor.commerce.id,
        userId: donor.id,
      },
    });
  }

  for (const donor of donorUsers) {
    await prisma.impactLog.create({
      data: {
        commerceId: donor.commerce.id,
        kgSaved: Math.round((40 + Math.random() * 120) * 10) / 10,
        meals: Math.floor(120 + Math.random() * 280),
        co2Avoided: Math.round((90 + Math.random() * 260) * 10) / 10,
      },
    });
  }

  const firstListing = await prisma.listing.findFirst({ where: { status: "ACTIVE" } });
  if (firstListing) {
    await prisma.$transaction([
      prisma.reservation.create({
        data: {
          listingId: firstListing.id,
          userId: receiverUsers[0].id,
          needsDelivery: true,
          deliveryMode: "VOLUNTEER",
          status: "PENDING",
          delivery: { create: { status: "WAITING" } },
        },
      }),
      prisma.listing.update({
        where: { id: firstListing.id },
        data: { status: "RESERVED" },
      }),
    ]);
  }

  // eslint-disable-next-line no-console
  console.log("Seed termine: donnees de demo creees avec images reelles.");
}

main()
  .catch(async (error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
