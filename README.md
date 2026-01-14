### Random Ideas

- Import from GoodReads/Google Books

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

## Development Roadmap

### ✅ Phase 1: Foundation & Core Infrastructure (Completed)

#### Authentication & User Management

- [x] Clerk authentication integration
- [x] User session management
- [x] Clerk webhook for user synchronization
- [x] Protected routes and authorization middleware
- [x] User profile UI in sidebar

#### Database & Backend Architecture

- [x] PostgreSQL database setup
- [x] Prisma ORM configuration
- [x] User, Book, and ReadingProgress models
- [x] Database indexes for performance optimization
- [x] tRPC server setup with type-safe procedures
- [x] Centralized error handling utilities

#### Development Environment

- [x] ESLint configuration with auto-fix script
- [x] Prettier configuration with Tailwind plugin
- [x] Import sorting with simple-import-sort plugin
- [x] TypeScript strict mode configuration
- [x] Development scripts and hot reload
- [x] Pre-commit hooks for code quality (ESLint auto-fix)

---

### ✅ Phase 2: Core Book Management (Completed)

#### Book Creation & Input

- [x] Book creation form with multi-section layout
  - [x] Basic information section (title, author, published year)
  - [x] Optional information section (page count, series, ISBN, summary)
  - [x] Cover upload section with UploadThing integration
- [x] Form validation with Zod schemas
  - [x] ISBN validation (ISBN-10 and ISBN-13)
  - [x] Published year validation (1800 to current+1)
  - [x] Character limits for text fields
  - [x] Duplicate ISBN prevention
  - [x] Duplicate series position prevention
- [x] Book cover image upload (max 4MB, JPG/PNG)
- [x] Centralized validation constants

#### Book Data Model

- [x] Comprehensive book metadata support
  - [x] Title and author (required)
  - [x] Published year (required)
  - [x] Page count tracking
  - [x] ISBN storage with uniqueness constraint
  - [x] Series tracking with series index
  - [x] Summary/description field (2000 char limit)
  - [x] Rating system (1-5 stars)
  - [x] Review text field
  - [x] Cover URL storage
- [x] Reading status enum (TO_READ, READING, READ, READ_NEXT, DNF)
- [x] Reading progress percentage (0-100%)
- [x] Started and finished date tracking
- [x] Created and updated timestamps

#### Book Display & Viewing

- [x] Book library grid view (5-column layout)
- [x] Book card component with cover image, title, author, series
- [x] Book detail page with full information display
- [x] Color-coded status badges with gradient styling
- [x] GoodReads search integration
- [x] Responsive image loading with blur placeholders

---

### ✅ Phase 3: Reading Progress & Status Management (Completed)

#### Status Tracking

- [x] Read status button component with visual states
- [x] Status change dialog with radio button selection
- [x] Automatic progress updates on status change
  - [x] Set to 100% when marked as READ
  - [x] Set to 0% when marked as TO_READ or READ_NEXT
- [x] Status filtering in book list

#### Progress Visualization

- [x] Progress bar on book detail page
- [x] Progress percentage display for currently reading books
- [x] Reading progress cards on dashboard
- [x] ReadingProgress model for tracking history (foundation for future analytics)

---

### ✅ Phase 4: Dashboard & Statistics (Completed)

#### Dashboard Overview

- [x] Statistics cards with icons
  - [x] Books read this year counter
  - [x] Currently reading counter
  - [x] Planned reading statistics
- [x] "Currently Reading" section with progress bars
- [x] "Up Next" section showing queued books
- [x] Year-based filtering for finished books

#### Data Aggregation

- [x] Custom React hooks for data filtering (`useBooks`, `useBook`)
- [x] Memoized filtering by status
- [x] Total page count calculation for read books
- [x] Author-based search utilities
- [x] Book lookup by ID

---

### ✅ Phase 5: Search, Filter & Sort (Completed)

#### Search Capabilities

- [x] Search by title, author, series, or ISBN
- [x] Debounced search input (300ms)
- [x] Server-side search implementation

#### Filtering System

- [x] Filter by reading status (TO_READ, READING, READ, etc.)
- [x] Filter by rating (1-5 stars)
- [x] Combined filter support

#### Sorting Options

- [x] Sort by title (ascending/descending)
- [x] Configurable sort direction
- [x] Database-level sorting for performance

---

### ✅ Phase 6: UI/UX Polish (Completed)

#### Component Library

- [x] Custom Radix UI-based components
  - [x] Button, Card, Dialog, Input, Label
  - [x] Progress, RadioGroup, Separator, Textarea
  - [x] Tooltip, Spinner, Breadcrumb
  - [x] Form components with Field wrapper
