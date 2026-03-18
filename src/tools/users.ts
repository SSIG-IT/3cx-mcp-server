import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

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

type UserResponse = {
  value?: UserEntry[];
};

function buildUserQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string | undefined): string {
  return value?.replace(/[^\d+]/g, "") ?? "";
}

function matchesUser(user: UserEntry, search: string): boolean {
  const normalizedSearch = normalizeText(search);
  const normalizedPhoneSearch = normalizePhone(search);

  const exactFields = [
    normalizeText(user.Number),
    normalizeText(user.EmailAddress),
    normalizePhone(user.Mobile),
  ];

  if (exactFields.some((field) => field !== "" && field === normalizedSearch)) {
    return true;
  }

  if (normalizedPhoneSearch !== "" && exactFields.some((field) => field !== "" && field === normalizedPhoneSearch)) {
    return true;
  }

  const textFields = [
    user.Number,
    user.FirstName,
    user.LastName,
    user.DisplayName,
    user.EmailAddress,
    user.Mobile,
  ];

  return textFields.some((field) => normalizeText(field).includes(normalizedSearch));
}

async function getUsersPage(
  xapi: XapiClient,
  params: {
    top: number;
    skip?: number;
    orderby?: string;
  },
): Promise<UserEntry[]> {
  const query = buildUserQuery({
    $top: params.top,
    $skip: params.skip,
    $orderby: params.orderby ?? "Number asc",
  });
  const result = (await xapi.get(`/Users${query}`)) as UserResponse;
  return result.value ?? [];
}

async function findUsersByQuery(
  xapi: XapiClient,
  params: {
    query: string;
    top: number;
    scanLimit: number;
    includeDisabled: boolean;
    onlyRegistered: boolean;
  },
): Promise<{
  meta: {
    query: string;
    returned: number;
    scanned: number;
    scanLimit: number;
    filteredLocally: true;
  };
  value: UserEntry[];
}> {
  const matches: UserEntry[] = [];
  let scanned = 0;
  let skip = 0;

  while (scanned < params.scanLimit && matches.length < params.top) {
    const remaining = params.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const page = await getUsersPage(xapi, {
      top: pageSize,
      skip,
      orderby: "Number asc",
    });

    if (page.length === 0) {
      break;
    }

    scanned += page.length;
    skip += page.length;

    for (const user of page) {
      if (!params.includeDisabled && user.Enabled === false) {
        continue;
      }

      if (params.onlyRegistered && user.IsRegistered !== true) {
        continue;
      }

      if (!matchesUser(user, params.query)) {
        continue;
      }

      matches.push(user);
      if (matches.length >= params.top) {
        break;
      }
    }
  }

  return {
    meta: {
      query: params.query,
      returned: matches.length,
      scanned,
      scanLimit: params.scanLimit,
      filteredLocally: true,
    },
    value: matches,
  };
}

export function registerUserTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "find_users",
    "Use this when the user asks about people, extensions, or phone users. Searches across extension number, first name, last name, display name, email, and mobile. Examples: 'find Philipp', 'who has extension 101?', 'who is online?', 'list all users'. Set onlyRegistered=true for 'who is online/registered?' questions. Returns: Id, Number, FirstName, LastName, DisplayName, EmailAddress, Mobile, IsRegistered, CurrentProfileName, QueueStatus, Enabled.",
    {
      query: z.string().describe("Name, extension, email, or phone fragment to search for."),
      top: z.number().optional().default(10).describe("Maximum number of matching users to return."),
      includeDisabled: z.boolean().optional().default(false).describe("Whether disabled users should be included."),
      onlyRegistered: z.boolean().optional().default(false).describe("If true, only users with currently registered devices are returned."),
      scanLimit: z.number().optional().default(250).describe("How many user rows to scan before local filtering. Increase on larger systems."),
    },
    async ({ query, top, includeDisabled, onlyRegistered, scanLimit }) => {
      try {
        const result = await findUsersByQuery(xapi, {
          query,
          top,
          includeDisabled,
          onlyRegistered,
          scanLimit,
        });
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
    "get_user",
    "Use this when the user asks about ONE specific extension by number. Returns the complete user record including the numeric Id (needed for update_user and delete_user). Fields: Id, Number, FirstName, LastName, DisplayName, EmailAddress, Mobile, IsRegistered, CurrentProfileName, QueueStatus, Enabled, Tags. Always call this before update_user or delete_user to get the Id.",
    {
      extension: z.string().describe("Extension number, e.g. '101' or '200'"),
    },
    async ({ extension }) => {
      try {
        const result = await xapi.get(`/Users?$filter=Number eq '${extension}'`) as { value?: unknown[] };
        const user = result.value?.[0];
        if (!user) {
          return {
            content: [{ type: "text", text: `No user found with extension '${extension}'.` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
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
    "create_user",
    "[DESTRUCTIVE] Creates a new 3CX user/extension. The Number must be unused — use find_users first to check availability. Returns the created user with its assigned Id. Requires confirmation from the user before executing.",
    {
      Number: z.string().describe("Extension number to assign, e.g. '106'. Must be unused."),
      FirstName: z.string().describe("First name"),
      LastName: z.string().describe("Last name"),
      EmailAddress: z.string().describe("Email address"),
      Mobile: z.string().optional().describe("Mobile phone number"),
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
          content: [{
            type: "text",
            text: `User created successfully:\n${JSON.stringify(result, null, 2)}`,
          }],
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
    "update_user",
    "[DESTRUCTIVE] Updates a 3CX user by numeric Id. Get the Id from get_user or list_users first. Only provided fields are changed. Can update name, email, mobile, or enable/disable a user.",
    {
      id: z.number().describe("Numeric user Id (from get_user or list_users, NOT the extension number)"),
      FirstName: z.string().optional().describe("First name"),
      LastName: z.string().optional().describe("Last name"),
      EmailAddress: z.string().optional().describe("Email address"),
      Mobile: z.string().optional().describe("Mobile phone number"),
      Enabled: z.boolean().optional().describe("true to enable, false to disable the user"),
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
          content: [{
            type: "text",
            text: `User ${id} updated successfully:\n${JSON.stringify(updated, null, 2)}`,
          }],
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
    "delete_user",
    "[DESTRUCTIVE] Permanently deletes 3CX users by their numeric Ids. Cannot be undone. Get Ids from get_user or list_users first. Accepts an array to delete multiple users at once.",
    {
      ids: z.array(z.number()).describe("Array of numeric user Ids to delete, e.g. [26] or [26, 27]"),
    },
    async ({ ids }) => {
      try {
        await xapi.post("/Users/Pbx.BatchDelete", { ids });
        return {
          content: [{
            type: "text",
            text: `Successfully deleted user(s) with ID(s): ${ids.join(", ")}`,
          }],
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
