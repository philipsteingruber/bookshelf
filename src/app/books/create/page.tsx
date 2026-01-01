import CreateBookForm from "@/components/books/create-form";
import { RedirectToSignIn, useAuth } from "@clerk/nextjs";

const Page = () => {
  const { isSignedIn } = useAuth();

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center">
      <CreateBookForm />
    </div>
  );
};

export default Page;
