import { redirect } from "next/navigation";

export default function UnknownRoutePage() {
  redirect("/auth/login");
}
