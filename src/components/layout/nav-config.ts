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
  TrendingUp,
  Users,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
      { label: "Dashboard", href: "/", icon: LayoutDashboard, implemented: true },
      { label: "Tasks", href: "/tasks", icon: CheckSquare, implemented: true },
      { label: "Team", href: "/team", icon: Users, implemented: false },
      { label: "Reports", href: "/reports", icon: BarChart3, implemented: false },
    ],
  },
  {
    title: "Discovery",
    items: [
      { label: "GovCon Opportunities", href: "/opportunities", icon: Inbox, implemented: true },
      { label: "My Queue", href: "/queue", icon: ListChecks, implemented: false },
      { label: "Passed", href: "/passed", icon: XCircle, implemented: false },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: Users, implemented: false },
      { label: "Deals", href: "/deals", icon: Handshake, implemented: false },
      { label: "Clients", href: "/clients", icon: Building2, implemented: true },
      { label: "Contacts", href: "/contacts", icon: Users, implemented: false },
    ],
  },
  {
    title: "Opportunities",
    items: [
      { label: "Opportunities", href: "/opportunities", icon: Briefcase, implemented: true },
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
