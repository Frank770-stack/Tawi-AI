import { requireOrg } from "@/lib/auth";
import { nairobiDateISO } from "@/lib/format";
import { Card } from "@/components/ui";
import { NewOrderForm } from "./new-order-form";

export const metadata = { title: "New order · Tawi AI" };

export default async function NewOrderPage() {
  await requireOrg("EXPORTER");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">New order</h1>
      <Card>
        <NewOrderForm today={nairobiDateISO(new Date())} />
      </Card>
    </div>
  );
}
