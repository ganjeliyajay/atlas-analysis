import { auth } from "@/auth";
import { redirect } from "next/navigation";
import DashboardClientLayout from "./DashboardClientLayout";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardClientLayout>
      {children}
    </DashboardClientLayout>
  );
}
