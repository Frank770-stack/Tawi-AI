import { redirect } from "next/navigation";
import { homePathFor, requireUser } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your profile · Tawi AI" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.organizationId) redirect(homePathFor(user));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <Logo />
      <h1 className="mt-8 text-2xl font-bold">Set up your profile</h1>
      <p className="mt-1 text-muted">Logged in as {formatPhone(user.phone)}</p>
      <div className="mt-6">
        <OnboardingForm />
      </div>
    </main>
  );
}
