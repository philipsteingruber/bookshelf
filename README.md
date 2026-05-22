# Bookshelf - Personal Reading Tracker

A full-stack web application for tracking your personal reading journey, built with Next.js, tRPC, Prisma, and PostgreSQL.

## Features

- **Book Management** - Add, organize, and track your personal library with cover images, series info, and metadata
- **Reading Progress** - Track your reading progress with page-based or percentage-based updates
- **Reading Goals** - Set yearly reading goals with progress visualization and pace tracking
- **Reading Statistics** - View pages read today, weekly totals, average reading pace, and reading streaks
- **Reading Streaks** - Track daily reading streaks with configurable minimum-pages threshold
- **AI Recommendations** - Claude-powered book recommendations based on your reading history
- **Import / Export** - Back up and restore your library as JSON or CSV
- **GoodReads Integration** - Import book details directly from GoodReads URLs
- **Calibre Sync** - Sync reading status, progress, and dates from a local Calibre/CWA library; automatically imports new books with cover art and estimated page count
- **EPUB Page Count** - Estimate page count from a local EPUB or KEPUB file when adding or editing a book, or automatically during Calibre sync
- **Smart Sorting** - Sort by title, author, date added, or last updated with proper name handling (e.g., "Abnett, Dan" instead of "Dan Abnett")
- **Search & Filter** - Search across title, author, series, and ISBN with status and rating filters
- **Dark Mode** - Full dark mode support with system preference detection
- **Responsive Design** - Optimized layouts for desktop, tablet, and mobile devices

---

## Tech Stack

- **Frontend:** Next.js 16.1 (App Router), React 19, TypeScript
- **Backend:** tRPC for type-safe APIs
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** Clerk
- **Styling:** Tailwind CSS 4 with ShadCN UI components
- **File Storage:** Vercel Blob
- **Form Management:** React Hook Form with Zod validation
- **State Management:** TanStack React Query
- **Charts:** Recharts
- **Logging:** Pino with pino-pretty and Logtail for remote log draining
- **URL State:** nuqs for type-safe URL query string management
- **Testing:** Vitest with React Testing Library

---

## Database Schema

### User

```prisma
id                      String   (CUID, Primary Key)
clerkId                 String   (Unique, Indexed)
name                    String
email                   String   (Unique, Indexed)
defaultReadingThreshold Int      (Default: 200)
minimumPagesForStreak   Int      (Default: 0)
timezone                String   (Default: "UTC")
createdAt               DateTime
updatedAt               DateTime
```

### Book

```prisma
id              Int       (Auto-increment, Primary Key)
title           String    (Required)
titleSort       String    (For sorting, e.g., "Lords of Silence, The")
author          String    (Required)
authorSort      String    (For sorting, e.g., "Abnett, Dan")
publishedYear   Int?      (Optional)
pageCount       Int?      (Optional)
progress        Int       (0-100%, Default: 0)
rating          Int?      (1-5 stars, Optional)
goodreadsRating Decimal?  (Optional)
goodreadsUrl    String?   (Optional)
googleBooksUrl  String?   (Optional)
review          Text?     (Optional)
coverUrl        String?   (Optional)
isbn            String?   (Unique per user, Optional)
seriesId        String?   (Foreign Key to Series, Optional)
seriesIndex     Float?    (Unique with seriesId, Optional)
summary         Text?     (Optional)
status          Enum      (TO_READ, READING, READ, READ_NEXT, DNF)
startedAt       DateTime? (Optional)
finishedAt      DateTime? (Optional)
userId          String    (Foreign Key to User, Indexed)
createdAt       DateTime
updatedAt       DateTime
```

### Series

```prisma
id       String (CUID, Primary Key)
name     String (Unique per user)
nameSort String
userId   String (Foreign Key to User, Indexed)
```

### ReadingProgress

```prisma
id        String   (CUID, Primary Key)
userId    String   (Foreign Key to User, Indexed)
bookId    Int      (Foreign Key to Book, Indexed)
progress  Int      (Percentage, 0-100)
comments  Text?    (Optional)
createdAt DateTime
updatedAt DateTime
```

### ReadingGoal

```prisma
id        String   (CUID, Primary Key)
userId    String   (Foreign Key to User)
year      Int      (Year for the goal)
goal      Int      (Target number of books, Default: 20)

@@unique([userId, year])
```

### UserStats

