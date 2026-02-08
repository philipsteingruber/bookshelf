/**
 * Development Database Seed Script
 *
 * This script creates your user in the local development database
 * so authentication works with your Clerk account.
 *
 * IMPORTANT: Add CLERK_USER_ID to your .env file (it's gitignored and safe)
 *
 * Usage:
 *   pnpm seed:dev
 *
 * Optional: Add test data
 *   SEED_TEST_DATA=true pnpm seed:dev
 */

// Load dotenv before any @/ imports to ensure env vars are available
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { resolve } from "path";

import { PrismaClient } from "@/generated/prisma/client";

// Load both .env.local and .env
config({ path: resolve(process.cwd(), ".env.local"), override: false });
config({ path: resolve(process.cwd(), ".env") });

// Create a minimal Prisma client that bypasses @/env validation

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const CLERK_USER_ID = process.env.CLERK_USER_ID;
const SEED_TEST_DATA = process.env.SEED_TEST_DATA === "true";

async function seedDevUser(): Promise<void> {
  if (!CLERK_USER_ID) {
    console.error("\n❌ Error: CLERK_USER_ID not found in environment");
    console.error("\nPlease add it to your .env file:");
    console.error('  CLERK_USER_ID="user_37ZFMzGBaG9dx73qGwGg1Q92WvC"');
    console.error("\nThen run: pnpm seed:dev\n");
    process.exit(1);
  }

  console.log("🌱 Seeding development database...\n");

  // Create or update user
  console.log("Creating user...");
  const user = await prisma.user.upsert({
    where: { clerkId: CLERK_USER_ID },
    update: {},
    create: {
      clerkId: CLERK_USER_ID,
      email: "dev@example.com",
      name: "Dev User",
      defaultReadingThreshold: 200,
      minimumPagesForStreak: 0,
      timezone: "UTC",
    },
  });
  console.log(`✅ User created: ${user.id} (${user.email})`);

  // Create UserStats
  await prisma.userStats.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });
  console.log("✅ User stats created");

  // Optionally seed test data
  if (SEED_TEST_DATA) {
    console.log("\n📚 Creating test books...");

    const testBooks = [
      {
        title: "The Hobbit",
        titleSort: "Hobbit, The",
        author: "J.R.R. Tolkien",
        authorSort: "Tolkien, J.R.R.",
        pageCount: 310,
        publishedYear: 1937,
        status: "READ" as const,
        progress: 100,
        rating: 5,
        series: "Middle-earth",
        seriesIndex: 0,
      },
      {
        title: "The Fellowship of the Ring",
        titleSort: "Fellowship of the Ring, The",
        author: "J.R.R. Tolkien",
        authorSort: "Tolkien, J.R.R.",
        pageCount: 423,
        publishedYear: 1954,
        status: "READING" as const,
        progress: 45,
        series: "The Lord of the Rings",
        seriesIndex: 1,
      },
      {
        title: "1984",
        titleSort: "1984",
        author: "George Orwell",
        authorSort: "Orwell, George",
        pageCount: 328,
        publishedYear: 1949,
        status: "TO_READ" as const,
        progress: 0,
      },
    ];

    for (const bookData of testBooks) {
      const book = await prisma.book.create({
        data: {
          ...bookData,
          userId: user.id,
          startedAt: bookData.status === "READING" ? new Date() : null,
          finishedAt: bookData.status === "READ" ? new Date() : null,
        },
      });
      console.log(`  ✅ Created: ${book.title}`);

      // Add reading progress for the READING book
      if (bookData.status === "READING") {
        await prisma.readingProgress.create({
          data: {
            userId: user.id,
            bookId: book.id,
            progress: 0,
            comments: "Started reading!",
          },
        });
        await prisma.readingProgress.create({
          data: {
            userId: user.id,
            bookId: book.id,
            progress: 45,
            comments: "Making good progress",
          },
        });
        console.log(`    ✅ Added reading progress`);
      }
    }

    // Create a reading goal
    const currentYear = new Date().getFullYear();
    await prisma.readingGoal.upsert({
      where: {
        userId_year: {
          userId: user.id,
          year: currentYear,
        },
      },
      create: {
        userId: user.id,
        year: currentYear,
        goal: 20,
      },
      update: {},
    });
    console.log(`✅ Created reading goal for ${currentYear}`);
  }

  console.log("\n✨ Seeding complete!");
  console.log("\nYou can now:");
  console.log("  1. Start your dev server: pnpm dev");
  console.log("  2. Log in with your Clerk account");
  console.log("  3. View your data: pnpm prisma:studio\n");
}

seedDevUser()
  .catch((error) => {
    console.error("\n❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
