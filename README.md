# Bookshelf - Personal Reading Tracker

A full-stack web application for tracking your personal reading journey, built with Next.js, tRPC, Prisma, and PostgreSQL.

## Tech Stack

- **Frontend:** Next.js 16.1 (App Router), React 19, TypeScript
- **Backend:** tRPC for type-safe APIs
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** Clerk
- **Styling:** Tailwind CSS 4 with ShadCN UI components
- **File Upload:** UploadThing
- **Form Management:** React Hook Form with Zod validation
- **State Management:** TanStack React Query
- **Logging:** Pino with pino-pretty

---

## Database Schema

### User

```prisma
id          String   (CUID, Primary Key)
clerkId     String   (Unique, Indexed)
name        String
email       String   (Unique, Indexed)
createdAt   DateTime
updatedAt   DateTime
```

### Book

```prisma
id             Int      (Auto-increment, Primary Key)
title          String   (Required)
author         String   (Required)
publishedYear  Int      (Required, 1800-current+1)
pageCount      Int      (Default: 0)
progress       Int      (0-100%, Default: 0)
rating         Int?     (1-5 stars, Optional)
review         Text?    (Optional)
coverUrl       String?  (Optional)
isbn           String?  (Unique per user, Optional)
series         String?  (Optional)
seriesIndex    Int?     (Unique with series per user, Optional)
summary        Text?    (Optional, max 2000 chars)
status         Enum     (TO_READ, READING, READ, READ_NEXT, DNF)
startedAt      DateTime? (Optional)
finishedAt     DateTime? (Optional)
userId         String   (Foreign Key to User, Indexed)
createdAt      DateTime
updatedAt      DateTime
```

### ReadingProgress

```prisma
id        String   (CUID, Primary Key)
userId    String   (Foreign Key to User, Indexed)
bookId    Int      (Foreign Key to Book, Indexed)
progress  Int      (Percentage)
createdAt DateTime
updatedAt DateTime
```

---

## API Endpoints (tRPC)

### Book Router

- `book.getBooks(filters?)` - Get all books with optional filtering, searching, and sorting
- `book.getBook(bookId)` - Get single book details with ownership verification
- `book.createBook(input)` - Create new book with validation
- `book.updateReadingStatus(bookId, newStatus)` - Update book reading status

### User Router

- `user.getUserByClerkId()` - Get current authenticated user

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
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm start    # Start production server
pnpm lint     # Run ESLint
```

---

## Project Structure

```Typescript
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Landing/redirect page
│   ├── dashboard/         # Dashboard pages
│   ├── books/             # Book management pages
│   └── api/               # API routes (webhooks, upload)
├── components/            # React components
│   ├── ui/               # Base UI components (Radix UI)
│   ├── books/            # Book-specific components
│   ├── dashboard/        # Dashboard components
│   └── layout/           # Layout components
├── hooks/                 # Custom React hooks
├── trpc/                  # tRPC setup and routers
│   ├── client.ts         # tRPC client configuration
│   ├── init.ts           # tRPC server initialization
│   └── routers/          # API route handlers
├── lib/                   # Utilities and helpers
├── schemas/               # Zod validation schemas
└── generated/prisma/      # Generated Prisma client
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
- [Pino](https://getpino.io/) - Fast and low overhead logging
- [TanStack Query](https://tanstack.com/query) - Powerful data synchronization