```prisma
id                        String    (CUID, Primary Key)
userId                    String    (Unique, Foreign Key to User)
currentStreak             Int       (Default: 0)
longestStreak             Int       (Default: 0)
lastQualifyingReadingDate DateTime? (Optional)
lastReadingDate           DateTime? (Optional)
totalPagesRead            Int       (Default: 0)
totalActiveDays           Int       (Default: 0)
updatedAt                 DateTime
```

---

## API Endpoints (tRPC)

### Book Router (`book.*`)

| Endpoint                                 | Type     | Description                                                      |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- |
| `getBooks(filters?)`                     | Query    | Get all books with optional filtering, searching, and sorting    |
| `getBook(bookId)`                        | Query    | Get single book details with ownership verification              |
| `getDashBoardBooks()`                    | Query    | Get books relevant to the dashboard (currently reading etc.)     |
| `getSeriesList()`                        | Query    | Get all series with their books                                  |
| `getSeriesNames()`                       | Query    | Get a flat list of series names for autocomplete                 |
| `createBook(input)`                      | Mutation | Create new book with validation                                  |
| `updateBook(input)`                      | Mutation | Update book metadata (title, author, cover, series, etc.)        |
| `updateReadingStatus(bookId, newStatus)` | Mutation | Update book reading status with automatic progress/date handling |
| `updatePageCount(bookId, newPageCount)`  | Mutation | Update book's page count                                         |
| `updateRating(bookId, rating)`           | Mutation | Set or clear a book's star rating                                |
| `deleteBook(bookId)`                     | Mutation | Delete a book and clean up orphaned series                       |

### User Router (`user.*`)

| Endpoint                                | Type     | Description                                                            |
| --------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `getReadingGoal()`                      | Query    | Get current year's reading goal (auto-creates if none exists)          |
| `getReadingGoalHistory()`               | Query    | Get reading goals from all years                                       |
| `getYearlyBookStats()`                  | Query    | Get books and pages finished grouped by year                           |
| `getUserStats()`                        | Query    | Get streak, total pages read, active days, and streak threshold        |
| `getTimezone()`                         | Query    | Get the user's configured timezone                                     |
| `setReadingGoal(newGoal)`               | Mutation | Set or update current year's reading goal                              |
| `setReadingGoalThreshold(newThreshold)` | Mutation | Set minimum page count for a book to count toward the reading goal     |
| `setStreakThreshold(newThreshold)`      | Mutation | Set minimum pages-per-day required for a day to count toward a streak  |
| `setTimezone(timezone)`                 | Mutation | Update the user's timezone and recalculate streaks accordingly         |
| `getExportData()`                       | Mutation | Export all user data (books, progress, goals, stats) as a JSON payload |
| `importData(input)`                     | Mutation | Import data from a JSON export or CSV files                            |

### Reading Progress Router (`readingProgress.*`)

| Endpoint                               | Type     | Description                                             |
| -------------------------------------- | -------- | ------------------------------------------------------- |
| `getAllReadingProgress()`              | Query    | Get all reading progress entries for statistics         |
| `getProgressHistory(bookId)`           | Query    | Get reading progress history for a specific book        |
| `getRecentReadingProgress(input)`      | Query    | Get progress entries within a recent time window        |
| `createReadingProgressInstance(input)` | Mutation | Create new progress entry (by page count or percentage) |
| `updateReadingProgressInstance(input)` | Mutation | Edit an existing progress entry's value or comment      |
| `deleteReadingProgressInstance(id)`    | Mutation | Delete a progress entry and recalculate stats           |

### GoodReads Router (`goodReads.*`)

| Endpoint      | Type     | Description                              |
| ------------- | -------- | ---------------------------------------- |
| `scrape(url)` | Mutation | Scrape book details from a GoodReads URL |

### Recommendations Router (`recommendations.*`)

| Endpoint      | Type     | Description                                                          |
| ------------- | -------- | -------------------------------------------------------------------- |
| `chat(input)` | Mutation | AI-powered book recommendations via a chat interface (Claude-backed) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (package manager)
- PostgreSQL database
- Clerk account for authentication
- Vercel project (for Vercel Blob file storage)

### Environment Variables

```env
DATABASE_URL="postgresql://..."
CLERK_SECRET_KEY="..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="..."
CLERK_WEBHOOK_SIGNING_SECRET="..."
BLOB_READ_WRITE_TOKEN="..."
```

### Installation

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm exec prisma generate

# Push the schema to the database
pnpm exec prisma db push

