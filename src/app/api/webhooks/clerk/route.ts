import { NextRequest } from "next/server";

import { verifyWebhook } from "@clerk/nextjs/webhooks";

import { logger, performanceLogger } from "@/lib/logger";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);
    const { id } = evt.data;
    const eventType = evt.type;

    logger.info({ webhookId: id, eventType }, "Received Clerk webhook");

    if (eventType === "user.created") {
      const { id, email_addresses, first_name, last_name } = evt.data;

      const upsertUserTimer = performanceLogger(
        "DB: Upsert user from webhook",
        500,
        logger,
      );

      upsertUserTimer.start();
      await prisma.user.upsert({
        where: { clerkId: id },
        update: {},
        create: {
          clerkId: id,
          email: email_addresses[0].email_address,
          name: `${first_name} ${last_name}`,
        },
      });
      upsertUserTimer.end({ clerkId: id });

      logger.info(
        {
          clerkId: id,
          email: email_addresses[0].email_address,
          name: `${first_name} ${last_name}`,
        },
        "User created from webhook",
      );
    }

    return new Response("Webhook received", { status: 200 });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      "Failed to verify or process webhook",
    );
    return new Response("Error verifying webhook", { status: 400 });
  }
}
