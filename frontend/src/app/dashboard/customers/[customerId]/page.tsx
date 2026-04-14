import { redirect } from "next/navigation";

export default async function CustomerRedirectPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  redirect(`/dashboard/contacts/${customerId}`);
}