# Start development server
pnpm dev
```

### Development Commands

```bash
# Development
pnpm dev              # Start development server

# Build & Production
pnpm build            # Build for production
pnpm start            # Start production server

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Run ESLint with auto-fix

# Testing
pnpm test             # Run tests once
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage report
pnpm test:ui          # Run tests with Vitest UI

# Database
pnpm prisma:studio    # Open Prisma Studio

# Calibre / CWA sync (requires CWA container to be stopped first)
pnpm sync:calibre               # Dry run — preview changes
pnpm sync:calibre -- --apply    # Apply changes

# Backfill scripts (one-off data migrations)
pnpm backfill:page-count        # Dry run — populate pageCount from local EPUB/KEPUB files
pnpm backfill:page-count -- --apply
pnpm backfill:sort-fields       # Dry run — fix stale titleSort / authorSort fields
pnpm backfill:sort-fields -- --apply
pnpm backfill:user-stats        # Recompute and persist UserStats records
pnpm backfill:cover-urls        # Backfill missing cover URLs

# Maintenance / enrichment
pnpm maintenance                # Run all maintenance tasks (orchestrator with dry-run support)
pnpm cleanup:covers             # Remove orphaned cover images from Vercel Blob
pnpm enrich:goodreads-url       # Enrich books with GoodReads URLs
pnpm consolidate:tags           # Consolidate duplicate Calibre tags

# Development utilities
pnpm seed:dev                   # Seed a local dev user
pnpm preflight                  # Run preflight checks
```

---

## Project Structure

```Typescript
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout with providers
│   ├── (landing)/          # Unauthenticated landing page
│   ├── (authed)/           # Authenticated routes
│   │   ├── dashboard/      # Dashboard page
│   │   ├── books/          # Book management pages
│   │   ├── series/         # Series overview page
│   │   ├── recommendations/ # AI book recommendations page
│   │   └── history/        # Reading history page
│   └── api/                # API routes
│       ├── trpc/           # tRPC API handler
│       ├── upload/         # Vercel Blob upload handler
│       └── webhooks/       # Clerk webhook handler
├── components/             # React components
│   ├── ui/                 # Base UI components (ShadCN/Radix)
│   ├── books/              # Book-specific components
│   ├── dashboard/          # Dashboard components
│   └── layout/             # Layout components (header, etc.)
├── hooks/                  # Custom React hooks
│   ├── book/               # Book data fetching hooks
│   ├── reading/            # Reading stats and goal hooks
│   ├── ui/                 # UI utility hooks (mobile, breakpoint, etc.)
│   └── upload/             # Cover upload hooks
├── trpc/                   # tRPC setup and routers
│   ├── client.tsx          # tRPC client configuration
│   ├── server.tsx          # tRPC server caller
│   ├── init.ts             # tRPC initialization
│   └── routers/            # API route handlers
├── lib/                    # Utilities and helpers
│   ├── book/               # Book utilities (sorting, series, EPUB page count)
│   ├── reading/            # Reading utilities (stats, streaks, goals, charts)
│   ├── common/             # Shared utilities (logger, error handler, cover utils)
│   ├── export/             # Export logic
│   ├── import/             # Import logic (JSON and CSV)
│   ├── user-stats/         # User stats computation
│   ├── schemas/            # Zod validation schemas
│   ├── types/              # Shared TypeScript types
│   ├── prisma.ts           # Prisma client instance
│   └── goodreads-scraper.ts # GoodReads data extraction
└── generated/prisma/       # Generated Prisma client
```

---

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open issues for bug reports or feature requests.

---

## License

Private project - All rights reserved

---

## Acknowledgments

Built with modern web technologies:

- [Next.js](https://nextjs.org/) - React framework
- [tRPC](https://trpc.io/) - End-to-end type-safe APIs
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Clerk](https://clerk.com/) - Authentication and user management
- [shadcn/ui](https://ui.shadcn.com/) - Beautifully designed components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) - File storage
- [Vitest](https://vitest.dev/) - Fast unit testing framework
- [Pino](https://getpino.io/) - Fast and low overhead logging
- [Logtail](https://betterstack.com/logtail) - Remote log draining and search
- [nuqs](https://nuqs.47ng.com/) - Type-safe URL query string state management
- [Scrapfly](https://scrapfly.io/) - Web scraping for GoodReads data extraction
- [TanStack Query](https://tanstack.com/query) - Powerful data synchronization
- [Recharts](https://recharts.org/) - Composable charting library
