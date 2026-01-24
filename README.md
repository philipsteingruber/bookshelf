# Bookshelf - Personal Reading Tracker

A full-stack web application for tracking your personal reading journey, built with Next.js, tRPC, Prisma, and PostgreSQL.

## Features

- **Book Management** - Add, organize, and track your personal library with cover images, series info, and metadata
- **Reading Progress** - Track your reading progress with page-based or percentage-based updates
- **Reading Goals** - Set yearly reading goals with progress visualization and pace tracking
- **Reading Statistics** - View pages read today, weekly totals, average reading pace, and reading streaks
- **GoodReads Integration** - Import book details directly from GoodReads URLs
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
- **File Upload:** UploadThing
- **Form Management:** React Hook Form with Zod validation
- **State Management:** TanStack React Query
- **Charts:** Recharts
- **Logging:** Pino with pino-pretty
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
publishedYear   Int       (Required, 1800-current+1)
pageCount       Int       (Default: 0)
progress        Int       (0-100%, Default: 0)
rating          Int?      (1-5 stars, Optional)
goodreadsRating Decimal?  (Optional)
goodreadsUrl    String?   (Optional)
googleBooksUrl  String?   (Optional)
review          Text?     (Optional)
coverUrl        String?   (Optional)
isbn            String?   (Unique per user, Optional)
series          String?   (Optional)
seriesIndex     Int?      (Unique with series per user, Optional)
summary         Text?     (Optional, max 2000 chars)
status          Enum      (TO_READ, READING, READ, READ_NEXT, DNF)
startedAt       DateTime? (Optional)
finishedAt      DateTime? (Optional)
userId          String    (Foreign Key to User, Indexed)
createdAt       DateTime
updatedAt       DateTime
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

---

## API Endpoints (tRPC)

### Book Router (`book.*`)

| Endpoint                                 | Type     | Description                                                      |
| ---------------------------------------- | -------- | ---------------------------------------------------------------- |
| `getBooks(filters?)`                     | Query    | Get all books with optional filtering, searching, and sorting    |
| `getBook(bookId)`                        | Query    | Get single book details with ownership verification              |
| `createBook(input)`                      | Mutation | Create new book with validation                                  |
| `updateReadingStatus(bookId, newStatus)` | Mutation | Update book reading status with automatic progress/date handling |
| `updatePageCount(bookId, newPageCount)`  | Mutation | Update book's page count                                         |

### User Router (`user.*`)

| Endpoint                                | Type     | Description                                                   |
| --------------------------------------- | -------- | ------------------------------------------------------------- |
| `getReadingGoal()`                      | Query    | Get current year's reading goal (auto-creates if none exists) |
| `getReadingGoalHistory()`               | Query    | Get reading goals from all years                              |
| `setReadingGoal(newGoal)`               | Mutation | Set or update current year's reading goal                     |
| `setReadingGoalThreshold(newThreshold)` | Mutation | Set minimum page threshold for books to count toward goals    |

### Reading Progress Router (`readingProgress.*`)

| Endpoint                               | Type     | Description                                                 |
| -------------------------------------- | -------- | ----------------------------------------------------------- |
| `getAllReadingProgress()`              | Query    | Get all reading progress entries for statistics calculation |
| `getProgressHistory(bookId)`           | Query    | Get reading progress history for a specific book            |
| `createReadingProgressInstance(input)` | Mutation | Create new progress entry (by page or percentage)           |

### GoodReads Router (`goodReads.*`)

| Endpoint      | Type     | Description                              |
| ------------- | -------- | ---------------------------------------- |
| `scrape(url)` | Mutation | Scrape book details from a GoodReads URL |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (package manager)
- PostgreSQL database
- Clerk account for authentication
- UploadThing account for file uploads

### Environment Variables

```env
DATABASE_URL="postgresql://..."
CLERK_SECRET_KEY="..."
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="..."
CLERK_WEBHOOK_SIGNING_SECRET="..."
UPLOADTHING_TOKEN="..."
```

### Installation

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm exec prisma generate

# Run database migrations
pnpm exec prisma migrate dev

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
```

---

## Project Structure

```Typescript
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Landing/redirect page
│   ├── (authed)/           # Authenticated routes
│   │   ├── dashboard/      # Dashboard pages
│   │   └── books/          # Book management pages
│   └── api/                # API routes
│       ├── trpc/           # tRPC API handler
│       ├── uploadthing/    # File upload endpoints
│       └── webhooks/       # Clerk webhook handler
├── components/             # React components
│   ├── ui/                 # Base UI components (ShadCN/Radix)
│   ├── books/              # Book-specific components
│   ├── dashboard/          # Dashboard components
│   └── layout/             # Layout components (header, etc.)
├── hooks/                  # Custom React hooks
│   ├── use-books.ts        # Books data fetching
│   ├── use-book.ts         # Single book fetching
│   ├── use-reading-stats.ts # Reading statistics
│   └── use-reading-history.ts # Progress history
├── trpc/                   # tRPC setup and routers
│   ├── client.tsx          # tRPC client configuration
│   ├── server.tsx          # tRPC server caller
│   ├── init.ts             # tRPC initialization
│   └── routers/            # API route handlers
├── lib/                    # Utilities and helpers
│   ├── prisma.ts           # Prisma client instance
│   ├── logger.ts           # Pino logger configuration
│   ├── error-handler.ts    # Centralized error handling
│   ├── book-utils.ts       # Book sorting utilities
│   ├── reading-stats-utils.ts # Statistics calculations
│   ├── reading-goal-utils.ts  # Goal progress utilities
│   └── goodreads-scraper.ts   # GoodReads data extraction
├── schemas/                # Zod validation schemas
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
- [UploadThing](https://uploadthing.com/) - File uploads made easy
- [Vitest](https://vitest.dev/) - Fast unit testing framework
- [Pino](https://getpino.io/) - Fast and low overhead logging
- [TanStack Query](https://tanstack.com/query) - Powerful data synchronization
- [Recharts](https://recharts.org/) - Composable charting library
