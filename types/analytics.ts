export type DateRangeOption = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member';
  plan: 'free' | 'pro' | 'enterprise';
  membersCount: number;
}

export interface Project {
  id: string;
  name: string;
  websiteUrl: string;
  platform: 'Next.js' | 'React' | 'JavaScript' | 'Node.js' | 'Mobile';
  status: 'active' | 'inactive' | 'setup_required';
  createdAt: string;
  eventCount: number;
  lastActivity: string;
  description: string;
  environment: 'production' | 'staging' | 'development';
}

export interface KpiMetric {
  title: string;
  value: string;
  numericValue: number;
  change: number; // percentage e.g. 12.5 or -3.2
  trend: 'up' | 'down' | 'neutral';
  previousPeriodValue: string;
  sparkline: number[];
  description: string;
}

export interface TimeseriesPoint {
  date: string;
  label: string;
  activeUsers: number;
  eventVolume: number;
  sessions: number;
  pageViews: number;
}

export interface LiveEvent {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  project: string;
  timestamp: string; // ISO
  relativeTime: string;
  type: 'track' | 'page' | 'identify' | 'custom';
  status: 'success' | 'warn' | 'error';
  properties: Record<string, string | number | boolean | null>;
}

export interface EventItem {
  id: string;
  name: string;
  userId: string;
  userEmail: string;
  project: string;
  timestamp: string;
  type: string;
  category: string;
  propertiesCount: number;
  properties: Record<string, string | number | boolean | null>;
  browser: string;
  os: string;
  country: string;
  ip: string;
}

export interface UserActivityEvent {
  id: string;
  name: string;
  timestamp: string;
  page: string;
  properties?: Record<string, string | number | boolean>;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  sessionsCount: number;
  status: 'active' | 'inactive' | 'churned';
  country: string;
  device: string;
  browser: string;
  initialReferrer: string;
  topPages: { url: string; visits: number }[];
  timeline: {
    id: string;
    action: string;
    timestamp: string;
    icon: string;
  }[];
  recentEvents: UserActivityEvent[];
}

export interface PageViewMetric {
  url: string;
  title: string;
  views: number;
  uniqueUsers: number;
  bounceRate: number; // percentage
  avgTimeOnPage: string; // "2m 45s"
  trend: number;
}

export interface FunnelStep {
  id: string;
  order: number;
  eventName: string;
  stepName: string;
  users: number;
  conversionFromFirst: number; // %
  conversionFromPrevious: number; // %
  dropOffRate: number; // %
  avgDuration: string;
}

export interface FunnelData {
  id: string;
  name: string;
  description: string;
  conversionRate: number;
  totalUsers: number;
  dropOffRate: number;
  conversionWindow: string;
  steps: FunnelStep[];
}

export interface RetentionCohort {
  cohortDate: string;
  totalUsers: number;
  periods: (number | null)[]; // percentages for week 0, week 1, ...
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  project: string;
  projectId: string;
  createdAt: string;
  lastUsed: string;
  status: 'active' | 'revoked';
  permissions: 'read_write' | 'read_only' | 'ingest_only';
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Admin' | 'Viewer';
  status: 'Active' | 'Pending';
  avatarInitials: string;
  joinedDate: string;
}

export interface TenantAdminRecord {
  id: string;
  tenantName: string;
  ownerName: string;
  ownerEmail: string;
  tier: 'Free' | 'Pro' | 'Enterprise';
  status: 'Active' | 'Suspended' | 'Provisioning';
  createdAt: string;
  eventVolume: number;
  eventLimit: number;
  remainingQuota: number;
  usagePercentage: number;
  projectsCount: number;
  region: string;
}

