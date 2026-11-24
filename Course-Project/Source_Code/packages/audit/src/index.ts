export interface AuditEvent {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export function createAuditEvent(
  tenantId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
): AuditEvent {
  return {
    tenantId,
    userId,
    action,
    resourceType,
    resourceId,
    metadata,
    timestamp: new Date().toISOString()
  };
}
