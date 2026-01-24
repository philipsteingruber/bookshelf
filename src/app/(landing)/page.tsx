import { redirect } from "next/navigation";

import { auth } from "@clerk/nextjs/server";

const Page = async (): Promise<React.ReactElement> => {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-2">
      Landing
    </div>
  );
};

export default Page;
