import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import { z } from "zod";

type PlannedTool = {
  intent: string;
  recommendedTool: string;
  arguments: Record<string, unknown>;
  confidence: "high" | "medium" | "low";
  destructive: boolean;
  missingArguments: string[];
  notes: string[];
  alternativeTools?: string[];
};

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function extractFirstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function extractDate(text: string): string | undefined {
  return extractFirstMatch(text, [/\b(20\d{2}-\d{2}-\d{2})\b/i]);
}

function extractExtension(text: string): string | undefined {
  return extractFirstMatch(text, [
    /(?:extension|ext\.?|nebenstelle|durchwahl)\s*[:#]?\s*(\d{2,6})/i,
  ]);
}

function extractQueue(text: string): string | undefined {
  return extractFirstMatch(text, [
    /(?:queue|warteschlange|ringgroup|ring group|ringgruppe)\s*[:#]?\s*([^\s,.;]+)/i,
  ]);
}

function extractEmail(text: string): string | undefined {
  return extractFirstMatch(text, [
    /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i,
  ]);
}

function extractPhone(text: string): string | undefined {
  const matches = text.match(/(?:\+?\d[\d\s./()-]{5,}\d)/g);
  return matches?.[0]?.trim();
}

function extractQuoted(text: string): string | undefined {
  return extractFirstMatch(text, [
    /"([^"]+)"/,
    /'([^']+)'/,
  ]);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractSearchPhrase(request: string): string | undefined {
  const quoted = extractQuoted(request);
  if (quoted) return normalizeWhitespace(quoted);

  const value = extractFirstMatch(request, [
    /(?:find|finde|search|suche|lookup|show|zeige|list|liste|wer ist|who is|who has|welcher kontakt|which contact)\s+(.+)/i,
  ]);

  if (!value) return undefined;

  const cleaned = normalizeWhitespace(
    value
      .replace(/\b(today|heute|now|jetzt|recent|neueste|latest|missed calls?|verpasste[nr]? anrufe?)\b/gi, "")
      .replace(/\b(queue|warteschlange|user|benutzer|contact|kontakt|extension|nebenstelle)\b/gi, "")
      .replace(/[?.!,;:]+$/g, ""),
  );

  return cleaned || undefined;
}

function detectScope(text: string, explicitDate?: string): "today" | "last_24_hours" | "all_recent" {
  if (explicitDate) return "today";

  if (includesAny(text, ["last 24", "24h", "24 h", "letzte 24", "letzten 24"])) {
    return "last_24_hours";
  }

  if (includesAny(text, ["today", "heute", "heutige", "heutigen"])) {
    return "today";
  }

  return "all_recent";
}

function extractForwardingProfile(text: string): string | undefined {
  const profiles = [
    "available",
    "away",
    "out of office",
    "custom 1",
    "custom 2",
  ];

  const normalized = text.toLowerCase();
  const found = profiles.find((profile) => normalized.includes(profile));
  if (found) return found === "available"
    ? "Available"
    : found === "away"
      ? "Away"
      : found === "out of office"
        ? "Out of office"
        : found === "custom 1"
          ? "Custom 1"
          : "Custom 2";

  if (normalized.includes("verfügbar")) return "Available";
  if (normalized.includes("abwesend")) return "Away";
  if (normalized.includes("außer haus") || normalized.includes("outofoffice")) return "Out of office";
  return undefined;
}

