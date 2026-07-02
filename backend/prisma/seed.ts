import { PrismaClient } from "@prisma/client";
import { seedProducts } from "../src/domain";

const prisma = new PrismaClient();

async function main() {
  const liveSlugs = seedProducts.map((product) => product.slug);
  const liveIds = seedProducts.map((product) => product.id);

  await prisma.product.updateMany({
    where: { slug: { notIn: liveSlugs } },
    data: { status: "draft" },
  });

  // Free ids when catalog entries were renumbered but slug stayed/new slug took an existing id slot.
  await prisma.product.deleteMany({
    where: {
      id: { in: liveIds },
      slug: { notIn: liveSlugs },
    },
  });

  for (const product of seedProducts) {
    const existing = await prisma.product.findUnique({
      where: { slug: product.slug },
      select: { id: true },
    });

    if (existing && existing.id !== product.id) {
      await prisma.product.delete({ where: { slug: product.slug } });
    }

    await prisma.product.deleteMany({
      where: { id: product.id, slug: { not: product.slug } },
    });

    await prisma.product.upsert({
      where: { slug: product.slug },
      create: {
        id: product.id,
        slug: product.slug,
        name: product.name,
        category: product.category,
        price: product.price,
        mrp: product.mrp,
        discount: product.discount,
        images: product.images,
        color: product.color,
        sizes: product.sizes,
        sizeStock: product.sizeStock,
        stock: product.stock,
        badge: product.badge,
        fabric: product.fabric,
        fit: product.fit,
        rating: product.rating,
        reviews: product.reviews,
        description: product.description,
        tags: product.tags,
        status: product.status,
        createdAt: product.createdAt,
      },
      update: {
        name: product.name,
        category: product.category,
        price: product.price,
        mrp: product.mrp,
        discount: product.discount,
        images: product.images,
        color: product.color,
        sizes: product.sizes,
        sizeStock: product.sizeStock,
        stock: product.stock,
        badge: product.badge,
        fabric: product.fabric,
        fit: product.fit,
        rating: product.rating,
        reviews: product.reviews,
        description: product.description,
        tags: product.tags,
        status: product.status,
      },
    });
  }

  console.log(`Seeded ${seedProducts.length} products. Use Studio to publish catalogue items with photos.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
