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
    "StartTime", "SourceDisplayName", "SourceCallerId",
    "DestinationDisplayName", "DestinationCallerId",
    "Answered", "TalkingDuration", "Direction", "Status", "Reason",
    "MainCallHistoryId",
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

export function pickFields(
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
 * If a total is available (via options.count or @odata.count), hasMore is exact;
 * otherwise it falls back to a top-based heuristic.
 */
export function formatListResponse(
  data: unknown,
  entityType: EntityType,
  options?: { top?: number; skip?: number; count?: number },
): FormattedResponse {
  const obj = data as Record<string, unknown>;
  const items = (obj?.value ?? obj) as Record<string, unknown>[];
  if (!Array.isArray(items)) {
    return { summary: { returned: 0 }, items: [] };
  }

  const compactItems = items.map((item) => pickFields(item, entityType));
  const returned = compactItems.length;

  const odataCount = obj?.["@odata.count"];
  const total =
    options?.count ?? (typeof odataCount === "number" ? odataCount : undefined);
  const skip = options?.skip ?? 0;

  let hasMore: boolean | undefined;
  if (total !== undefined) {
    hasMore = skip + returned < total;
  } else if (options?.top !== undefined) {
    hasMore = returned >= options.top;
  }

  return {
    summary: {
      returned,
      ...(total !== undefined && { total }),
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
