/**
 * Sidebar navigation config. Seven groups covering the full app surface:
 * Inventory, Networking, Cost & Optimization, Security & Compliance,
 * Monitoring, Tools, and the Dashboard root. Every view is fully
 * implemented — no stub flags anywhere.
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bomb,
  Boxes,
  Cable,
  CalendarClock,
  ClipboardCheck,
  Cloud,
  Coins,
  Database,
  DollarSign,
  FileBarChart2,
  FileDiff,
  FileText,
  Gauge,
  GitCompare,
  HardDrive,
  Home,
  KeyRound,
  LayoutGrid,
  LineChart,
  ListChecks,
  Network,
  PiggyBank,
  Recycle,
  Route,
  ScrollText,
  Search,
  Server,
  Share2,
  Shield,
  ShieldCheck,
  Radar,
  Users,
  Trash2,
  TrendingUp,
  Wallet,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Routes whose data can only come from a live Azure connection (billing +
 * telemetry) and therefore can't work in File/Offline mode. Used to hide them
 * from the sidebar and gate them in the app shell when a file is the source.
 */
export const LIVE_ONLY_PREFIXES = [
  "/signals",
  "/intelligence/cost",
  "/intelligence/workload",
  "/cost/",
  "/monitoring/",
  "/tools/resource-graph",
];

export function isLiveOnlyPath(path: string): boolean {
  return LIVE_ONLY_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Home },
      { label: "Intelligence Signals", href: "/signals", icon: Activity },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Cost Intelligence", href: "/intelligence/cost", icon: TrendingUp },
      { label: "Network Intelligence", href: "/intelligence/network", icon: Route },
      { label: "IP Address Management", href: "/intelligence/ipam", icon: Network },
      { label: "Network Topology", href: "/intelligence/topology", icon: Share2 },
      { label: "Workload Intelligence", href: "/intelligence/workload", icon: Boxes },
      { label: "Governance Intelligence", href: "/intelligence/governance", icon: ScrollText },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Resource Groups", href: "/inventory/resource-groups", icon: LayoutGrid },
      { label: "Virtual Machines", href: "/inventory/virtual-machines", icon: Server },
      { label: "App Services", href: "/inventory/app-services", icon: Cloud },
      { label: "Storage Accounts", href: "/inventory/storage-accounts", icon: HardDrive },
      { label: "SQL Servers", href: "/inventory/sql-servers", icon: Database },
    ],
  },
  {
    label: "Networking",
    items: [
      { label: "Network Security Groups", href: "/networking/nsg", icon: Shield },
      { label: "Public IP Addresses", href: "/networking/public-ips", icon: Network },
      { label: "Application Gateways", href: "/networking/app-gateways", icon: Waypoints },
      { label: "ExpressRoute Circuits", href: "/networking/expressroute", icon: Cable },
      { label: "Network Flow Analyzer", href: "/networking/flow", icon: Route },
    ],
  },
  {
    label: "Cost & Optimization",
    items: [
      { label: "Savings Summary", href: "/cost/savings", icon: PiggyBank },
      { label: "Azure Advisor (Cost)", href: "/cost/advisor", icon: DollarSign },
      { label: "RI & Quotas", href: "/cost/ri-quotas", icon: Coins },
      { label: "Cost Attribution", href: "/cost/attribution", icon: Wallet },
      { label: "VM Right-Sizing", href: "/cost/right-sizing", icon: Gauge },
      { label: "Orphan Resources", href: "/cost/orphans", icon: Trash2 },
      { label: "Multi-Sub Summary", href: "/cost/multi-sub", icon: BarChart3 },
    ],
  },
  {
    label: "Security & Compliance",
    items: [
      { label: "Attack Surface", href: "/security/attack-surface", icon: Radar },
      { label: "Well-Architected Review", href: "/security/waf", icon: ShieldCheck },
      { label: "CIS Benchmark Audit", href: "/security/cis", icon: ListChecks },
      { label: "Blast Radius Analyzer", href: "/security/blast-radius", icon: Bomb },
      { label: "RBAC & Over-Privilege", href: "/security/rbac", icon: Users },
      { label: "Certificate Expiry", href: "/security/certificates", icon: CalendarClock },
      { label: "Compliance Crosswalk", href: "/security/compliance", icon: ClipboardCheck },
      { label: "Key Vault Audit", href: "/security/key-vault", icon: KeyRound },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { label: "VM Backups", href: "/monitoring/backups", icon: Recycle },
      { label: "Azure Monitor Alerts", href: "/monitoring/alerts", icon: AlertTriangle },
      { label: "Azure Monitor Metrics", href: "/monitoring/metrics", icon: LineChart },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Cloud Drift Detector", href: "/tools/drift", icon: GitCompare },
      { label: "Change Review (diff)", href: "/tools/diff", icon: FileDiff },
      { label: "Executive Reports", href: "/tools/reports", icon: FileBarChart2 },
      { label: "Resource Graph Explorer", href: "/tools/resource-graph", icon: Search },
      { label: "Technical Documentation", href: "/tools/docs", icon: FileText },
    ],
  },
];
