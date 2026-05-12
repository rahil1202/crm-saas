import { notFound, redirect } from "next/navigation";

/**
 * Catch-all fallback for unknown top-level routes.
 *
 * IMPORTANT: This should NEVER match /dashboard/* paths because those have
 * their own explicit page.tsx files. If you're seeing 404s on dashboard routes,
 * delete the .next folder and restart the dev server.
 */
export default async function UnknownRoutePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;

  // Safety guard: if this catch-all somehow matches a dashboard route,
  // return 404 instead of redirecting to login (which masks the real issue).
  if (slug[0] === "dashboard") {
    notFound();
  }

  redirect("/auth/login");
}
