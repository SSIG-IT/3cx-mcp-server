import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";
import { buildContainsFilter, escapeODataString } from "../lib/odata.js";

type UserEntry = {
  Id?: number;
  Number?: string;
  FirstName?: string;
  LastName?: string;
  DisplayName?: string;
  EmailAddress?: string;
  Mobile?: string;
  IsRegistered?: boolean;
  CurrentProfileName?: string;
  QueueStatus?: string;
  Enabled?: boolean;
  Tags?: unknown;
};

const USER_SELECT =
  "Id,Number,FirstName,LastName,DisplayName,EmailAddress,Mobile,IsRegistered,CurrentProfileName,QueueStatus,Enabled";

const SEARCH_FIELDS = ["FirstName", "LastName", "DisplayName", "EmailAddress", "Mobile", "Number"];

// Credential fields 3CX returns on a full user record. They are write-only secrets
// and must never flow into the model context.
const SECRET_FIELDS = ["AuthPassword", "DeskphonePassword", "VMPIN"];

export function redactSecrets(record: unknown): unknown {
  if (!record || typeof record !== "object") return record;
  const copy: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const field of SECRET_FIELDS) {
    if (field in copy) copy[field] = "***redacted***";
  }
  return copy;
}

/** Rank server-returned users so exact number/email matches surface first. */
export function rankUsers(users: UserEntry[], term: string): UserEntry[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return users;

  const score = (user: UserEntry): number => {
    const number = (user.Number ?? "").toLowerCase();
    const email = (user.EmailAddress ?? "").toLowerCase();
    const mobile = (user.Mobile ?? "").replace(/[^\d+]/g, "");
    if (number === normalized || email === normalized || mobile === normalized) return 0;
    if (number.startsWith(normalized)) return 1;
    return 2;
  };

  return [...users].sort((a, b) => score(a) - score(b));
}

async function findUsers(
  xapi: XapiClient,
  params: {
    query: string;
    top: number;
    includeDisabled: boolean;
    onlyRegistered: boolean;
  },
): Promise<{ meta: Record<string, unknown>; value: UserEntry[] }> {
  const term = params.query.trim();
  const clauses: string[] = [];

  // Empty term = list mode (e.g. "who is online?" with onlyRegistered).
  if (term) clauses.push(`(${buildContainsFilter(SEARCH_FIELDS, term)})`);
  if (!params.includeDisabled) clauses.push("Enabled eq true");
  if (params.onlyRegistered) clauses.push("IsRegistered eq true");

  const filter = clauses.length ? clauses.join(" and ") : undefined;

  const result = await xapi.list<UserEntry>("/Users", {
    filter,
    top: params.top,
    orderby: "Number asc",
    select: USER_SELECT,
    count: true,
  });

  const ranked = rankUsers(result.value, term);

  return {
    meta: {
      query: params.query,
      returned: ranked.length,
      total: result.count,
      filteredServerSide: true,
    },
    value: ranked,
  };
}

export function registerUserTools(server: McpServer, xapi: XapiClient) {
  server.registerTool(
    "find_users",
    {
      title: "Find Users",
      description:
        "Use this when the user asks about people, extensions, or phone users. Searches (server-side) across extension number, first name, last name, display name, email, and mobile. Examples: 'find Philipp', 'who has extension 101?', 'who is online?', 'list all users'. Set onlyRegistered=true for 'who is online/registered?' questions (leave query empty to list all registered). Returns: Id, Number, FirstName, LastName, DisplayName, EmailAddress, Mobile, IsRegistered, CurrentProfileName, QueueStatus, Enabled.",
      inputSchema: {
        query: z.string().describe("Name, extension, email, or phone fragment to search for. Empty = list mode."),
        top: z.number().optional().default(10).describe("Maximum number of matching users to return."),
        includeDisabled: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether disabled users should be included."),
        onlyRegistered: z
          .boolean()
          .optional()
          .default(false)
          .describe("If true, only users with currently registered devices are returned."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, top, includeDisabled, onlyRegistered }) => {
      try {
        const result = await findUsers(xapi, { query, top, includeDisabled, onlyRegistered });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_user",
    {
      title: "Get User",
      description:
        "Use this when the user asks about ONE specific extension by number. Returns the complete user record including the numeric Id (needed for update_user and delete_user). Always call this before update_user or delete_user to get the Id.",
      inputSchema: {
        extension: z.string().describe("Extension number, e.g. '101' or '200'"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ extension }) => {
      try {
        const result = await xapi.list(`/Users`, {
          filter: `Number eq '${escapeODataString(extension)}'`,
          top: 1,
        });
        const user = result.value[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(redactSecrets(user), null, 2) }] };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "create_user",
    {
      title: "Create User",
      description:
        "[DESTRUCTIVE] Creates a new 3CX user/extension. The Number must be unused — use find_users first to check availability. Returns the created user with its assigned Id. Requires confirmation from the user before executing.",
      inputSchema: {
        Number: z.string().describe("Extension number to assign, e.g. '106'. Must be unused."),
        FirstName: z.string().describe("First name"),
        LastName: z.string().describe("Last name"),
        EmailAddress: z.string().email().describe("Email address"),
        Mobile: z.string().optional().describe("Mobile phone number"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          Number: params.Number,
          FirstName: params.FirstName,
          LastName: params.LastName,
          EmailAddress: params.EmailAddress,
        };
        if (params.Mobile) body.Mobile = params.Mobile;
        const result = await xapi.post("/Users", body);
        return {
          content: [{ type: "text", text: `User created successfully:\n${JSON.stringify(result, null, 2)}` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "update_user",
    {
      title: "Update User",
      description:
        "[DESTRUCTIVE] Updates a 3CX user by numeric Id. Get the Id from get_user or find_users first. Only provided fields are changed. Can update name, email, mobile, or enable/disable a user.",
      inputSchema: {
        id: z.number().describe("Numeric user Id (from get_user or find_users, NOT the extension number)"),
        FirstName: z.string().optional().describe("First name"),
        LastName: z.string().optional().describe("Last name"),
        EmailAddress: z.string().email().optional().describe("Email address"),
        Mobile: z.string().optional().describe("Mobile phone number"),
        Enabled: z.boolean().optional().describe("true to enable, false to disable the user"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id, ...fields }) => {
      try {
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) body[key] = value;
        }
        if (Object.keys(body).length === 0) {
          return {
            content: [{ type: "text", text: "Error: No fields to update provided." }],
            isError: true,
          };
        }
        await xapi.patch(`/Users(${id})`, body);
        const updated = await xapi.get(`/Users(${id})`);
        return {
          content: [
            { type: "text", text: `User ${id} updated successfully:\n${JSON.stringify(redactSecrets(updated), null, 2)}` },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "delete_user",
    {
      title: "Delete User",
      description:
        "[DESTRUCTIVE] Permanently deletes 3CX users by their numeric Ids. Cannot be undone. Get Ids from get_user or find_users first. Accepts an array to delete multiple users at once.",
      inputSchema: {
        ids: z.array(z.number()).describe("Array of numeric user Ids to delete, e.g. [26] or [26, 27]"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ ids }) => {
      try {
        await xapi.post("/Users/Pbx.BatchDelete", { Ids: ids });
        return {
          content: [{ type: "text", text: `Successfully deleted user(s) with ID(s): ${ids.join(", ")}` }],
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
