import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { XapiClient } from "../api/xapi-client.js";
import { z } from "zod";

type ContactEntry = {
  Id?: number;
  FirstName?: string;
  LastName?: string;
  CompanyName?: string;
  PhoneNumber?: string;
  Business?: string;
  Business2?: string;
  BusinessFax?: string;
  Mobile2?: string;
  Home?: string;
  Email?: string;
  Department?: string;
  Title?: string;
  ContactType?: string;
};

type ContactResponse = {
  value?: ContactEntry[];
};

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string | undefined): string {
  return value?.replace(/[^\d+]/g, "") ?? "";
}

function getContactPhoneFields(contact: ContactEntry): string[] {
  return [
    contact.PhoneNumber,
    contact.Business,
    contact.Business2,
    contact.BusinessFax,
    contact.Mobile2,
    contact.Home,
  ].filter((value): value is string => Boolean(value));
}

async function getContactsPage(
  xapi: XapiClient,
  params: {
    top: number;
    skip?: number;
  },
): Promise<ContactEntry[]> {
  const query = new URLSearchParams();
  query.set("$top", String(params.top));
  if (params.skip !== undefined) query.set("$skip", String(params.skip));
  query.set("$orderby", "LastName asc");

  const result = (await xapi.get(`/Contacts?${query.toString()}`)) as ContactResponse;
  return result.value ?? [];
}

async function findContactsByPhone(
  xapi: XapiClient,
  params: {
    phone: string;
    top: number;
    scanLimit: number;
  },
): Promise<{
  meta: {
    phone: string;
    returned: number;
    scanned: number;
    scanLimit: number;
    matchMode: "exact" | "contains";
    filteredLocally: true;
  };
  value: ContactEntry[];
}> {
  const normalizedSearch = normalizePhone(params.phone);
  const exactMatches: ContactEntry[] = [];
  const partialMatches: ContactEntry[] = [];
  let scanned = 0;
  let skip = 0;

  while (scanned < params.scanLimit && exactMatches.length < params.top) {
    const remaining = params.scanLimit - scanned;
    const pageSize = Math.min(100, remaining);
    const page = await getContactsPage(xapi, {
      top: pageSize,
      skip,
    });

    if (page.length === 0) {
      break;
    }

    scanned += page.length;
    skip += page.length;

    for (const contact of page) {
      const phoneFields = getContactPhoneFields(contact).map((value) => normalizePhone(value));

      if (phoneFields.some((value) => value !== "" && value === normalizedSearch)) {
        exactMatches.push(contact);
        if (exactMatches.length >= params.top) {
          break;
        }
        continue;
      }

      if (phoneFields.some((value) => value !== "" && value.includes(normalizedSearch))) {
        partialMatches.push(contact);
      }
    }
  }

  const value = exactMatches.length > 0 ? exactMatches : partialMatches.slice(0, params.top);

  return {
    meta: {
      phone: params.phone,
      returned: value.length,
      scanned,
      scanLimit: params.scanLimit,
      matchMode: exactMatches.length > 0 ? "exact" : "contains",
      filteredLocally: true,
    },
    value,
  };
}

export function registerContactTools(server: McpServer, xapi: XapiClient) {
  server.tool(
    "search_contacts",
    "Use this when the user asks about contacts or the phonebook: 'find contact Mueller', 'search for Acme', 'who has number 0731...'. Searches across FirstName, LastName, CompanyName, Business phone, and PhoneNumber. Returns: Id, FirstName, LastName, CompanyName, PhoneNumber, Business, Email, Department, Title. For exact phone number matching (ignoring formatting), use find_contact_by_phone instead.",
    {
      query: z.string().describe("Search term, e.g. a name like 'Mueller', a company like 'Acme', or a phone number like '0731'"),
    },
    async ({ query }) => {
      try {
        const q = query.replace(/'/g, "''");
        const filter = `contains(FirstName,'${q}') or contains(LastName,'${q}') or contains(CompanyName,'${q}') or contains(Business,'${q}') or contains(PhoneNumber,'${q}')`;
        const result = await xapi.get(`/Contacts?$filter=${encodeURIComponent(filter)}`);
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
    "find_contact_by_phone",
    "Use this when the user provides a specific phone number and wants to know who it belongs to: 'whose number is +49 731 123456?', 'who called from 0176-1234567?'. Normalizes the number (ignores spaces, dashes, formatting) for exact matching across all phone fields.",
    {
      phone: z.string().describe("Phone number to match, in any common format."),
      top: z.number().optional().default(10).describe("Maximum number of matching contacts to return."),
      scanLimit: z.number().optional().default(300).describe("How many contact rows to scan before local filtering. Increase on larger phonebooks."),
    },
    async ({ phone, top, scanLimit }) => {
      try {
        const result = await findContactsByPhone(xapi, {
          phone,
          top,
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
}
