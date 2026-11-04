
import { Suspense } from "react";
import { connection } from "next/server";

import DashboardAuth from "./DashboardAuth";
import DashboardClientLayout from "./DashboardClientLayout";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardContent>
        {children}
      </DashboardContent>
    </Suspense>
  );
}

async function DashboardContent({
  children,
}: DashboardLayoutProps) {
  await connection();

  return (
    <DashboardAuth>
      <DashboardClientLayout>
        {children}
      </DashboardClientLayout>
    </DashboardAuth>
  );
}