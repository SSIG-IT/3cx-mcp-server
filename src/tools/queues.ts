import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

type QueueAgent = Record<string, unknown>;

type QueueEntry = {
  Id?: number;
  Number?: string;
  Name?: string;
  IsRegistered?: boolean;
  PollingStrategy?: unknown;
  Agents?: QueueAgent[];
  RingTimeout?: number;
  MaxWaitTime?: number;
};

type QueueResponse = {
  value?: QueueEntry[];
};

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function scoreQueueMatch(queue: QueueEntry, query: string): number | null {
  const normalizedQuery = normalizeText(query);
  const number = normalizeText(queue.Number);
  const name = normalizeText(queue.Name);

  if (number === normalizedQuery) return 0;
  if (name === normalizedQuery) return 1;
  if (number.startsWith(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 3;
  if (number.includes(normalizedQuery)) return 4;
  return null;
}

async function getAllQueues(xapi: XapiClient): Promise<QueueEntry[]> {
  const result = (await xapi.get("/Queues?$orderby=Number asc")) as QueueResponse;
  return result.value ?? [];
}

function findMatchingQueues(queues: QueueEntry[], query: string): QueueEntry[] {
  return queues
    .map((queue) => ({ queue, score: scoreQueueMatch(queue, query) }))
    .filter((entry): entry is { queue: QueueEntry; score: number } => entry.score !== null)
    .sort((a, b) => a.score - b.score || normalizeText(a.queue.Number).localeCompare(normalizeText(b.queue.Number)))
    .map((entry) => entry.queue);
}

function isLoggedInAgent(agent: QueueAgent): boolean {
  const candidateValues = [
    agent.IsLoggedIn,
    agent.LoggedIn,
    agent.InQueue,
    agent.QueueLoggedIn,
    agent.Status,
    agent.QueueStatus,
    agent.MemberStatus,
  ];

  for (const value of candidateValues) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized.includes("loggedin") || normalized.includes("logged in") || normalized.includes("available")) {
        return true;
      }
      if (normalized.includes("loggedout") || normalized.includes("logged out")) {
        return false;
      }
    }
  }

  return false;
}

export function registerQueueTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "find_queues",
    "Use this when the user asks about call queues: 'show all queues', 'find support queue', 'which queue is 802?'. Searches by queue number or name with fuzzy matching. Returns: Id, Number, Name, IsRegistered, PollingStrategy, Agents (with login status), RingTimeout, MaxWaitTime. Use get_queue_agents for detailed agent info on a specific queue.",
    {
      query: z.string().describe("Queue number or queue name to search for."),
      top: z.number().optional().default(10).describe("Maximum number of matching queues to return."),
    },
    async ({ query, top }) => {
      try {
        const queues = await getAllQueues(xapi);
        const matches = findMatchingQueues(queues, query).slice(0, top);
        const result = {
          meta: {
            query,
            returned: matches.length,
            filteredLocally: true,
          },
          value: matches,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_queue_agents",
    "Use this when the user asks 'who is in queue X?', 'which agents are logged into 802?', or 'who is working the support queue?'. Resolves the queue by number or name, then returns its agents with login status. Set loggedInOnly=true to show only currently logged-in agents.",
    {
      queue: z.string().describe("Queue number or queue name, e.g. '802' or 'Support'."),
      loggedInOnly: z.boolean().optional().default(false).describe("If true, only agents that appear logged in are returned."),
    },
    async ({ queue, loggedInOnly }) => {
      try {
        const queues = await getAllQueues(xapi);
        const matches = findMatchingQueues(queues, queue);

        if (matches.length === 0) {
          return {
            content: [{ type: "text", text: `No queue found for '${queue}'.` }],
            isError: true,
          };
        }

        const bestScore = scoreQueueMatch(matches[0], queue);
        const bestMatches = matches.filter((entry) => scoreQueueMatch(entry, queue) === bestScore);

        if (bestMatches.length > 1 && bestScore !== 0 && bestScore !== 1) {
          return {
            content: [{
              type: "text",
              text: `Multiple queues matched '${queue}'. Use a more specific queue number or name.\n${JSON.stringify(bestMatches, null, 2)}`,
            }],
            isError: true,
          };
        }

        const selectedQueue = bestMatches[0];
        const agents = (selectedQueue.Agents ?? []).filter((agent) => !loggedInOnly || isLoggedInAgent(agent));
        const result = {
          queue: {
            Id: selectedQueue.Id,
            Number: selectedQueue.Number,
            Name: selectedQueue.Name,
            IsRegistered: selectedQueue.IsRegistered,
            PollingStrategy: selectedQueue.PollingStrategy,
            RingTimeout: selectedQueue.RingTimeout,
            MaxWaitTime: selectedQueue.MaxWaitTime,
          },
          meta: {
            requestedQueue: queue,
            resolvedBy: bestScore === 0 ? "exact-number" : bestScore === 1 ? "exact-name" : "fuzzy-match",
            loggedInOnly,
            returnedAgents: agents.length,
          },
          agents,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_ring_groups",
    "Use this when the user asks about ring groups (not queues). Ring groups ring multiple extensions simultaneously or in sequence. Returns: Id, Number, Name, Members, RingStrategy.",
    {
      filter: z.string().optional().describe("OData $filter, e.g. \"Name eq 'Sales'\""),
    },
    async ({ filter }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/RingGroups${query}`);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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
