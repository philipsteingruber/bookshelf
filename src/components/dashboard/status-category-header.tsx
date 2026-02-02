import Link from "next/link";

const StatusCategoryHeader = ({
  text,
  count,
  visibleCount,
  href,
}: {
  text: string;
  count: number;
  visibleCount: number;
  href: string;
}): React.ReactElement => {
  return (
    <Link
      className="mb-2 text-xl font-semibold underline decoration-dotted hover:underline lg:no-underline lg:decoration-solid"
      href={href}
    >
      {text}{" "}
      <span className="text-primary text-md font-normal">
        ({visibleCount >= count ? count : `${visibleCount} of ${count} shown`})
      </span>
    </Link>
  );
};

export default StatusCategoryHeader;