- [x] Loading states with skeleton components
- [x] Error states with error code display
- [x] Toast notifications with Sonner
- [x] Dark mode support via next-themes

#### Navigation & Layout

- [x] App sidebar with navigation
- [x] Application header
- [x] Breadcrumb navigation
- [x] Layout system with proper nesting

---

### ✅ Phase 6.5: Monitoring & Observability (Completed)

#### Logging Infrastructure

- [x] Pino logger integration for structured logging
- [x] Environment-aware log levels (debug in dev, info in prod)
- [x] Pretty printing for development logs
- [x] Sensitive data redaction (passwords, tokens, API keys)
- [x] ISO timestamp formatting
- [x] Context-aware logging with request tracking
  - [x] Request ID tracking across requests
  - [x] User ID tracking in logs
  - [x] Route/pathname logging
- [x] Performance logging utility
  - [x] Operation duration tracking
  - [x] Slow operation warnings (configurable thresholds)
  - [x] Database query performance monitoring

#### Error Handling & User Experience

- [x] Centralized TRPC error handler with user-friendly messages
- [x] Specific error messages for common scenarios
  - [x] Conflict errors (duplicate ISBN, series)
  - [x] Network errors
  - [x] Authentication/authorization errors
  - [x] Not found errors
  - [x] Validation errors
- [x] Centralized upload error handler
  - [x] File size validation messages
  - [x] File type validation messages
  - [x] Network error handling
- [x] Detailed error logging for debugging
- [x] Error code formatting and display

#### Code Quality & Maintainability

- [x] Enhanced TRPC error logging with formatted output
- [x] Request metadata tracking in logs
- [x] Book cover image error handling with fallback
- [x] Improved code organization with section-based components

---

## 🚀 Phase 7: Enhanced Reading Experience (Proposed)

### Reading Goals & Challenges

- [ ] Set yearly reading goal (number of books/pages)
- [ ] Progress visualization towards yearly goal
- [ ] Monthly reading challenges
- [ ] Reading streaks tracking
- [ ] Goal completion badges/achievements

### Advanced Progress Tracking ✅

- [x] Manual progress updates (e.g., "I'm on page 150")
- [x] Progress history timeline
- [x] Estimated finish date based on reading pace
- [x] Daily/weekly reading statistics ✅
  - [x] Backend: `getAllReadingProgress` tRPC procedure
  - [x] Backend: Calculation utilities (`reading-stats-utils.ts`)
    - [x] Pages read today counter
    - [x] Average pages per day calculation
    - [x] Weekly totals (this week, last week)
    - [x] Active reading days tracking
    - [x] Total pages read calculation
    - [x] Average pages per week calculation
  - [x] React hook: `useReadingStats` with memoization
  - [x] UI: Dashboard statistics cards integration ✅
  - [x] UI: Replace "Coming Soon" placeholders with real data ✅
- [x] Reading streaks tracking ✅
  - [x] Backend: Streak calculation algorithm
    - [x] Current streak counter
    - [x] Longest streak tracking
    - [x] Streak start date tracking
    - [x] Active today detection
  - [x] Streak model added to database schema
  - [x] UI: Streak display on dashboard ✅
  - [ ] Backend: Streak persistence/updates (Future enhancement)

---

## 🚀 Phase 8: Enhanced Book Discovery & Management (Proposed)

### External API Integration

- [x] GoodReads scraper for book import
  - [x] Integrate into CreateBookForm
- [ ] Google Books API integration for book lookup
- [ ] Auto-populate book metadata from ISBN
- [ ] Book cover fetching from external sources
- [ ] Author information and biography
- [ ] Similar book recommendations

### Advanced Filtering & Organization

- [ ] Comprehensive filtering UI component
  - [ ] Rating filter (backend complete, UI pending)
  - [ ] Status filter improvements
  - [ ] Combined filter display
  - [ ] Clear all filters button
- [ ] Genre/category tagging system
- [ ] Custom tags/labels
- [ ] Multiple tag assignment per book
- [ ] Filter by genre/tags
- [x] Sort by date added, date finished, rating
- [ ] Advanced search with multiple criteria
- [ ] Saved filter presets

### Collections & Lists

- [ ] Custom book collections/shelves
- [ ] Reading lists (e.g., "Summer 2026", "Fantasy Favorites")
- [ ] Share collections publicly
- [ ] Collection cover images
- [ ] Reorder books within collections

---

## 🚀 Phase 9: Social Features (Proposed)

### Book Reviews & Ratings

