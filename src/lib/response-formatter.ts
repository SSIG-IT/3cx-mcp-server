/**
 * Compact Response Formatter
 * Reduces response size for LLM context windows by selecting only essential fields
 * per entity type and providing metadata.
 */

export type EntityType =
  | "user"
  | "contact"
  | "call_history"
  | "active_call"
  | "queue"
  | "ring_group"
  | "department"
  | "trunk"
  | "event_log"
  | "forwarding_profile";

const SUMMARY_FIELDS: Record<EntityType, string[]> = {
  user: [
    "Id", "Number", "FirstName", "LastName", "DisplayName",
    "EmailAddress", "Mobile", "IsRegistered", "CurrentProfileName",
    "QueueStatus", "Enabled",
  ],
  contact: [
    "Id", "FirstName", "LastName", "CompanyName", "PhoneNumber",
    "Business", "Business2", "Mobile2", "Home", "Email", "Title",
    "Department", "ContactType",
  ],
  call_history: [
    "SegmentStartTime", "SegmentEndTime", "SrcDisplayName",
    "SrcCallerNumber", "DstDisplayName", "DstCallerNumber",
    "CallAnswered", "CallTime", "SegmentType",
  ],
  active_call: [
    "Id", "Caller", "Callee", "Status", "Duration",
    "LastChangeStatus", "Dn", "DnType",
  ],
  queue: [
    "Id", "Number", "Name", "IsRegistered", "PollingStrategy",
    "RingTimeout", "MaxWaitTime",
  ],
  ring_group: [
    "Id", "Number", "Name", "RingStrategy",
  ],
  department: [
    "Id", "Name", "Number", "Language", "TimeZoneId",
  ],
  trunk: [
    "Id", "Number", "Name", "IsOnline", "Direction",
    "SimultaneousCalls", "ExternalNumber",
  ],
  event_log: [
    "Id", "Type", "EventId", "Message",
  ],
  forwarding_profile: [
    "Name", "CustomName", "AcceptMultipleCalls", "RingMyMobile",
    "DisableRingGroupCalls", "NoAnswerTimeout",
    "AvailableRoute", "AwayRoute",
  ],
};

function pickFields(
  item: Record<string, unknown>,
  entityType: EntityType,
): Record<string, unknown> {
  const fields = SUMMARY_FIELDS[entityType];
  const compact: Record<string, unknown> = {};
  for (const field of fields) {
    if (item[field] !== undefined && item[field] !== null) {
      compact[field] = item[field];
    }
  }
  return compact;
}

export interface FormattedResponse {
  summary: {
    returned: number;
    total?: number;
    hasMore?: boolean;
    hint?: string;
  };
  items: Record<string, unknown>[];
}

/**
 * Format an OData response (with .value array) into a compact response.
 */
export function formatListResponse(
  data: unknown,
  entityType: EntityType,
  options?: { top?: number; skip?: number },
): FormattedResponse {
  const obj = data as Record<string, unknown>;
  const items = (obj?.value ?? obj) as Record<string, unknown>[];
  if (!Array.isArray(items)) {
    return { summary: { returned: 0 }, items: [] };
  }

  const compactItems = items.map((item) => pickFields(item, entityType));
  const top = options?.top;
  const hasMore = top !== undefined && items.length >= top;

  return {
    summary: {
      returned: compactItems.length,
      ...(hasMore !== undefined && { hasMore }),
      ...(hasMore && { hint: "Increase 'top' or use 'skip' for more results." }),
    },
    items: compactItems,
  };
}

/**
 * Format a single entity into a compact response.
 */
export function formatSingleResponse(
  data: unknown,
  entityType: EntityType,
): Record<string, unknown> {
  const item = data as Record<string, unknown>;
  return pickFields(item, entityType);
}

/**
 * Format a response as JSON text for MCP tool output.
 */
export function toMcpText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
