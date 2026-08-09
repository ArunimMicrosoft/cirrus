/**
 * Connectivity, resilience, and observability coverage audits.
 *
 * Rolls up three architect concerns:
 *   - Hybrid resilience: VPN / ExpressRoute gateway redundancy (single
 *     gateway = SPOF).
 *   - Outbound / SNAT risk: subnets relying on default SNAT with no NAT
 *     Gateway or explicit outbound rule — the notorious silent port
 *     exhaustion failure at scale.
 *   - Observability coverage: NSG flow logs, DDoS protection, and Bastion
 *     presence vs VMs with management ports exposed.
 *
 * Pure analysis over already-fetched config. No writes.
 */

export interface GatewayLite {
  id: string;
  name: string;
  kind: "Vpn" | "ExpressRoute" | string;
  /** Active-active or zone-redundant SKUs give redundancy. */
  redundant: boolean;
  connectionCount: number;
}

export interface OutboundSubnet {
  id: string;
  name: string;
  vnet: string;
  /** Effective outbound method. */
  method: "nat-gateway" | "lb-outbound-rule" | "public-ip" | "default-snat" | "unknown";
  /** Approx workload size — VMs in the subnet — for exhaustion risk. */
  workloadCount: number;
}

export interface CoverageInput {
  publicIpCount: number;
  ddosProtectedIpCount: number;
  nsgCount: number;
  nsgWithFlowLogs: number;
  bastionCount: number;
  vmsWithMgmtExposed: number;
}

export interface ResilienceFinding {
  kind: string;
  severity: "critical" | "warning" | "ok";
  detail: string;
}

export function auditGateways(gws: GatewayLite[]): ResilienceFinding[] {
  const out: ResilienceFinding[] = [];
  if (gws.length === 0) {
    out.push({ kind: "no-gateway", severity: "ok", detail: "No VPN/ExpressRoute gateways found — no hybrid connectivity to assess." });
    return out;
  }
  for (const g of gws) {
    if (!g.redundant) {
      out.push({
        kind: "gateway-spof",
        severity: "warning",
        detail: `${g.kind} gateway "${g.name}" is not active-active / zone-redundant — a single point of failure for hybrid traffic.`,
      });
    }
    if (g.connectionCount === 0) {
      out.push({
        kind: "gateway-idle",
        severity: "warning",
        detail: `Gateway "${g.name}" has no connections — paying for an unused gateway.`,
      });
    }
    if (g.redundant && g.connectionCount > 0) {
      out.push({ kind: "ok", severity: "ok", detail: `Gateway "${g.name}" is redundant with ${g.connectionCount} connection(s).` });
    }
  }
  return out;
}

export function auditOutbound(subnets: OutboundSubnet[]): ResilienceFinding[] {
  const out: ResilienceFinding[] = [];
  for (const s of subnets) {
    if (s.method === "default-snat" && s.workloadCount >= 5) {
      out.push({
        kind: "snat-exhaustion-risk",
        severity: "warning",
        detail: `Subnet "${s.name}" (${s.workloadCount} VMs) egresses via default SNAT — high-connection workloads can exhaust SNAT ports silently. Add a NAT Gateway.`,
      });
    }
  }
  if (out.length === 0) {
    out.push({ kind: "ok", severity: "ok", detail: "No subnets at obvious SNAT-exhaustion risk." });
  }
  return out;
}

export function auditCoverage(c: CoverageInput): ResilienceFinding[] {
  const out: ResilienceFinding[] = [];

  const flowPct = c.nsgCount > 0 ? c.nsgWithFlowLogs / c.nsgCount : 1;
  if (c.nsgCount > 0 && flowPct < 1) {
    out.push({
      kind: "flow-logs",
      severity: flowPct < 0.5 ? "warning" : "ok",
      detail: `${c.nsgWithFlowLogs}/${c.nsgCount} NSGs have flow logs enabled — gaps mean blind spots for traffic forensics.`,
    });
  }

  if (c.publicIpCount > 0) {
    const ddosPct = c.ddosProtectedIpCount / c.publicIpCount;
    out.push({
      kind: "ddos",
      severity: ddosPct === 0 ? "warning" : "ok",
      detail: `${c.ddosProtectedIpCount}/${c.publicIpCount} public IPs covered by a DDoS Protection Plan.`,
    });
  }

  if (c.vmsWithMgmtExposed > 0) {
    out.push({
      kind: "bastion",
      severity: "warning",
      detail:
        c.bastionCount > 0
          ? `${c.vmsWithMgmtExposed} VM(s) expose management ports directly despite Bastion being deployed — route admin access through Bastion.`
          : `${c.vmsWithMgmtExposed} VM(s) expose management ports and no Bastion is deployed.`,
    });
  } else {
    out.push({ kind: "ok", severity: "ok", detail: "No VMs expose management ports directly." });
  }

  return out;
}
