import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { env } from "@/env";
import type { User } from "@/generated/prisma/client";
import { logger } from "@/lib/common/logger";
import prisma from "@/lib/prisma";

/**
 * Shared preamble for every /api/automations/* route: Bearer-token auth
 * against AUTOMATION_API_KEY (not Clerk — there's no browser session for a
 * server-to-server caller) plus resolution of the single configured user
 * via CALIBRE_SYNC_USER_EMAIL, the same "which user" convention
 * scripts/sync-calibre.ts already uses.
 *
 * Extracted when the second automations route (book-recency) was added —
 * these ~25 lines were otherwise going to be copy-pasted verbatim, which
 * is exactly how two routes' auth quietly drift apart.
 */

type AutomationAuthResult = { ok: true; user: User } | { ok: false; response: Response };

export const resolveAutomationUser = async (req: NextRequest, routeName: string): Promise<AutomationAuthResult> => {
  const auth = req.headers.get("authorization");
  const expected = env.AUTOMATION_API_KEY;
  if (!expected || auth !== `Bearer ${expected}`) {
    logger.warn(`Automation ${routeName}: unauthorized request`);
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userEmail = env.CALIBRE_SYNC_USER_EMAIL;
  if (!userEmail) {
    logger.error(`Automation ${routeName}: CALIBRE_SYNC_USER_EMAIL not set`);
    return { ok: false, response: NextResponse.json({ error: "Not configured" }, { status: 500 }) };
  }

  const user = await prisma.user.findUnique({ where: { email: userEmail } });
  if (!user) {
    logger.error({ userEmail }, `Automation ${routeName}: configured user not found`);
    return { ok: false, response: NextResponse.json({ error: "User not found" }, { status: 500 }) };
  }

  return { ok: true, user };
};
