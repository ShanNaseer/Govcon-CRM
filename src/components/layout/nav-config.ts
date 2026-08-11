/**
 * Sidebar navigation model.
 *
 * Only Dashboard, Clients and Opportunities are implemented in this scaffold.
 * The remaining entries are declared with `implemented: false` so the shell shows
 * the full product structure while making it obvious which modules are still
 * placeholders — they render disabled instead of linking to a 404.
 */

export type NavItem = {
  label: string;
  href: string;
  implemented: boolean;
};

export type NavSection = {
  /** Undefined for the top-level group, which has no heading. */
  title?: string;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/", implemented: true },
      { label: "Tasks", href: "/tasks", implemented: false },
      { label: "Team", href: "/team", implemented: false },
      { label: "Reports", href: "/reports", implemented: false },
    ],
  },
  {
    title: "Discovery",
    items: [
      { label: "GovCon Opportunities", href: "/opportunities", implemented: true },
      { label: "My Queue", href: "/queue", implemented: false },
      { label: "Passed", href: "/passed", implemented: false },
    ],
  },
  {
    title: "CRM",
    items: [
      { label: "Leads", href: "/leads", implemented: false },
      { label: "Deals", href: "/deals", implemented: false },
      { label: "Clients", href: "/clients", implemented: true },
      { label: "Contacts", href: "/contacts", implemented: false },
    ],
  },
  {
    title: "Opportunities",
    items: [
      { label: "Opportunities", href: "/opportunities", implemented: true },
      { label: "Lifecycle Automations", href: "/automations", implemented: false },
      { label: "Pipeline Analytics", href: "/pipeline-analytics", implemented: false },
    ],
  },
  {
    title: "Bids & Compliance",
    items: [
      { label: "Proposals", href: "/proposals", implemented: false },
      { label: "Compliance Library", href: "/compliance", implemented: false },
    ],
  },
  {
    title: "Delivery",
    items: [
      { label: "Contracts", href: "/contracts", implemented: false },
      { label: "Projects", href: "/projects", implemented: false },
    ],
  },
];
