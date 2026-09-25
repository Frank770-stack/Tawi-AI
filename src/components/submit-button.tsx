"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonVariant } from "./ui";

export function SubmitButton({
  children,
  pendingText = "Please wait…",
  variant = "primary",
  className = "w-full",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, className)}
    >
      {pending ? pendingText : children}
    </button>
  );
}
