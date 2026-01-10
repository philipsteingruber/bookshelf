import type { auth } from "@clerk/nextjs/server";
import type { Logger } from "pino";
import { vi } from "vitest";

import type {
  Book,
  PrismaClient,
  ReadingProgress,
  User,
} from "@/generated/prisma/client";

// Extract the auth type from Clerk's auth() function
export type AuthType = Awaited<ReturnType<typeof auth>>;

/**
 * Creates a mock PrismaClient with the most commonly used methods.
 * Add more methods as needed for your tests.
 */
export function createMockDb() {
  return {
    book: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    readingProgress: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;
}

/**
 * Creates a mock logger with all standard pino methods.
 */
export function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}

/**
 * Creates a fake user for testing.
 * Provide overrides for any fields you want to customize.
 */
export function createFakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-123",
    clerkId: "clerk-user-123",
    email: "test@example.com",
    firstName: "Test",
    lastName: "User",
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

/**
 * Creates a fake book for testing.
 * Provide overrides for any fields you want to customize.
 */
export function createFakeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 1,
    userId: "test-user-123",
    title: "Test Book",
    author: "Test Author",
    isbn: "1234567890",
    publishedYear: 2026,
    pageCount: 300,
    progress: 0,
    status: "READING",
    coverUrl: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  } as Book;
}

/**
 * Creates fake reading progress for testing.
 * Provide overrides for any fields you want to customize.
 */
export function createFakeReadingProgress(
  overrides: Partial<ReadingProgress> = {},
): ReadingProgress {
  return {
    id: "test-progress-123",
    userId: "test-user-123",
    bookId: 1,
    progress: 50,
    comments: null,
    createdAt: new Date(),
    ...overrides,
  } as ReadingProgress;
}

/**
 * Creates a mock tRPC context with sensible defaults.
 * This is the context object you pass to router.createCaller().
 */
export function createMockContext(
  mockDb: PrismaClient,
  mockLogger: Logger,
  options: {
    clerkId?: string;
  } = {},
) {
  const clerkId = options.clerkId ?? "clerk-user-123";

  return {
    db: mockDb,
    auth: { userId: clerkId } as unknown as AuthType,
    logger: mockLogger,
  };
}

/**
 * Helper to create a caller with all mocks set up.
 * Automatically mocks the user lookup that happens in auth middleware.
 *
 * Usage:
 * const { caller, mockDb, mockLogger } = createMockCaller(
 *   readingProgressRouter,
 *   { userId: "custom-user-id" }
 * );
 */
export function createMockCaller<
  TRouter extends {
    createCaller: (ctx: {
      db: PrismaClient;
      auth: AuthType;
      logger: Logger;
    }) => TCaller;
  },
  TCaller = ReturnType<TRouter["createCaller"]>,
>(
  router: TRouter,
  options: {
    userId?: string;
    clerkId?: string;
    mockUser?: User;
    mockDb?: PrismaClient;
    mockLogger?: Logger;
  } = {},
) {
  const mockDb = options.mockDb ?? createMockDb();
  const mockLogger = options.mockLogger ?? createMockLogger();

  const userId = options.userId ?? "test-user-123";
  const clerkId = options.clerkId ?? "clerk-user-123";

  // Mock the user lookup that happens in the auth middleware
  const mockUser = options.mockUser ?? createFakeUser({ id: userId, clerkId });
  vi.mocked(mockDb.user.findUnique).mockResolvedValue(mockUser);

  const context = createMockContext(mockDb, mockLogger, { clerkId });
  const caller = router.createCaller(context) as TCaller;

  return {
    caller,
    mockDb,
    mockLogger,
    mockUser,
    context,
  };
}
