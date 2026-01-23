const StatusCategoryHeader = ({
  text,
  count,
  visibleCount,
}: {
  text: string;
  count: number;
  visibleCount: number;
}): React.ReactElement => {
  return (
    <p className="mb-2 text-xl font-semibold">
      {text}{" "}
      <span className="text-primary text-md font-normal">
        ({visibleCount >= count ? count : `${visibleCount} of ${count}`})
      </span>
    </p>
  );
};

export default StatusCategoryHeader;
