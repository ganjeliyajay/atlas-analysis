
'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DateRangeOption, Project } from '@/types/analytics';

type ApiProject = Project & {
    eventCount?: number;
    platform?: string;
    description?: string | null;
    environment?: string;
};

export default function DashboardClientLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [mobileOpen, setMobileOpen] = useState(false);
    const [selectedRange, setSelectedRange] =
        useState<DateRangeOption>('30d');

    const [projects, setProjects] = useState<ApiProject[]>([]);
    const [selectedProject, setSelectedProject] =
        useState<ApiProject | null>(null);

    const [projectsLoading, setProjectsLoading] = useState(true);
    const [organizationName, setOrganizationName] =
        useState('Loading workspace...');

    const selectedProjectId = searchParams.get('projectId');

    // Load current organization
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

    // Load real projects from API
    useEffect(() => {
        let isMounted = true;

        async function loadProjects() {
            setProjectsLoading(true);

            try {
                const response = await fetch('/api/projects');

                if (!response.ok) {
                    throw new Error('Failed to load projects');
                }

                const data = await response.json();

                const fetchedProjects: ApiProject[] =
                    data.projects ?? [];

                if (!isMounted) return;

                setProjects(fetchedProjects);

                // Select the project from URL, or default to first project
                const projectFromUrl = selectedProjectId
                    ? fetchedProjects.find(
                        (project) => project.id === selectedProjectId,
                    )
                    : undefined;

                const initialProject =
                    projectFromUrl ?? fetchedProjects[0] ?? null;

                setSelectedProject(initialProject);

                // Keep project selection in the URL
                if (
                    initialProject &&
                    initialProject.id !== selectedProjectId
                ) {
                    const params = new URLSearchParams(
                        searchParams.toString(),
                    );

                    params.set('projectId', initialProject.id);

                    router.replace(
                        `${pathname}?${params.toString()}`,
                        { scroll: false },
                    );
                }
            } catch (error) {
                console.error('Projects fetch error:', error);

                if (isMounted) {
                    setProjects([]);
                    setSelectedProject(null);
                }
            } finally {
                if (isMounted) {
                    setProjectsLoading(false);
                }
            }
        }

        loadProjects();

        return () => {
            isMounted = false;
        };
    }, [selectedProjectId, pathname, router, searchParams]);

    // Handle project dropdown change
    function handleProjectChange(project: Project) {
        const selected = projects.find(
            (item) => item.id === project.id,
        );

        if (!selected) return;

        setSelectedProject(selected);

        const params = new URLSearchParams(
            searchParams.toString(),
        );

        params.set('projectId', selected.id);

        router.replace(
            `${pathname}?${params.toString()}`,
            { scroll: false },
        );
    }

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
                    projects={projects}
                    projectsLoading={projectsLoading}
                    selectedProject={selectedProject ?? undefined}
                    onProjectChange={handleProjectChange}
                    organizationName={organizationName}
                />

                <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}
