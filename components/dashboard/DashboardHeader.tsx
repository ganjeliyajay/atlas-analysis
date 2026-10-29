
'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
    Menu,
    Search,
    Bell,
    ChevronDown,
    Calendar,
    Layers,
    Check,
    Settings,
    Shield,
    LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';

import { PROJECTS } from '@/lib/dummy-data';
import { DateRangeOption, Project } from '@/types/analytics';
import { SearchModal } from './SearchModal';
import { NotificationsPopover } from './NotificationsPopover';
import { cn } from '@/lib/utils';

interface DashboardHeaderProps {
    onOpenMobileMenu: () => void;
    selectedRange?: DateRangeOption;
    onRangeChange?: (range: DateRangeOption) => void;
    selectedProject?: Project;
    onProjectChange?: (project: Project) => void;
    organizationName?: string;
}

export function DashboardHeader({
    onOpenMobileMenu,
    selectedRange = '30d',
    onRangeChange,
    selectedProject = PROJECTS[0],
    onProjectChange,
    organizationName = 'Workspace',
}: DashboardHeaderProps) {
    const pathname = usePathname();

    const [searchOpen, setSearchOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    const [profileName, setProfileName] = useState('Loading...');
    const [profileEmail, setProfileEmail] = useState('');

    // Load logged-in user details
    useEffect(() => {
        let isMounted = true;

        async function loadUser() {
            try {
                const response = await fetch('/api/user/current');

                if (!response.ok) {
                    throw new Error('Failed to load user');
                }

                const data = await response.json();

                if (isMounted) {
                    setProfileName(data.user?.name ?? 'User');
                    setProfileEmail(data.user?.email ?? '');
                }
            } catch (error) {
                console.error('User fetch error:', error);

                if (isMounted) {
                    setProfileName('User');
                    setProfileEmail('');
                }
            }
        }

        loadUser();

        return () => {
            isMounted = false;
        };
    }, []);

    // Derive title from pathname
    const getPageInfo = () => {
        if (pathname === '/dashboard') {
            return {
                title: 'Overview',
                breadcrumb: 'Analytics / Overview',
            };
        }

        if (pathname?.startsWith('/dashboard/live')) {
            return {
                title: 'Live Events',
                breadcrumb: 'Analytics / Live Feed',
            };
        }

        if (pathname?.startsWith('/dashboard/events')) {
            return {
                title: 'Events Catalog',
                breadcrumb: 'Analytics / Events',
            };
        }

        if (pathname?.startsWith('/dashboard/users')) {
            return {
                title: 'Users & Profiles',
                breadcrumb: 'Analytics / Users',
            };
        }

        if (pathname?.startsWith('/dashboard/pages')) {
            return {
                title: 'Pages & Views',
                breadcrumb: 'Analytics / Pages',
            };
        }

        if (pathname?.startsWith('/dashboard/funnels')) {
            return {
                title: 'Funnel Analytics',
                breadcrumb: 'Analytics / Funnels',
            };
        }

        if (pathname?.startsWith('/dashboard/retention')) {
            return {
                title: 'Retention Heatmap',
                breadcrumb: 'Analytics / Retention',
            };
        }

        if (pathname?.startsWith('/dashboard/projects')) {
            return {
                title: 'Projects & Websites',
                breadcrumb: 'Configuration / Projects',
            };
        }

        if (pathname?.startsWith('/dashboard/api-keys')) {
            return {
                title: 'API Keys',
                breadcrumb: 'Configuration / API Keys',
            };
        }

        if (pathname?.startsWith('/dashboard/installation')) {
            return {
                title: 'SDK Installation',
                breadcrumb: 'Configuration / Integration',
            };
        }

        if (pathname?.startsWith('/dashboard/settings')) {
            return {
                title: 'Workspace Settings',
                breadcrumb: 'Settings / General',
            };
        }

        return {
            title: 'Analytics',
            breadcrumb: 'Dashboard',
        };
    };

    const { title, breadcrumb } = getPageInfo();

    const dateRangeLabels: Record<DateRangeOption, string> = {
        today: 'Today',
        '7d': 'Last 7 days',
        '30d': 'Last 30 days',
        '90d': 'Last 90 days',
        custom: 'Custom Range',
    };

    const initials = profileName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');

    return (
        <>
            <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-800/80 bg-[#090D16]/95 px-4 sm:px-6 backdrop-blur-md">
                {/* Left: Mobile Toggle & Page Title */}
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onOpenMobileMenu}
                        className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                        aria-label="Open navigation"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    <div className="min-w-0">
                        <div className="hidden sm:block text-[11px] font-medium text-slate-400">
                            {breadcrumb}
                        </div>

                        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-white leading-tight">
                            {title}
                        </h1>
                    </div>
                </div>

                {/* Right: Controls & Global Actions */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {/* Workspace name */}
                    <div className="hidden xl:flex flex-col min-w-0 max-w-[180px]">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                            Workspace
                        </span>

                        <span
                            className="truncate text-xs font-medium text-slate-300"
                            title={organizationName}
                        >
                            {organizationName}
                        </span>
                    </div>

                    {/* Project Selector */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setProjectMenuOpen(!projectMenuOpen);
                                setRangeMenuOpen(false);
                                setProfileMenuOpen(false);
                                setNotificationsOpen(false);
                            }}
                            className="flex items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors"
                        >
                            <Layers className="h-3.5 w-3.5 text-indigo-400 shrink-0" />

                            <span className="hidden sm:inline font-semibold truncate max-w-[120px]">
                                {selectedProject.name}
                            </span>

                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>

                        {projectMenuOpen && (
                            <div className="absolute right-0 top-10 z-30 w-56 rounded-xl border border-slate-700 bg-[#0F172A] p-1.5 shadow-2xl">
                                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">
                                    Select Project
                                </div>

                                {PROJECTS.map((project) => (
                                    <button
                                        key={project.id}
                                        onClick={() => {
                                            onProjectChange?.(project);
                                            setProjectMenuOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors',
                                            project.id === selectedProject.id
                                                ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                                                : 'text-slate-300 hover:bg-slate-800',
                                        )}
                                    >
                                        <div className="truncate text-left">
                                            <div className="font-medium text-white truncate">
                                                {project.name}
                                            </div>

                                            <div className="text-[10px] text-slate-400 truncate">
                                                {project.websiteUrl}
                                            </div>
                                        </div>

                                        {project.id === selectedProject.id && (
                                            <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 ml-2" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Date Range Selector */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setRangeMenuOpen(!rangeMenuOpen);
                                setProjectMenuOpen(false);
                                setProfileMenuOpen(false);
                                setNotificationsOpen(false);
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:bg-slate-800 transition-colors"
                        >
                            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />

                            <span className="truncate">
                                {dateRangeLabels[selectedRange]}
                            </span>

                            <ChevronDown className="h-3 w-3 text-slate-400" />
                        </button>

                        {rangeMenuOpen && (
                            <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-slate-700 bg-[#0F172A] p-1.5 shadow-2xl">
                                {(
                                    [
                                        'today',
                                        '7d',
                                        '30d',
                                        '90d',
                                        'custom',
                                    ] as DateRangeOption[]
                                ).map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => {
                                            onRangeChange?.(range);
                                            setRangeMenuOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors',
                                            range === selectedRange
                                                ? 'bg-indigo-600 text-white font-medium'
                                                : 'text-slate-300 hover:bg-slate-800',
                                        )}
                                    >
                                        <span>{dateRangeLabels[range]}</span>

                                        {range === selectedRange && (
                                            <Check className="h-3 w-3" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Search Trigger */}
                    <button
                        onClick={() => setSearchOpen(true)}
                        className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition-colors"
                        title="Search (Cmd+K)"
                    >
                        <Search className="h-3.5 w-3.5" />

                        <span className="hidden lg:inline text-[11px]">
                            Quick search...
                        </span>

                        <kbd className="hidden lg:inline-block rounded bg-slate-800 px-1 text-[10px] text-slate-400 border border-slate-700">
                            ⌘K
                        </kbd>
                    </button>

                    {/* Notifications Button */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setNotificationsOpen(!notificationsOpen);
                                setProjectMenuOpen(false);
                                setRangeMenuOpen(false);
                                setProfileMenuOpen(false);
                            }}
                            className="relative p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            title="Notifications"
                        >
                            <Bell className="h-4 w-4" />

                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-indigo-500 animate-ping" />

                            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-indigo-500" />
                        </button>

                        <NotificationsPopover
                            isOpen={notificationsOpen}
                            onClose={() => setNotificationsOpen(false)}
                        />
                    </div>

                    {/* Profile Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setProfileMenuOpen(!profileMenuOpen);
                                setProjectMenuOpen(false);
                                setRangeMenuOpen(false);
                                setNotificationsOpen(false);
                            }}
                            aria-label="Open profile menu"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 text-xs font-bold text-white shadow-sm ring-2 ring-slate-800 hover:ring-indigo-500 transition-all"
                        >
                            {initials || 'U'}
                        </button>

                        {profileMenuOpen && (
                            <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-slate-700 bg-[#0F172A] p-1.5 shadow-2xl">
                                <div className="px-2.5 py-2 border-b border-slate-800">
                                    <div className="text-xs font-semibold text-white truncate">
                                        {profileName}
                                    </div>

                                    <div className="text-[10px] text-slate-400 truncate">
                                        {profileEmail}
                                    </div>
                                </div>

                                <div className="py-1">
                                    <Link
                                        href="/dashboard/settings"
                                        onClick={() => setProfileMenuOpen(false)}
                                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                                    >
                                        <Settings className="h-3.5 w-3.5 text-slate-400" />
                                        <span>Workspace Settings</span>
                                    </Link>

                                    <Link
                                        href="/ops"
                                        onClick={() => setProfileMenuOpen(false)}
                                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 hover:bg-slate-800 hover:text-amber-200 transition-colors"
                                    >
                                        <Shield className="h-3.5 w-3.5 text-amber-400" />
                                        <span>Platform Admin Console</span>
                                    </Link>
                                </div>

                                <div className="pt-1 border-t border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            signOut({
                                                callbackUrl: '/login',
                                            })
                                        }
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                                    >
                                        <LogOut className="h-3.5 w-3.5 text-rose-400" />
                                        <span>Sign Out</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Global Search Modal */}
            <SearchModal
                isOpen={searchOpen}
                onClose={() => setSearchOpen(false)}
            />
        </>
    );
}
