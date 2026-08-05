/**
 * Sidebar navigation config. Seven groups covering the full app surface:
 * Inventory, Networking, Cost & Optimization, Security & Compliance,
 * Monitoring, Tools, and the Dashboard root. Every view is fully
 * implemented — no stub flags anywhere.
 */

import {
  AlertTriangle,
  BarChart3,
  Bomb,
  Cloud,
  Coins,
  Database,
  DollarSign,
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
  Recycle,
  Route,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Wallet,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: Home }],
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
      { label: "Network Flow Analyzer", href: "/networking/flow", icon: Route },
    ],
  },
  {
    label: "Cost & Optimization",
    items: [
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
      { label: "Well-Architected Review", href: "/security/waf", icon: ShieldCheck },
      { label: "CIS Benchmark Audit", href: "/security/cis", icon: ListChecks },
      { label: "Blast Radius Analyzer", href: "/security/blast-radius", icon: Bomb },
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
      { label: "Resource Graph Explorer", href: "/tools/resource-graph", icon: Search },
      { label: "Technical Documentation", href: "/tools/docs", icon: FileText },
    ],
  },
];
