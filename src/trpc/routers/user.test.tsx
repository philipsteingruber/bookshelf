import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeReadingGoal, createMockCaller } from "@/lib/test-utils";
import { userRouter } from "@/trpc/routers/user";

describe("userRouter", () => {
  beforeEach(() => vi.clearAllMocks());
  describe("setReadingGoal", () => {
    it("should upsert reading goal with correct userId and year", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeGoal = createFakeReadingGoal();
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      await caller.setReadingGoal(1);

      expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_year: {
              userId: mockUser.id,
              year: new Date().getFullYear(),
            },
          },
        }),
      );
    });

    it("should reject non-positive numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoal(-1)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("should reject non-integer numbers", async () => {
      const { caller } = createMockCaller(userRouter);

      await expect(caller.setReadingGoal(0.5)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  describe("getReadingGoal", () => {
    it("should upsert reading goal with correct userId and year", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      const fakeGoal = createFakeReadingGoal();
      vi.mocked(mockDb.readingGoal.upsert).mockResolvedValue(fakeGoal);

      await caller.getReadingGoal();

      expect(mockDb.readingGoal.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_year: {
              userId: mockUser.id,
              year: new Date().getFullYear(),
            },
          },
        }),
      );
    });
  });

  describe("getReadingGoalHistory", () => {
    it("should query goals with correct userId and orderBy", async () => {
      const { mockDb, caller, mockUser } = createMockCaller(userRouter);

      vi.mocked(mockDb.readingGoal.findMany).mockResolvedValue([]);

      await caller.getReadingGoalHistory();

      expect(mockDb.readingGoal.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        orderBy: { year: "desc" },
      });
    });
  });
});
