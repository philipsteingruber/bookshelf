import type { LucideIcon } from "lucide-react";
import {
  HistoryIcon,
  ImageIcon,
  ImportIcon,
  TrendingUpIcon,
} from "lucide-react";

interface Feature {
  Icon: LucideIcon;
  title: string;
  description: string;
}
const features: Feature[] = [
  {
    Icon: ImageIcon,
    title: "Book Management with Cover Images",
    description:
      "View your library using a sortable/filterable view with full resolution cover images",
  },
  {
    Icon: TrendingUpIcon,
    title: "Reading Progress Tracking",
    description: "Log your progress and visualize your reading pace",
  },
  {
    Icon: ImportIcon,
    title: "Data Import from Goodreads",
    description: "Get started quickly by importing book data from GoodReads",
  },
  {
    Icon: HistoryIcon,
    title: "Look Back on Your Past Progress",
    description:
      "Keep your library organized and keep track of which books you've read, and when",
  },
];

const FeaturesSection = (): React.ReactElement => {
  return (
    <div className="flex flex-col items-center justify-center gap-y-8">
      <h3 className="text-primary text-4xl font-semibold">What You Get</h3>
      {features.map((item) => (
        <div
          key={item.title}
          className="bg border-primary flex w-full max-w-[900px] items-center justify-center gap-x-4 rounded-md border-2 px-2 py-3 lg:gap-x-8 lg:px-0"
        >
          <item.Icon className="text-primary size-12 lg:size-20" />
          <div className="flex w-full flex-col justify-between gap-y-2 lg:w-[700px]">
            <span className="text-primary text-xl">{item.title}</span>
            <span className="text-lg">{item.description}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FeaturesSection;
