import CreateBookForm from "@/components/books/create-form";
import { RedirectToSignIn } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

const Page = async () => {
  const user = await currentUser();

  if (!user) {
    return <RedirectToSignIn />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <CreateBookForm />
    </div>
  );
};

export default Page;
