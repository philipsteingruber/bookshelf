import { cn } from "@/lib/utils";

const sizeConfig = {
  sm: {
    iconSize: "size-12",
    padding: "p-4",
    gap: "gap-2",
    textSize: "text-xs",
    clamp: "line-clamp-2",
  },
  md: {
    iconSize: "size-16",
    padding: "p-6",
    gap: "gap-3",
    textSize: "text-sm",
    clamp: "line-clamp-3",
  },
  lg: {
    iconSize: "size-32",
    padding: "p-12",
    gap: "gap-6",
    textSize: "text-lg",
    clamp: "line-clamp-4",
  },
};

const BookCoverFallback = ({
  size,
  className,
  title,
}: {
  size: "sm" | "md" | "lg";
  title: string;
  className?: string;
}): React.ReactElement => {
  const config = sizeConfig[size];

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-linear-to-br from-slate-200 via-slate-300 to-slate-400",
        config.padding,
        className,
      )}
    >
      <div className={cn("flex flex-col items-center text-center", config.gap)}>
        <svg className={cn("text-slate-500", config.iconSize)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <p className={cn("font-medium text-slate-600", config.clamp, config.textSize)}>{title}</p>
      </div>
    </div>
  );
};

export default BookCoverFallback;
