import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
      <Logo />
      <div className="mt-16">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-muted">That page doesn&apos;t exist, or it isn&apos;t yours to see.</p>
        <ButtonLink href="/" className="mt-6 w-full">
          Go to Tawi
        </ButtonLink>
      </div>
    </main>
  );
}
