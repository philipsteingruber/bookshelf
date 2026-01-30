import type { auth } from "@clerk/nextjs/server";
import type { Logger } from "pino";
import { vi } from "vitest";

import type {
  Book,
  PrismaClient,
  ReadingGoal,
  ReadingProgress,
  User,
} from "@/generated/prisma/client";
import { READING_GOAL_DEFAULT_THRESHOLD } from "@/lib/constants";
import {
  type ChartDataPoint,
  formatRelativeDate,
  type ReadingProgressWithBook,
  type ReadingProgressWithProgressSinceLast,
} from "@/lib/reading";

// Extract the auth type from Clerk's auth() function
export type AuthType = Awaited<ReturnType<typeof auth>>;

/**
 * Creates a mock PrismaClient with the most commonly used methods.
 * Add more methods as needed for your tests.
 */
export function createMockDb(): PrismaClient {
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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    readingGoal: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient;
}

/**
 * Creates a mock logger with all standard pino methods.
 */
export function createMockLogger(): Logger {
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
    defaultReadingThreshold: READING_GOAL_DEFAULT_THRESHOLD,
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

export function createFakeReadingProgressWithProgressSinceLast(
  overrides: Partial<ReadingProgressWithProgressSinceLast> = {},
): ReadingProgressWithProgressSinceLast {
  const readingProgress = createFakeReadingProgress(overrides);

  return {
    ...readingProgress,
    progressSinceLast: 10,
    ...overrides,
  } as ReadingProgressWithProgressSinceLast;
}

export const createFakeReadingProgressWithBook = (
  overrides?: Partial<
    ReadingProgress & { book: Pick<Book, "pageCount" | "id" | "title"> }
  >,
): ReadingProgressWithBook => {
  const fakeBook = createFakeBook();
  const fakeProgress = createFakeReadingProgress();

  const bookId = overrides?.book?.id ?? fakeBook.id;

  return {
    ...fakeProgress,
    bookId,
    book: {
      pageCount: fakeBook.pageCount,
      id: fakeBook.id,
      title: fakeBook.title,
    },
    ...overrides,
  };
};

export const createFakeReadingGoal = (
  overrides?: Partial<ReadingGoal>,
): ReadingGoal => {
  const currentYear = new Date().getFullYear();
  return {
    id: "1",
    userId: "test-user-123",
    year: currentYear,
    goal: 20,
    ...overrides,
  };
};

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
): { db: PrismaClient; auth: AuthType; logger: Logger } {
  const clerkId = options.clerkId ?? "clerk-user-123";

  return {
    db: mockDb,
    auth: { userId: clerkId } as unknown as AuthType,
    logger: mockLogger,
  };
}

export function createFakeChartDataPoint(
  overrides: Partial<ChartDataPoint> = {},
): ChartDataPoint {
  const date = overrides.date ?? new Date();
  return {
    date,
    displayDate: formatRelativeDate(date),
    progress: 10,
    progressSinceLast: 10,
    comments: null,
    fullDate: date.toLocaleString(),
    originalEntry: createFakeReadingProgressWithProgressSinceLast({
      progress: 10,
      progressSinceLast: 10,
    }),
    ...overrides,
  } as ChartDataPoint;
}

export interface MockStorage {
  getItem: () => string | null;
  setItem: (_key: string, value: string) => void;
}
/**
 * Creates a mock storage object for testing localStorage-dependent code.
 * Returns an object with vi.fn() spies for getItem and setItem.
 *
 * @param initialValue - The initial value to return from getItem (simulates existing storage)
 */
export function createMockStorage(
  initialValue: string | null = null,
): MockStorage {
  let stored = initialValue;
  return {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, value: string) => {
      stored = value;
    }),
  };
}

/**
 * Creates a mock return value for tRPC's useQuery hook.
 * Use this when mocking trpc.*.useQuery in component/hook tests.
 *
 * Cast to `never` so it can be assigned to any useQuery mock without type errors.
 * This is a common pattern for test utilities where type safety is less critical.
 *
 * @param overrides - Override any default values
 */
export function createMockUseQueryReturn<TData = null>(
  overrides: Partial<{
    data: TData;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
  }> = {},
): never {
  return {
    data: null as TData,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as never;
}

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
): {
  caller: TCaller;
  mockDb: PrismaClient;
  mockLogger: Logger;
  mockUser: User;
  context: { db: PrismaClient; auth: AuthType; logger: Logger };
} {
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

/**
 * Creates a mock TRPC client error for testing error handlers.
 *
 * @param code - The TRPC error code (e.g., "NOT_FOUND", "FORBIDDEN")
 * @param message - Optional error message
 */
export function createMockTRPCError(
  code: string,
  message = "Error message",
): { message: string; data: { code: string } } {
  return {
    message,
    data: { code },
  };
}
