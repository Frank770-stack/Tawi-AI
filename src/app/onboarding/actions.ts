"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { homePathFor, requireUser } from "@/lib/auth";
import { formValues } from "@/lib/form";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  orgType: z.enum(["FARM", "EXPORTER"], { error: "Choose farm or exporter." }),
  orgName: z.string().trim().min(2, "Enter your organization's name.").max(120),
  location: z.string().trim().max(120).optional(),
});

export type OnboardingState = { error?: string; values?: Record<string, string> };

export async function completeOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requireUser();
  if (user.organizationId) redirect(homePathFor(user));

  const parsed = schema.safeParse({
    name: formData.get("name"),
    orgType: formData.get("orgType"),
    orgName: formData.get("orgName"),
    location: formData.get("location") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: formValues(formData) };
  const { name, orgType, orgName, location } = parsed.data;

  await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: orgName,
        type: orgType,
        contactPerson: name,
        phone: user.phone,
        location: orgType === "FARM" ? location : null,
      },
    });
    // Guard against a double submit creating two organizations.
    const updated = await tx.user.updateMany({
      where: { id: user.id, organizationId: null },
      data: { name, organizationId: org.id },
    });
    if (updated.count === 0) throw new Error("Profile already completed");
  });

  redirect(orgType === "FARM" ? "/farm/setup" : "/exporter");
}
