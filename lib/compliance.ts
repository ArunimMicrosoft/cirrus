/**
 * Compliance crosswalk — maps the read-only checks Meridian performs to the
 * control IDs of the major frameworks. This is a coverage reference (which of
 * your controls a Meridian view can evidence), not a pass/fail audit result —
 * the live pass/fail comes from running the linked check against your data.
 *
 * Mappings are indicative and based on publicly documented control
 * relationships; treat them as a starting point for your own audit crosswalk.
 * Static content — no data, no network.
 */

export interface ComplianceControl {
  /** The control area / what Meridian actually inspects. */
  area: string;
  /** The Meridian view that evidences it. */
  check: { label: string; href: string };
  /** Framework control identifiers. */
  cis: string;
  mcsb: string;
  nist: string;
  iso: string;
  soc2: string;
  pci: string;
}

export const FRAMEWORKS: { key: keyof Omit<ComplianceControl, "area" | "check">; label: string; full: string }[] = [
  { key: "cis", label: "CIS", full: "CIS Microsoft Azure Foundations" },
  { key: "mcsb", label: "MCSB", full: "Microsoft Cloud Security Benchmark" },
  { key: "nist", label: "NIST", full: "NIST SP 800-53 Rev.5" },
  { key: "iso", label: "ISO", full: "ISO/IEC 27001:2022 Annex A" },
  { key: "soc2", label: "SOC 2", full: "AICPA SOC 2 (Trust Services)" },
  { key: "pci", label: "PCI", full: "PCI DSS v4.0" },
];

export const COMPLIANCE_CONTROLS: ComplianceControl[] = [
  {
    area: "No remote-admin (SSH/RDP) open to the Internet",
    check: { label: "Attack Surface", href: "/security/attack-surface" },
    cis: "6.1, 6.2",
    mcsb: "NS-1",
    nist: "SC-7",
    iso: "A.8.20",
    soc2: "CC6.6",
    pci: "1.3, 1.4",
  },
  {
    area: "Network segmentation between subnets/tiers",
    check: { label: "Network Topology", href: "/intelligence/topology" },
    cis: "6.x",
    mcsb: "NS-1, NS-2",
    nist: "SC-7(5)",
    iso: "A.8.22",
    soc2: "CC6.6",
    pci: "1.2, 1.3",
  },
  {
    area: "Storage: secure transfer required, no public blob",
    check: { label: "CIS Benchmark", href: "/security/cis" },
    cis: "3.1, 3.7",
    mcsb: "DP-3",
    nist: "SC-8, SC-28",
    iso: "A.8.24",
    soc2: "CC6.7",
    pci: "4.2, 3.5",
  },
  {
    area: "SQL: public network access disabled, TLS enforced",
    check: { label: "CIS Benchmark", href: "/security/cis" },
    cis: "4.1.x",
    mcsb: "NS-2, DP-4",
    nist: "SC-7, SC-8",
    iso: "A.8.20",
    soc2: "CC6.6",
    pci: "1.3, 4.2",
  },
  {
    area: "Key Vault: soft-delete, RBAC, restricted network",
    check: { label: "Key Vault Audit", href: "/security/key-vault" },
    cis: "8.x",
    mcsb: "DP-7, IM-8",
    nist: "SC-12, SC-28",
    iso: "A.8.24",
    soc2: "CC6.1",
    pci: "3.6, 3.7",
  },
  {
    area: "Least privilege — limited standing Owner/Contributor",
    check: { label: "RBAC Review", href: "/security/rbac" },
    cis: "1.21, 1.23",
    mcsb: "PA-1, PA-7",
    nist: "AC-2, AC-6",
    iso: "A.5.15, A.8.2",
    soc2: "CC6.1, CC6.3",
    pci: "7.1, 7.2",
  },
  {
    area: "WAF enabled on internet-facing app gateways",
    check: { label: "Well-Architected Review", href: "/security/waf" },
    cis: "9.x",
    mcsb: "NS-6",
    nist: "SC-7(8)",
    iso: "A.8.20",
    soc2: "CC6.6",
    pci: "6.4.2",
  },
  {
    area: "TLS certificate lifecycle (no lapsed certs)",
    check: { label: "Certificate Expiry", href: "/security/certificates" },
    cis: "—",
    mcsb: "DP-3",
    nist: "SC-12, SC-17",
    iso: "A.8.24",
    soc2: "CC6.7",
    pci: "4.2.1",
  },
  {
    area: "Change tracking / configuration drift review",
    check: { label: "Cloud Drift Detector", href: "/tools/drift" },
    cis: "—",
    mcsb: "PV-6, GS-6",
    nist: "CM-2, CM-3",
    iso: "A.8.9, A.8.32",
    soc2: "CC8.1",
    pci: "6.5, 11.5",
  },
  {
    area: "Backup coverage & recoverability",
    check: { label: "VM Backups", href: "/monitoring/backups" },
    cis: "—",
    mcsb: "BR-1, BR-2",
    nist: "CP-9",
    iso: "A.8.13",
    soc2: "A1.2",
    pci: "—",
  },
  {
    area: "Dangling DNS / subdomain-takeover exposure",
    check: { label: "Network Intelligence", href: "/intelligence/network" },
    cis: "—",
    mcsb: "NS-8",
    nist: "SC-7, SI-4",
    iso: "A.8.20",
    soc2: "CC7.1",
    pci: "11.3",
  },
  {
    area: "Blast-radius / lateral-movement analysis",
    check: { label: "Blast Radius Analyzer", href: "/security/blast-radius" },
    cis: "—",
    mcsb: "NS-1, IR-4",
    nist: "CA-8, RA-5",
    iso: "A.8.8",
    soc2: "CC7.1",
    pci: "11.4",
  },
];
