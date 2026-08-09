/**
 * Load Balancer / Application Gateway configuration audit.
 *
 * Flags the silent misconfigurations that cause outages or leave protection
 * effectively off: empty backend pools, rules with no health probe, App
 * Gateway listeners with no routing rule, and WAF running in Detection
 * (log-only) rather than Prevention mode.
 *
 * Pure config analysis over already-fetched resources. No writes.
 */

export interface LoadBalancerLite {
  id: string;
  name: string;
  /** Backend pool → member count. */
  backendPools: Array<{ name: string; members: number }>;
  /** LB rule → whether it references a health probe. */
  rules: Array<{ name: string; hasProbe: boolean }>;
  probeCount: number;
}

export interface AppGatewayLite {
  id: string;
  name: string;
  backendPools: Array<{ name: string; members: number }>;
  listenerCount: number;
  ruleCount: number;
  wafEnabled: boolean;
  wafMode?: string; // "Prevention" | "Detection"
}

export type AuditSeverity = "critical" | "warning" | "ok";

export interface AuditFinding {
  resource: string;
  kind: string;
  severity: AuditSeverity;
  detail: string;
}

export function auditLoadBalancers(lbs: LoadBalancerLite[]): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const lb of lbs) {
    const empty = lb.backendPools.filter((p) => p.members === 0);
    if (empty.length > 0) {
      out.push({
        resource: lb.name,
        kind: "empty-backend-pool",
        severity: "critical",
        detail: `${empty.length} backend pool(s) have zero members — traffic to them black-holes: ${empty.map((p) => p.name).join(", ")}.`,
      });
    }
    const noProbe = lb.rules.filter((r) => !r.hasProbe);
    if (noProbe.length > 0) {
      out.push({
        resource: lb.name,
        kind: "rule-without-probe",
        severity: "warning",
        detail: `${noProbe.length} rule(s) have no health probe — unhealthy members keep receiving traffic.`,
      });
    }
    if (empty.length === 0 && noProbe.length === 0) {
      out.push({ resource: lb.name, kind: "ok", severity: "ok", detail: "Backend pools populated; every rule has a probe." });
    }
  }
  return out;
}

export function auditAppGateways(gws: AppGatewayLite[]): AuditFinding[] {
  const out: AuditFinding[] = [];
  for (const gw of gws) {
    const empty = gw.backendPools.filter((p) => p.members === 0);
    if (empty.length > 0) {
      out.push({
        resource: gw.name,
        kind: "empty-backend-pool",
        severity: "critical",
        detail: `${empty.length} backend pool(s) have no members.`,
      });
    }
    if (gw.listenerCount > 0 && gw.ruleCount === 0) {
      out.push({
        resource: gw.name,
        kind: "listener-without-rule",
        severity: "critical",
        detail: "Listeners exist but no routing rules — requests have nowhere to go.",
      });
    }
    if (gw.wafEnabled && gw.wafMode && gw.wafMode.toLowerCase() !== "prevention") {
      out.push({
        resource: gw.name,
        kind: "waf-detection-only",
        severity: "warning",
        detail: `WAF is in "${gw.wafMode}" mode — it logs attacks but does not block them. Switch to Prevention to actually protect.`,
      });
    }
    if (!gw.wafEnabled) {
      out.push({
        resource: gw.name,
        kind: "no-waf",
        severity: "warning",
        detail: "No Web Application Firewall enabled on this gateway.",
      });
    }
    if (empty.length === 0 && gw.ruleCount > 0 && (!gw.wafEnabled || (gw.wafMode ?? "").toLowerCase() === "prevention")) {
      out.push({ resource: gw.name, kind: "ok", severity: "ok", detail: "Backends populated, rules present, WAF in Prevention (or intentionally off)." });
    }
  }
  return out;
}
