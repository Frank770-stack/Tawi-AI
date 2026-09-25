import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Tawi AI" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Link href="/" className="self-start">
        <Logo />
      </Link>
      <div className="mt-10">
        <h1 className="text-2xl font-bold">Log in with your phone</h1>
        <p className="mt-1 text-muted">Tawi is invite-only during the pilot.</p>
      </div>
      <div className="mt-6">
        <LoginForm />
      </div>
    </main>
  );
}
