import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const categories = [
    {
      name: 'Music',
      slug: 'music',
      description: 'Concerts, festivals, and live performances',
    },
    {
      name: 'Technology',
      slug: 'technology',
      description: 'Conferences, hackathons, and meetups',
    },
    {
      name: 'Sports',
      slug: 'sports',
      description: 'Sports events and competitions',
    },
    {
      name: 'Arts',
      slug: 'arts',
      description: 'Exhibitions, theatre, and creative events',
    },
    {
      name: 'Food & Drink',
      slug: 'food-drink',
      description: 'Food festivals, tastings, and dining events',
    },
    {
      name: 'Business',
      slug: 'business',
      description: 'Networking, workshops, and seminars',
    },
    {
      name: 'Education',
      slug: 'education',
      description: 'Classes, courses, and educational events',
    },
    {
      name: 'Community',
      slug: 'community',
      description: 'Local community and charity events',
    },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }

  console.log('Categories seeded');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
