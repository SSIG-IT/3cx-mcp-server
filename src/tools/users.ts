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
    "list_users",
    "Low-level user/extension list with optional raw OData filtering. Each user has: Id, Number (extension), FirstName, LastName, DisplayName, EmailAddress, Mobile, IsRegistered, CurrentProfileName, QueueStatus, Enabled, Tags. Filter examples: \"FirstName eq 'Max'\", \"IsRegistered eq true\", \"Enabled eq true\". Prefer find_users for natural-language lookup and get_online_users for 'who is online?' questions.",
    {
      filter: z.string().optional().describe("OData $filter, e.g. \"IsRegistered eq true\" or \"LastName eq 'Mueller'\""),
      top: z.number().optional().describe("Max results to return"),
      skip: z.number().optional().describe("Results to skip (paging)"),
    },
    async ({ filter, top, skip }) => {
      try {
        const params = new URLSearchParams();
        if (filter) params.set("$filter", filter);
        if (top !== undefined) params.set("$top", String(top));
        if (skip !== undefined) params.set("$skip", String(skip));
        const query = params.toString() ? `?${params}` : "";
        const result = await xapi.get(`/Users${query}`);
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
    "find_users",
    "Best user lookup tool for AI agents. Searches across extension number, first name, last name, display name, email address, and mobile number. Use this for questions like 'find Philipp', 'who has extension 101?', or 'find user with email support@example.com'.",
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
    "get_online_users",
    "Returns users whose extensions are currently registered on 3CX. Use this for questions like 'who is online right now?' or 'which phones are currently connected?'. This is the recommended tool for presence-style user queries.",
    {
      top: z.number().optional().default(100).describe("Maximum number of online users to return."),
      includeDisabled: z.boolean().optional().default(false).describe("Whether disabled-but-registered users should be included."),
    },
    async ({ top, includeDisabled }) => {
      try {
        const filter = includeDisabled ? "IsRegistered eq true" : "IsRegistered eq true and Enabled eq true";
        const query = buildUserQuery({
          $filter: filter,
          $top: top,
          $orderby: "Number asc",
        });
        const result = await xapi.get(`/Users${query}`);
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
    "Returns full details of one 3CX user by extension number. Returns all fields including Id (needed for update_user/delete_user), Number, FirstName, LastName, DisplayName, EmailAddress, Mobile, IsRegistered, CurrentProfileName, QueueStatus, Enabled, Tags, ForwardingProfiles, and more. If you need the numeric Id for update/delete operations, call this first.",
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
    "[DESTRUCTIVE] Creates a new 3CX user/extension. Allocates an extension number on the phone system. The Number must be unused — use list_users first to check. Returns the created user object with its assigned Id.",
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
