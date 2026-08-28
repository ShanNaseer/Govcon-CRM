import {
  BarChart3,
  Briefcase,
  Building2,
  CheckSquare,
  FileText,
  FolderKanban,
  Handshake,
  Inbox,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Shield,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";

/**
 * Sidebar navigation model — sections, order, labels and icons transcribed from
 * the Figma design.
 *
 * Only Dashboard, Clients and Opportunities are implemented in this scaffold.
 * The remaining entries are declared with `implemented: false` so the shell shows
 * the full product structure while making it obvious which modules are still
 * placeholders — they render disabled instead of linking to a 404.
 */

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  implemented: boolean;
  /**
   * Permission required to see this entry. Absent means every signed-in role sees
   * it. Filtering here is a courtesy — the route and its data enforce the same
   * permission server-side, which is what actually restricts access.
   */
  permission?: Permission;
  /**
   * Coral count pill from the design. Left unset throughout: the reference
   * prototype hard-coded a literal `12` on Tasks, and showing an invented count
   * on an unbuilt page would be worse than showing none. Populate once the
   * corresponding feature has a real number to report.
   */
  badge?: number;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Dashboard",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, implemented: true, permission: "dashboard:read" },
      { label: "Tasks", href: "/tasks", icon: CheckSquare, implemented: true, permission: "tasks:read" },
      { label: "Team", href: "/team", icon: Users, implemented: true, permission: "team:read" },
      {
        label: "Roles & Permissions",
        href: "/team/permissions",
        icon: ShieldCheck,
        implemented: true,
        // `team:read` and not `team:manage`, matching the page: someone who can see
        // the directory can see what each role is allowed, but only `team:manage`
        // makes the checkboxes editable.
        permission: "team:read",
      },
      { label: "Reports", href: "/reports", icon: BarChart3, implemented: false },
    ],
  },
  {
    title: "Discovery",
    items: [
      { label: "GovCon Opportunities", href: "/opportunities", icon: Inbox, implemented: true, permission: "opportunities:read" },
      {
        label: "My Queue",
        href: "/queue",
        icon: ListChecks,
        implemented: true,
        // `opportunities:read`, matching the inbox it draws from — the queue is a
        // filtered view of the same records, not a separate capability.
        permission: "opportunities:read",
      },
      { label: "Passed", href: "/passed", icon: XCircle, implemented: false },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: Users, implemented: false },
      { label: "Deals", href: "/deals", icon: Handshake, implemented: false },
      { label: "Clients", href: "/clients", icon: Building2, implemented: true, permission: "clients:read" },
      { label: "Contacts", href: "/contacts", icon: Users, implemented: false },
    ],
  },
  {
    title: "Opportunities",
    items: [
      { label: "Opportunities", href: "/opportunities", icon: Briefcase, implemented: true, permission: "opportunities:read" },
      { label: "Lifecycle Automations", href: "/automations", icon: Zap, implemented: false },
      { label: "Pipeline Analytics", href: "/pipeline-analytics", icon: TrendingUp, implemented: false },
    ],
  },
  {
    title: "Bids & Compliance",
    items: [
      { label: "Proposals", href: "/proposals", icon: FileText, implemented: false },
      { label: "Compliance Library", href: "/compliance", icon: Shield, implemented: false },
    ],
  },
  {
    title: "Delivery",
    items: [
      { label: "Contracts", href: "/contracts", icon: ScrollText, implemented: false },
      { label: "Projects", href: "/projects", icon: Briefcase, implemented: false },
      { label: "Programs", href: "/programs", icon: FolderKanban, implemented: false },
    ],
  },
];
