/**
 * Registry of the actual algorithms Meridian runs. This is a branding + trust
 * asset: every intelligence feature names the peer-reviewed technique behind
 * it, so buyers can see it's real math — not an LLM wrapper.
 *
 * Single source of truth. Referenced by:
 *   - the intelligence pages (an interactive "what's powering this" explainer),
 *   - the marketing site ("Under the hood"),
 *   - the docs + handbook (technical reference tables).
 *
 * Every entry carries BOTH plain-English copy (plainName / what / why) for
 * end users and the precise technical fields (name / role / field) for the
 * audit-minded reader. Nothing here fetches or writes — it is static content.
 */

export interface Algorithm {
  /** Precise technical name, e.g. "Holt-Winters". Kept for the audit trail. */
  name: string;
  /** Friendly, jargon-free label shown to end users, e.g. "Spend forecast". */
  plainName: string;
  /** One-line technical description (reference tables). */
  role: string;
  /** Plain English: what it actually does, no jargon, 1-2 sentences. */
  what: string;
  /** Plain English: why a user should care — the practical payoff. */
  why: string;
  /** Discipline tag for grouping on the marketing page. */
  field:
    | "Time series"
    | "Unsupervised ML"
    | "Statistics"
    | "Graph theory"
    | "Optimization"
    | "Formal methods";
}

