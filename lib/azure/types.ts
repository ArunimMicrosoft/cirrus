/**
 * Shared Azure resource type definitions used by both Pages Functions and the
 * frontend. Every field is declared as it appears in ARM REST responses
 * (camelCase, nested `properties`).
 */

export interface AzureSubscription {
  subscriptionId: string;
  displayName: string;
  tenantId: string;
  state: string;
  isHome: boolean;
}

export interface ArmListResponse<T> {
  value: T[];
  nextLink?: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string> | null;
  properties?: { provisioningState?: string };
}

export interface VirtualMachine {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string> | null;
  properties: {
    hardwareProfile?: { vmSize?: string };
    storageProfile?: {
      osDisk?: {
        osType?: "Linux" | "Windows";
        name?: string;
        diskSizeGB?: number;
        managedDisk?: { id?: string };
      };
      imageReference?: {
        publisher?: string;
        offer?: string;
        sku?: string;
        version?: string;
      };
      dataDisks?: Array<{ name?: string; diskSizeGB?: number; lun?: number }>;
    };
    networkProfile?: {
      networkInterfaces?: Array<{ id: string; properties?: { primary?: boolean } }>;
    };
    instanceView?: {
      statuses?: Array<{ code?: string; displayStatus?: string }>;
    };
    availabilitySet?: { id: string };
  };
  zones?: string[];
  resources?: unknown[];
}

export interface StorageAccount {
  id: string;
  name: string;
  location: string;
  kind?: string;
  sku?: { name: string; tier: string };
  tags?: Record<string, string> | null;
  properties?: {
    accessTier?: string;
    supportsHttpsTrafficOnly?: boolean;
    allowBlobPublicAccess?: boolean;
    networkAcls?: { defaultAction?: string };
    primaryEndpoints?: Record<string, string>;
  };
}

export interface NetworkSecurityGroup {
  id: string;
  name: string;
  location: string;
  properties?: {
    securityRules?: Array<{
      name: string;
      properties: {
        priority: number;
        direction: "Inbound" | "Outbound";
        access: "Allow" | "Deny";
        protocol: string;
        sourceAddressPrefix?: string;
        sourceAddressPrefixes?: string[];
        sourcePortRange?: string;
        destinationAddressPrefix?: string;
        destinationPortRange?: string;
        destinationPortRanges?: string[];
      };
    }>;
    networkInterfaces?: Array<{ id: string }>;
    subnets?: Array<{ id: string }>;
  };
}

export interface PublicIpAddress {
  id: string;
  name: string;
  location: string;
  sku?: { name: string; tier?: string };
  properties?: {
    ipAddress?: string;
    publicIPAllocationMethod?: string;
    ipConfiguration?: { id: string };
  };
}

export interface AppService {
  id: string;
  name: string;
  location: string;
  kind?: string;
  properties?: {
    state?: string;
    defaultHostName?: string;
    httpsOnly?: boolean;
    serverFarmId?: string;
  };
}

export interface SqlServer {
  id: string;
  name: string;
  location: string;
  properties?: {
    version?: string;
    state?: string;
    fullyQualifiedDomainName?: string;
  };
}

export interface Disk {
  id: string;
  name: string;
  location: string;
  managedBy?: string | null;
  sku?: { name: string; tier?: string };
  properties?: {
    diskSizeGB?: number;
    timeCreated?: string;
  };
}

export interface ApplicationGateway {
  id: string;
  name: string;
  location: string;
  sku?: { name: string; tier: string; capacity?: number };
  properties?: {
    operationalState?: string;
    provisioningState?: string;
    frontendIPConfigurations?: Array<{ id: string }>;
    backendAddressPools?: Array<{ id: string; properties?: { backendAddresses?: unknown[] } }>;
    httpListeners?: Array<unknown>;
    webApplicationFirewallConfiguration?: { enabled?: boolean; firewallMode?: string };
  };
}

export interface AdvisorRecommendation {
  id: string;
  name: string;
  type: string;
  properties?: {
    category?: string;
    impact?: string;
    risk?: string;
    resourceMetadata?: { resourceId?: string };
    shortDescription?: { problem?: string; solution?: string };
    lastUpdated?: string;
  };
}

export interface KeyVault {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string> | null;
  properties?: {
    tenantId?: string;
    sku?: { name?: string; family?: string };
    vaultUri?: string;
    enableSoftDelete?: boolean;
    enablePurgeProtection?: boolean;
    enableRbacAuthorization?: boolean;
    accessPolicies?: Array<unknown>;
    networkAcls?: { defaultAction?: string };
    softDeleteRetentionInDays?: number;
  };
}

export interface RecoveryVault {
  id: string;
  name: string;
  location: string;
  properties?: { provisioningState?: string };
}

export interface NetworkInterface {
  id: string;
  name: string;
  location: string;
  properties?: {
    virtualMachine?: { id: string };
    networkSecurityGroup?: { id: string };
    ipConfigurations?: Array<{
      id: string;
      properties?: {
        privateIPAddress?: string;
        subnet?: { id: string };
        publicIPAddress?: { id: string };
      };
    }>;
  };
}

export interface VirtualNetwork {
  id: string;
  name: string;
  location: string;
  properties?: {
    addressSpace?: { addressPrefixes?: string[] };
    subnets?: Array<{
      id: string;
      name: string;
      properties?: {
        addressPrefix?: string;
        networkSecurityGroup?: { id: string };
      };
    }>;
    virtualNetworkPeerings?: Array<unknown>;
  };
}
