import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";

export interface DashboardCardProps {
  header: string;
  value: number;
  footer: string;
  icon: LucideIcon;
  className?: string;
}

const DashboardCard = ({
  header,
  value,
  footer,
  icon: Icon,
  className,
}: DashboardCardProps) => {
  return (
    <Card className={cn("h-40 w-1/4", className)}>
      <CardContent className="flex h-full w-full items-start justify-between">
        <div className="flex flex-col items-start justify-between gap-y-4">
          <span className="text-xs font-semibold">{header}</span>
          <span className="text-4xl font-bold">{value}</span>
          <span className="text-xs">{footer}</span>
        </div>
        <Icon />
      </CardContent>
    </Card>
  );
};

export default DashboardCard;
