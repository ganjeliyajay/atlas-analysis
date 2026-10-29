
'use client';

import React, { useEffect, useState } from 'react';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { PROJECTS } from '@/lib/dummy-data';
import { DateRangeOption, Project } from '@/types/analytics';

export default function DashboardClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [selectedRange, setSelectedRange] =
        useState<DateRangeOption>('30d');
    const [selectedProject, setSelectedProject] =
        useState<Project>(PROJECTS[0]);

    const [organizationName, setOrganizationName] =
        useState('Loading workspace...');

    useEffect(() => {
        let isMounted = true;

        async function loadOrganization() {
            try {
                const response = await fetch('/api/organization/current');

                if (!response.ok) {
                    throw new Error('Failed to load organization');
                }

                const data = await response.json();

                if (isMounted) {
                    setOrganizationName(
                        data.organization?.name ?? 'No workspace',
                    );
                }
            } catch (error) {
                console.error('Organization fetch error:', error);

                if (isMounted) {
                    setOrganizationName('Workspace unavailable');
                }
            }
        }

        loadOrganization();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="flex min-h-screen bg-[#090D16] text-slate-100">
            <DashboardSidebar
                mobileOpen={mobileOpen}
                onMobileClose={() => setMobileOpen(false)}
            />

            <div className="flex flex-1 flex-col min-w-0">
                <DashboardHeader
                    onOpenMobileMenu={() => setMobileOpen(true)}
                    selectedRange={selectedRange}
                    onRangeChange={setSelectedRange}
                    selectedProject={selectedProject}
                    onProjectChange={setSelectedProject}
                    organizationName={organizationName}
                />

                <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