- [ ] Enhanced review editor with rich text formatting
- [ ] Review visibility settings (private/public)
- [ ] Edit review history
- [ ] Star rating with half-star support
- [ ] Review templates for different genres

### Sharing

- [ ] Share reading progress on social media
- [ ] Generate shareable reading statistics images
- [ ] Share book recommendations
- [ ] Export reading list as PDF/CSV
- [ ] Public profile page with reading stats

---

## 🚀 Phase 10: Analytics & Insights (Proposed)

### Reading Statistics

- [ ] Reading heatmap (calendar view)
- [ ] Reading pace trends over time
- [ ] Genre distribution pie chart
- [ ] Author diversity analysis
- [ ] Page count trends
- [ ] Average rating over time
- [ ] Books per month/year chart
- [ ] Reading time analysis

### Detailed Reports

- [ ] Monthly/yearly reading reports
- [ ] Most read authors
- [ ] Longest/shortest books read
- [ ] Rating distribution histogram
- [ ] Reading streaks and milestones
- [ ] Comparison with previous years
- [ ] Export reports as PDF

### Insights & Recommendations

- [ ] Personalized book recommendations based on reading history
- [ ] Suggest next book based on preferences
- [ ] Identify reading patterns
- [ ] Genre exploration suggestions
- [ ] Author follow-ups (next book in series, same author)

---

## 🚀 Phase 11: Mobile & Cross-Platform (Proposed)

### Mobile Experience

- [ ] Progressive Web App (PWA) support
- [ ] Mobile-optimized layouts
- [ ] Touch gestures for navigation
- [ ] Offline mode for viewing library
- [ ] Home screen installation prompt
- [ ] Push notifications for reading reminders

### Mobile-Specific Features

- [ ] Barcode scanner for ISBN input
- [ ] Camera integration for cover photo upload
- [ ] Voice input for notes
- [ ] Quick-add book widget
- [ ] Reading reminders/notifications

---

## 🚀 Phase 12: Advanced Features (Proposed)

### Series Management

- [ ] Dedicated series view page
- [ ] Series progress tracking
- [ ] Visual series timeline
- [ ] Automatic series detection
- [ ] Missing books in series indicator
- [ ] Series reading order suggestions

### Book Lending

- [ ] Track loaned books
- [ ] Borrower information and due dates
- [ ] Loan history
- [ ] Reminder notifications for overdue loans
- [ ] Friends' borrowing requests

### Import/Export

- [ ] Import from Goodreads CSV
- [ ] Import from LibraryThing
- [ ] Export library to CSV/JSON
- [ ] Backup/restore functionality
- [ ] Bulk book import via ISBN list

### Wishlist & Purchasing

- [ ] Wishlist/want-to-buy section
- [ ] Price tracking integration
- [ ] Library availability checker
- [ ] Purchase links to bookstores
- [ ] Budget tracking for book purchases

---

## 🚀 Phase 13: Performance & Scale (Proposed)

### Optimization

- [ ] Implement pagination for large libraries (currently loads 50 max)
- [ ] Infinite scroll for book grid
- [ ] Image optimization with Next.js Image
- [ ] Lazy loading for book cards
- [ ] Server-side rendering optimization
- [ ] Database query optimization with proper indexes
- [ ] Caching strategy with React Query
- [ ] CDN integration for images

### Search Enhancement

- [ ] Full-text search with PostgreSQL
- [ ] Search suggestions/autocomplete
- [ ] Fuzzy search for typo tolerance
- [ ] Search result highlighting
- [ ] Recent searches history

---

## 🚀 Phase 14: Accessibility & Internationalization (Proposed)

### Accessibility

- [ ] ARIA labels and roles
- [ ] Keyboard navigation improvements
- [ ] Screen reader optimization
- [ ] High contrast mode
- [ ] Focus indicators
- [ ] Alt text for all images
- [ ] WCAG 2.1 AA compliance

### Internationalization

- [ ] Multi-language support (i18n)
- [ ] Language switcher
- [ ] Translated UI strings
- [ ] Date/time localization
- [ ] Currency localization for pricing features
- [ ] RTL language support

---

## 🚀 Phase 15: Admin & Moderation (Proposed)

### Admin Dashboard

- [ ] User management interface
- [ ] Content moderation tools
- [ ] System health monitoring
- [ ] Usage analytics dashboard
- [ ] Database backup management
- [ ] Feature flags system

### Data Management

- [ ] Bulk operations (delete, update status)
- [ ] Data cleanup tools
- [ ] Duplicate detection and merging
- [ ] Data integrity checks
- [ ] Audit logging

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

```
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
