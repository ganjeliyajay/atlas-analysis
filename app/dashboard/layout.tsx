import { Suspense } from "react";
import DashboardAuth from "./DashboardAuth";
import DashboardClientLayout from "./DashboardClientLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div>Loading dashboard...</div>}>
      <DashboardAuth>
        <DashboardClientLayout>
          {children}
        </DashboardClientLayout>
      </DashboardAuth>
    </Suspense>
  );
}