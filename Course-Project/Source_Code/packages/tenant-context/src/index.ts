import type { TenantContext, UserRole } from "@exam-system/contracts";

export interface MembershipRecord {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface TenantContextResolver {
  resolveFromSession(
    userId: string,
    requestedTenantId?: string
  ): Promise<TenantContext | null>;
}

export class SessionTenantContextResolver implements TenantContextResolver {
  private membershipStore: Map<string, MembershipRecord[]>;

  constructor(mockMemberships?: MembershipRecord[]) {
    this.membershipStore = new Map();
    if (mockMemberships) {
      for (const m of mockMemberships) {
        const list = this.membershipStore.get(m.userId) || [];
        list.push(m);
        this.membershipStore.set(m.userId, list);
      }
    }
  }

  async resolveFromSession(
    userId: string,
    requestedTenantId?: string
  ): Promise<TenantContext | null> {
    if (!userId) {
      return null;
    }

    const memberships = this.membershipStore.get(userId) || [];
    if (memberships.length === 0) {
      return null;
    }

    // 1. If explicit tenant requested, verify user actually has membership in that tenant
    if (requestedTenantId) {
      const match = memberships.find((m) => m.tenantId === requestedTenantId);
      if (!match) {
        return null; // Deny: user does not belong to requested tenant
      }
      return {
        tenantId: match.tenantId,
        userId: match.userId,
        role: match.role,
        membershipId: match.membershipId,
      };
    }

    // 2. If single membership, resolve safely
    if (memberships.length === 1 && memberships[0]) {
      const m = memberships[0];
      return {
        tenantId: m.tenantId,
        userId: m.userId,
        role: m.role,
        membershipId: m.membershipId,
      };
    }

    // 3. Ambiguous multi-tenant user without explicit selection fails closed
    return null;
  }
}
