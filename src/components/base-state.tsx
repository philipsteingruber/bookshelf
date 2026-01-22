import Link from "next/link";

import type { LucideIcon } from "lucide-react";

import type { Spinner } from "./ui/spinner";

interface Props {
  Icon: LucideIcon | typeof Spinner;
  text: string;
  linkText?: string;
  href?: string;
}

const BaseState = ({
  Icon,
  text,
  linkText,
  href,
}: Props): React.ReactElement => {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <Icon className="size-25" />
      <span className="mt-4 text-2xl italic">{text}</span>
      {linkText && href && (
        <Link href={href} className="text-lg italic hover:underline">
          {linkText}
        </Link>
      )}
    </div>
  );
};

export default BaseState;