function plan3cxRequest(request: string, config: Config): PlannedTool {
  const normalized = request.toLowerCase();
  const date = extractDate(request);
  const scope = detectScope(normalized, date);
  const timezone = config.TCX_TIMEZONE ?? "UTC";
  const extension = extractExtension(request);
  const queue = extractQueue(request);
  const email = extractEmail(request);
  const phone = extractPhone(request);
  const searchPhrase = extractSearchPhrase(request);

  if (includesAny(normalized, ["missed", "verpasst", "verpasste", "unbeantwortet"])) {
    return {
      intent: "recent_missed_calls",
      recommendedTool: "get_recent_missed_calls",
      arguments: {
        scope,
        date,
        timezone,
        extension,
        queue,
        top: 20,
      },
      confidence: "high",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use this for missed-call questions before falling back to raw call history.",
        "The timezone is injected by the MCP server so 'today' uses the PBX/business timezone.",
      ],
      alternativeTools: ["get_recent_calls", "get_call_logs"],
    };
  }

  if (includesAny(normalized, ["call", "calls", "anruf", "anrufe", "telefonat", "telefonate"])) {
    return {
      intent: "recent_calls",
      recommendedTool: "get_recent_calls",
      arguments: {
        scope,
        date,
        timezone,
        extension,
        queue,
        top: 20,
      },
      confidence: includesAny(normalized, ["today", "heute", "recent", "latest", "neueste"]) ? "high" : "medium",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use this for normal recent-call questions.",
        "Prefer this over raw get_call_logs unless you need OData control.",
      ],
      alternativeTools: ["get_call_logs"],
    };
  }

  if (includesAny(normalized, ["online users", "registered users", "wer ist online", "registrierte benutzer", "registrierte nebenstellen", "online"])) {
    return {
      intent: "online_users",
      recommendedTool: "get_online_users",
      arguments: {
        top: 100,
      },
      confidence: "high",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use this for presence questions.",
      ],
      alternativeTools: ["list_users", "get_extension_status"],
    };
  }

  if (includesAny(normalized, ["forwarding", "weiterleitung", "profile", "profil"])) {
    const profile = extractForwardingProfile(request);
    const changeRequested = includesAny(normalized, ["set", "change", "switch", "stelle", "setz", "ändere", "wechsel"]);

    if (changeRequested) {
      return {
        intent: "set_forwarding_profile",
        recommendedTool: "set_forwarding_profile",
        arguments: {
          extension,
          profile,
        },
        confidence: extension && profile ? "high" : "medium",
        destructive: true,
        missingArguments: [
          ...(extension ? [] : ["extension"]),
          ...(profile ? [] : ["profile"]),
        ],
        notes: [
          "This changes live call routing immediately.",
        ],
        alternativeTools: ["get_forwarding_profiles"],
      };
    }

    return {
      intent: "get_forwarding_profiles",
      recommendedTool: "get_forwarding_profiles",
      arguments: {
        extension,
      },
      confidence: extension ? "high" : "medium",
      destructive: false,
      missingArguments: extension ? [] : ["extension"],
      notes: [
        "Use this before changing forwarding if the target profile is not known.",
      ],
      alternativeTools: ["set_forwarding_profile"],
    };
  }

  if (includesAny(normalized, ["queue", "warteschlange", "ringgroup", "ring group", "ringgruppe"])) {
    if (includesAny(normalized, ["who", "wer", "agents", "agenten", "mitglieder", "logged", "eingeloggt"])) {
      return {
        intent: "queue_agents",
        recommendedTool: "get_queue_agents",
        arguments: {
          queue,
          loggedInOnly: includesAny(normalized, ["logged in", "loggedin", "eingeloggt"]),
        },
        confidence: queue ? "high" : "medium",
        destructive: false,
        missingArguments: queue ? [] : ["queue"],
        notes: [
          "Use this for member/agent questions on a single queue.",
        ],
        alternativeTools: ["find_queues", "list_queues"],
      };
    }

    return {
      intent: "queue_lookup",
      recommendedTool: "find_queues",
      arguments: {
        query: queue ?? searchPhrase,
        top: 10,
      },
      confidence: queue || searchPhrase ? "high" : "medium",
      destructive: false,
      missingArguments: queue || searchPhrase ? [] : ["query"],
      notes: [
        "Use this to resolve a queue by name or number before other queue operations.",
      ],
      alternativeTools: ["list_queues", "get_queue_agents"],
    };
  }

  if (phone && includesAny(normalized, ["contact", "kontakt", "phonebook", "telefonbuch", "whose number", "welche nummer", "wer ist diese nummer"])) {
    return {
      intent: "contact_by_phone",
      recommendedTool: "find_contact_by_phone",
      arguments: {
        phone,
        top: 10,
      },
      confidence: "high",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use this for exact phone-number lookups.",
      ],
      alternativeTools: ["search_contacts", "list_contacts"],
    };
  }

  if (includesAny(normalized, ["contact", "contacts", "kontakt", "kontakte", "phonebook", "telefonbuch"])) {
    return {
      intent: "contact_search",
      recommendedTool: "search_contacts",
      arguments: {
        query: searchPhrase ?? phone,
      },
      confidence: searchPhrase || phone ? "high" : "medium",
      destructive: false,
      missingArguments: searchPhrase || phone ? [] : ["query"],
      notes: [
        "Use this for general contact lookup by name, company, or phone fragment.",
      ],
      alternativeTools: ["find_contact_by_phone", "list_contacts"],
    };
  }

  if (includesAny(normalized, ["create user", "new user", "add user", "benutzer anlegen", "user anlegen", "neuen benutzer", "neue nebenstelle"])) {
    return {
      intent: "create_user",
      recommendedTool: "create_user",
      arguments: {},
      confidence: "medium",
      destructive: true,
      missingArguments: ["Number", "FirstName", "LastName", "EmailAddress"],
      notes: [
        "This is a destructive/write operation.",
        "Collect all required fields before executing.",
      ],
      alternativeTools: ["find_users", "list_users"],
    };
  }

  if (includesAny(normalized, ["delete user", "remove user", "benutzer löschen", "user löschen"])) {
    return {
      intent: "delete_user",
      recommendedTool: "delete_user",
      arguments: {},
      confidence: "medium",
      destructive: true,
      missingArguments: ["ids"],
      notes: [
        "Resolve the numeric user Id first via get_user or find_users.",
      ],
      alternativeTools: ["get_user", "find_users"],
    };
  }

  if (includesAny(normalized, ["user", "users", "benutzer", "mitarbeiter", "extension", "nebenstelle", "durchwahl"])) {
    return {
      intent: "user_lookup",
      recommendedTool: "find_users",
      arguments: {
        query: extension ?? email ?? searchPhrase ?? phone,
        top: 10,
      },
      confidence: extension || email || searchPhrase || phone ? "high" : "medium",
      destructive: false,
      missingArguments: extension || email || searchPhrase || phone ? [] : ["query"],
      notes: [
        "Use this to resolve a person or extension before more specific user operations.",
      ],
      alternativeTools: ["get_user", "get_extension_status", "list_users"],
    };
  }

  if (includesAny(normalized, ["system status", "systemzustand", "status", "license", "lizenz", "version", "uptime"])) {
    return {
      intent: "system_status",
      recommendedTool: "get_system_status",
      arguments: {},
      confidence: "high",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use this for general PBX health and version questions.",
      ],
      alternativeTools: ["get_event_logs"],
    };
  }

  if (includesAny(normalized, ["event log", "event logs", "ereignis", "ereignisse", "fehler", "errors", "warnings", "warnungen"])) {
    return {
      intent: "event_logs",
      recommendedTool: "get_event_logs",
      arguments: {
        filter: includesAny(normalized, ["error", "errors", "fehler"]) ? "Type eq 'Error'" : includesAny(normalized, ["warning", "warnings", "warnung", "warnungen"]) ? "Type eq 'Warning'" : undefined,
        top: 50,
      },
      confidence: "high",
      destructive: false,
      missingArguments: [],
      notes: [
        "Use filter only when the user explicitly asks for errors or warnings.",
      ],
      alternativeTools: ["get_system_status"],
    };
  }

  if (includesAny(normalized, ["trunk", "trunks", "sip trunk", "provider"])) {
    return {
      intent: "trunk_lookup",
      recommendedTool: "list_trunks",
      arguments: {},
      confidence: "medium",
      destructive: false,
      missingArguments: [],
      notes: [
        "Resolve trunk Ids with list_trunks before calling get_trunk_details.",
      ],
      alternativeTools: ["get_trunk_details"],
    };
  }

  return {
    intent: "unknown",
    recommendedTool: "get_system_status",
    arguments: {},
    confidence: "low",
    destructive: false,
    missingArguments: [],
    notes: [
      "The request did not match a known intent with high confidence.",
      "Start with this tool only as a sanity check, or ask a narrower follow-up question.",
    ],
    alternativeTools: ["find_users", "get_recent_calls", "search_contacts"],
  };
}

export function registerRouterTools(server: McpServer, config: Config) {
  server.tool(
    "plan_3cx_request",
    "Natural-language router for AI agents. Give it the user's request in plain German or English and it returns the recommended 3CX MCP tool, suggested arguments, confidence, missing arguments, and notes. Use this first when you are unsure which tool to call. This tool is read-only and does not change 3CX.",
    {
      request: z.string().describe("The user's plain-language 3CX request, e.g. 'Liste mir heute alle verpassten Anrufe' or 'Find extension 101'."),
    },
    async ({ request }) => {
      try {
        const plan = plan3cxRequest(request, config);
        return {
          content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );
}
