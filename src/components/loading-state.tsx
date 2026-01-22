import BaseState from "./base-state";
import { Spinner } from "./ui/spinner";

const LoadingState = (): React.ReactElement => {
  return <BaseState Icon={Spinner} text="Loading..." />;
};

export default LoadingState;
