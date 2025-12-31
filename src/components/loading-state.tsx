import { Spinner } from "./ui/spinner";

const LoadingState = () => {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Spinner className="size-25" />
      <span className="mt-4 text-2xl italic">Loading...</span>
    </div>
  );
};

export default LoadingState;