/** Keyed by feature area so a page can pull exactly its algorithms. */
export const ALGORITHMS = {
  costForecast: {
    name: "Holt-Winters",
    plainName: "Spend forecast",
    role: "Triple exponential smoothing for growth forecasting with prediction intervals",
    what: "Reads your recent daily Azure spend, learns the everyday level plus any weekly rhythm (weekdays usually cost more than weekends), and projects the next 30 days as a best-to-worst range rather than a single guess.",
    why: "You get a realistic idea of next month's bill before it lands, so a creeping spike shows up as a trend you can act on early.",
    field: "Time series",
  },
  theilSen: {
    name: "Theil-Sen",
    plainName: "Trend line (spike-proof)",
    role: "Robust regression for quota-exhaustion projection, resistant to outliers",
    what: "Draws the underlying trend through bumpy numbers by taking the median slope across every pair of points, so one freak day can't tilt the whole line.",
    why: "Gives a trustworthy 'you'll run out around this date' estimate for things like IP space or quotas, even when the day-to-day data is noisy.",
    field: "Statistics",
  },
  riOptimizer: {
    name: "Break-even optimization",
    plainName: "Reservation savings",
    role: "Per-group reservation vs PAYG cost minimization",
    what: "For each group of similar resources it compares paying on-demand against buying a 1- or 3-year reservation, and only suggests a reservation when it truly pays for itself.",
    why: "Shows the real yearly money you'd save by committing — without pushing you to over-commit to capacity you won't use.",
    field: "Optimization",
  },
  binPacking: {
    name: "First-Fit-Decreasing",
    plainName: "Server consolidation",
    role: "Bin-packing for VM consolidation planning",
    what: "Takes your VMs, sorts them biggest-first, and fits them onto as few hosts as possible while leaving safe headroom — the way you'd pack big boxes before small ones.",
    why: "Reveals how many machines you could safely retire by consolidating, and the spend that goes away with them.",
    field: "Optimization",
  },
  intervalAlgebra: {
    name: "CIDR/port interval algebra",
    plainName: "Dead firewall-rule finder",
    role: "Set subsumption to prove which NSG rules can never match",
    what: "Treats each firewall (NSG) rule as ranges of addresses and ports, then checks whether a higher-priority rule already fully covers a lower one.",
    why: "Points out rules that can never fire, so you can trim rule sets and avoid a false sense of protection from rules that do nothing.",
    field: "Formal methods",
  },
  dijkstra: {
    name: "Dijkstra shortest path",
    plainName: "Shortest attack path",
    role: "Shortest attack path from the Internet to sensitive resources",
    what: "Builds a map of what-can-reach-what and finds the fewest hops from the public internet to a sensitive resource.",
    why: "Shows the easiest route an attacker could take to reach your crown jewels, so you know which single link to cut first.",
    field: "Graph theory",
  },
  tarjan: {
    name: "Tarjan articulation points",
    plainName: "Single points of failure",
    role: "Detects single points of failure in the resource graph",
    what: "Analyses how your resources connect and flags the ones that, if they failed, would split your environment into disconnected pieces.",
    why: "Highlights the load-bearing parts of your architecture that most deserve redundancy or a backup plan.",
    field: "Graph theory",
  },
  pageRank: {
    name: "PageRank (power iteration)",
    plainName: "Resource criticality",
    role: "Eigenvector centrality over the resource dependency graph",
    what: "Ranks every resource by how much the rest of the estate ultimately leans on it — the same idea search engines use to rank pages, applied to your infrastructure's dependency links.",
    why: "Tells you which handful of resources carry the most weight, so you protect and add redundancy to the ones whose failure would ripple the furthest — not just the noisy ones.",
    field: "Graph theory",
  },
  kMeans: {
    name: "k-means++",
    plainName: "Workload grouping",
    role: "Unsupervised workload clustering with silhouette-selected k",
    what: "Groups resources that behave alike — similar CPU, memory and traffic patterns — into natural clusters, and automatically picks how many groups fit the data best.",
    why: "Turns hundreds of individual resources into a handful of clear profiles you can reason about and right-size together.",
    field: "Unsupervised ML",
  },
  distributionSizing: {
    name: "Percentile distribution sizing",
    plainName: "Right-sizing",
    role: "Right-sizing to p99 + headroom with Gaussian throttle-risk",
    what: "Looks at busy-time usage (the 99th percentile, not the misleading average), adds a safety buffer, and estimates the chance of throttling at each size.",
    why: "Recommends a size that comfortably handles real peaks without paying for capacity that sits idle.",
    field: "Statistics",
  },
  cusum: {
    name: "CUSUM",
    plainName: "Early drift alarm",
    role: "Control-chart changepoint detection on metric baselines",
    what: "Watches a metric against its normal baseline and adds up small deviations, so a slow, steady drift trips an alarm before any single reading looks alarming.",
    why: "Catches gradual problems — a slow memory leak, creeping cost — that fixed thresholds miss until it's too late.",
    field: "Time series",
  },
  pelt: {
    name: "PELT",
    plainName: "Behaviour-change detector",
    role: "Exact change-in-mean segmentation with a BIC penalty",
    what: "Scans a metric's history and pinpoints the exact moments its typical level shifted, with a built-in penalty that avoids crying wolf over normal wobble.",
    why: "Tells you when something changed — a deploy, a config tweak, a new workload — so you can line it up with what happened.",
    field: "Time series",
  },
  patternMining: {
    name: "Pattern mining",
    plainName: "Naming & tag consistency",
    role: "Infers naming signatures and tag conventions, flags outliers",
    what: "Learns the naming and tagging conventions your team actually uses, then flags the resources that break the pattern.",
    why: "Surfaces the odd-one-out resources — usually the untagged, mislabeled or forgotten ones that cause billing and ownership headaches.",
    field: "Unsupervised ML",
  },
  madAnomaly: {
    name: "MAD z-score",
    plainName: "Outlier detector (spike-proof)",
    role: "Median-absolute-deviation anomaly flagging, robust to spikes",
    what: "Measures how far each value sits from the median using a spike-resistant spread, and flags the genuine outliers.",
    why: "Finds abnormal resources or costs without being thrown off by a single one-off spike.",
    field: "Statistics",
  },

  /* -------- Networking algorithms -------- */
  cidrOverlap: {
    name: "CIDR interval overlap",
    plainName: "Address collision finder",
    role: "Detects subnet/VNet address-space collisions that break peering",
    what: "Checks every VNet and subnet address range against the others to see whether any of them overlap.",
    why: "Overlapping address space quietly breaks peering and VPN connections — this catches the clashes before they cause an outage.",
    field: "Formal methods",
  },
  subnetCapacity: {
    name: "Subnet capacity accounting",
    plainName: "IP capacity & runway",
    role: "Usable-vs-allocated IP math with exhaustion forecasting",
    what: "Counts usable versus used IP addresses in each subnet (allowing for the five addresses Azure reserves) and projects when you'll run out.",
    why: "Warns you before a subnet fills up and starts blocking new deployments.",
    field: "Statistics",
  },
  reachabilityMatrix: {
    name: "Reachability matrix",
    plainName: "Who-can-reach-whom",
    role: "Subnet-to-subnet allowed-port matrix from NSG + route + peering",
    what: "For every pair of subnets it works out whether one can reach the other and on which ports, by reading the firewall rules (including Azure's built-in defaults) and the network connectivity.",
    why: "Gives you the real, effective exposure between subnets — the map behind the topology graph and the segmentation score.",
    field: "Formal methods",
  },
  segmentationScore: {
    name: "Graph density scoring",
    plainName: "Segmentation score",
    role: "Zero-trust segmentation score from the reachability graph",
    what: "Measures how much of your network can talk to everything else. A flat network where everything reaches everything scores low; tight isolation scores high.",
    why: "A single 0-100 health number for how well your network limits the blast radius if one subnet is compromised.",
    field: "Graph theory",
  },
  peeringGraph: {
    name: "Connected components + BFS",
    plainName: "Peering map & gaps",
    role: "VNet peering topology, transitivity gaps, and island detection",
    what: "Maps how your VNets are peered, finds isolated islands, and spots pairs that both connect to a hub yet can't reach each other (peering doesn't chain automatically).",
    why: "Explains why two networks that 'should' talk don't, and shows where the real hub of your network is.",
    field: "Graph theory",
  },
  longestPrefixMatch: {
    name: "Longest-prefix match",
    plainName: "Effective-route check",
    role: "Effective-route evaluation and black-hole route detection",
    what: "Applies Azure's routing rule — the most specific matching route wins — to work out where traffic actually goes, and flags routes that send traffic into a dead end.",
    why: "Catches custom routes that silently drop or misdirect traffic, a common cause of 'it worked yesterday' outages.",
    field: "Formal methods",
  },
  privateLinkCoverage: {
    name: "Exposure set analysis",
    plainName: "Public exposure check",
    role: "PaaS public-exposure vs private-endpoint coverage join",
    what: "Cross-references which managed (PaaS) services are reachable over the public internet against which ones have a private endpoint instead.",
    why: "Shows which databases and storage accounts are still open to the internet when they could be private-only.",
    field: "Formal methods",
  },
  danglingDns: {
    name: "Reference-integrity join",
    plainName: "Dangling DNS / takeover risk",
    role: "Dangling DNS / subdomain-takeover detection across zones",
    what: "Matches DNS records against the resources they point to and flags records aimed at things that no longer exist.",
    why: "A leftover record can let someone else claim that name and impersonate you — this finds those subdomain-takeover risks.",
    field: "Graph theory",
  },
  cidrMerge: {
    name: "Interval coalescing",
    plainName: "Firewall-rule tidy-up",
    role: "Merges adjacent NSG rule ranges and finds redundant rules",
    what: "Merges firewall rules that cover neighbouring address or port ranges and spots ones made redundant by others.",
    why: "Simpler rule sets are easier to review and far less likely to hide a costly mistake.",
    field: "Formal methods",
  },
} as const satisfies Record<string, Algorithm>;

export type AlgorithmKey = keyof typeof ALGORITHMS;

/** Resolve a list of keys to their Algorithm records. */
export function getAlgorithms(keys: AlgorithmKey[]): Algorithm[] {
  return keys.map((k) => ALGORITHMS[k]);
}
