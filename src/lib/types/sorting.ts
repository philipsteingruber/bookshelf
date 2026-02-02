import type { LucideIcon } from "lucide-react";

import type { ReadStatus } from "@/generated/prisma/enums";
import type { sortGroups } from "@/lib/constants";

export type SortItem = { Icon: LucideIcon; text: string; value: string };

export type SortOptions = (typeof sortGroups)[number]["items"][number]["value"];

export type StatusFilterOption = {
  Icon: LucideIcon;
  text: string;
  value: ReadStatus | "ALL_BOOKS";
};
