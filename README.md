<p align="center">
  <img src="assets/header.svg" alt="3CX MCP Server" width="800">
</p>

<p align="center">
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Server-blue" alt="MCP Server"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"></a>
  <a href="https://github.com/SSIG-IT/3cx-mcp-server#available-tools-28"><img src="https://img.shields.io/badge/Tools-28-brightgreen" alt="Tools"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20+-green" alt="Node.js"></a>
  <a href="https://www.3cx.com"><img src="https://img.shields.io/badge/3CX-V20+-orange" alt="3CX V20+"></a>
</p>

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude to a **3CX Phone System** (V20+). Manage users, monitor calls, search contacts, configure forwarding — directly from Claude Desktop, Claude Code, or any MCP-compatible client.

## Features

- **User Management** — list, create, update, delete users and extensions
- **Call Monitoring** — view active calls and call history (CDR)
- **Contact Search** — search and browse the 3CX phonebook
- **Queue & Ring Group Status** — monitor call queues and ring groups
- **Forwarding Control** — view and change forwarding profiles per extension
- **System Administration** — system status, trunks, departments, event logs

The server authenticates via OAuth2 Client Credentials against the 3CX Configuration API (XAPI), manages token lifecycle automatically, and exposes 28 tools over MCP's stdio transport.

> **Quick Start**
> ```bash
> git clone https://github.com/SSIG-IT/3cx-mcp-server.git && cd 3cx-mcp-server
> npm install && npm run build
> cp .env.example .env  # edit with your 3CX credentials
> npm start
> ```

**Contents:** [Prerequisites](#prerequisites) · [API Setup](#3cx-api-setup) · [Installation](#installation) · [Configuration](#configuration) · [Usage](#usage) · [Tools (28)](#available-tools-28) · [Troubleshooting](#troubleshooting) · [Deutsch](#deutsch)

## Prerequisites

- **Node.js** 20 or later
- **3CX** V20+ (hosted or self-hosted)
- **3CX License** with XAPI access — Enterprise (ENT/AI) or Enterprise Plus (ENT+)

## 3CX API Setup

Log in to your 3CX Web Client as **System Owner**. Click the **gear icon** (bottom left) to enter the Admin area.

1. Navigate to **Integrations > API** (German: Integrationen > API)
2. Click **Add** (Hinzufügen)
3. Enter a **Client ID** — must be a **numeric extension number** (e.g. `900`, `950`). Text values like `mcp-server` will be rejected. Choose an unused number.
4. Check the **XAPI** access checkbox
5. Set **Department** to your main department (usually DEFAULT)
6. Set the **Role** to **System Owner** (Systemeigentümer)

> ⚠️ **The role MUST be "System Owner", NOT "System Administrator".** With System Administrator, most tools work but `get_call_logs`, `ChatHistoryView`, `Recordings` and `ScheduledReports` return 403.

7. Click **Save**
8. A popup shows the **API Secret** — **copy it immediately, it is only shown once!**
9. Store Client ID and API Secret securely (e.g. in a password manager)

## Installation

```bash
git clone https://github.com/SSIG-IT/3cx-mcp-server.git
cd 3cx-mcp-server
npm install
npm run build
```

## Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
TCX_FQDN=your-company.my3cx.de
TCX_PORT=443
TCX_TIMEZONE=Europe/Berlin
TCX_CLIENT_ID=900
TCX_CLIENT_SECRET=your_api_secret_here
```

| Deployment | Example FQDN | Port |
|------------|---------------|------|
| 3CX Hosted | `company.my3cx.de`, `company.3cx.eu` | **443** |
| Self-hosted (Linux/Windows) | `pbx.company.com` | **5001** |

If unsure, try port 443 first. If you get "Connection refused", switch to 5001.

For call-history queries like "missed calls today", set `TCX_TIMEZONE` to your business/PBX timezone. Otherwise, `today` falls back to the MCP host timezone, which may be `UTC` on remote hosts.

## Usage

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "3cx": {
      "command": "node",
      "args": ["/absolute/path/to/3cx-mcp-server/build/index.js"],
      "env": {
        "TCX_FQDN": "your-company.my3cx.de",
        "TCX_PORT": "443",
        "TCX_CLIENT_ID": "900",
        "TCX_CLIENT_SECRET": "your_api_secret_here"
      }
    }
  }
}
```

For Claude Code in VS Code, use the same configuration in your VS Code `settings.json` under `claude.mcpServers`.

Test with [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npm run inspect` (macOS/Linux) or `npm run inspect:win` (Windows). The `.env` file is loaded automatically.

## Available Tools (28)

<details>
<summary><strong>System</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_system_status` | Read | System status, version, license info, uptime |
| `get_event_logs` | Read | System event logs with optional filter and paging |

</details>

<details>
<summary><strong>Users & Extensions</strong> — 8 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_users` | Read | Raw user list with OData filter/paging |
| `find_users` | Read | AI-friendly user lookup by extension, name, email, or mobile |
| `get_online_users` | Read | Returns currently registered/online users |
| `get_user` | Read | Get a single user by extension number |
| `create_user` | **Write** | Create a new user/extension (Number, FirstName, LastName, Email) |
| `update_user` | **Write** | Update user fields by ID (name, email, mobile, enabled) |
| `delete_user` | **Write** | Delete one or more users by ID array |
| `get_extension_status` | Read | Extension registration status, current profile, queue status |

</details>

<details>
<summary><strong>Forwarding</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_forwarding_profiles` | Read | List all forwarding profiles and routing rules for an extension |
| `set_forwarding_profile` | **Write** | Set active profile (Available, Away, Out of office, Custom 1, etc.) |

</details>

<details>
<summary><strong>Departments</strong> — 3 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_departments` | Read | List all departments/groups (supports OData filter) |
| `create_department` | **Write** | Create a new department (Name, Language, TimeZoneId) |
| `update_department` | **Write** | Update department fields by ID |

</details>

<details>
<summary><strong>Trunks</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_trunks` | Read | List all configured SIP trunks |
| `get_trunk_details` | Read | Detailed trunk info by ID (registration, routes, codecs) |

</details>

<details>
<summary><strong>Calls & History</strong> — 4 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_active_calls` | Read | Currently active calls on the system |
| `get_call_logs` | Read | Raw call history/CDR with OData filter and paging (power-user endpoint; requires System Owner) |
| `get_recent_calls` | Read | AI-friendly recent-call lookup with structured params like `scope`, `extension`, `queue` |
| `get_recent_missed_calls` | Read | AI-friendly missed-call lookup that avoids fragile 3CX date filters |

</details>

Call-history guidance for MCP clients and AI agents:

- Use `get_recent_calls` or `get_recent_missed_calls` for user-facing questions like "calls today", "missed calls today", or "recent calls for extension 101".
- For calendar-day queries, set `TCX_TIMEZONE` on the server or pass `timezone` explicitly (for example `Europe/Berlin`). You can also pass `date` in `YYYY-MM-DD` format for an exact local day.
- Use `get_call_logs` only when you explicitly need raw OData control (`$filter`, `$orderby`, `$skip`, `$top`).
- Avoid server-side date filters on `CallHistoryView` because some 3CX systems return `500 Internal Server Error` for `SegmentStartTime` comparisons.

<details>
<summary><strong>Queues</strong> — 4 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_queues` | Read | Raw queue list with OData filter |
| `find_queues` | Read | AI-friendly queue lookup by number or name |
| `get_queue_agents` | Read | Returns queue members/agents for one queue |
| `list_ring_groups` | Read | List all ring groups (supports OData filter) |

</details>

<details>
<summary><strong>Contacts</strong> — 3 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_contacts` | Read | Raw phonebook list with filter and paging |
| `search_contacts` | Read | General contact search by name, company, or phone number |
| `find_contact_by_phone` | Read | Exact/normalized phone-number lookup |

</details>

The recommended pattern for MCP clients and AI agents is:

- Prefer intent-based tools first: `find_users`, `get_online_users`, `get_recent_calls`, `get_recent_missed_calls`, `find_queues`, `get_queue_agents`, `search_contacts`, and `find_contact_by_phone`.
- Use raw list-style tools (`list_users`, `list_queues`, `list_contacts`, `get_call_logs`) only when you explicitly need OData control, paging, or broad exports.
- Let the MCP server handle product quirks such as 3CX call-history sorting and fragile date filters instead of trying to reconstruct them in the model prompt.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **401 Unauthorized** | Invalid credentials | Re-check `TCX_CLIENT_ID` and `TCX_CLIENT_SECRET`. Regenerate the API key if the secret was lost. |
| **403 Forbidden** on get_call_logs | Wrong role | Service principal role must be **System Owner**, not System Administrator. |
| **"Format invalid"** creating API key | Non-numeric Client ID | The Client ID must be a number (e.g. `900`), not text. |
| **Connection refused** | Wrong port | Set `TCX_PORT=443` for hosted `*.my3cx.de` instances, `5001` for self-hosted. |
| **fetch failed** / ENOTFOUND | Wrong hostname | Verify `TCX_FQDN` is correct and reachable via HTTPS. |
| **Not sure if API works** | Test credentials | Run: `curl -s -X POST "https://FQDN/connect/token" -H "Content-Type: application/x-www-form-urlencoded" -d "client_id=ID&client_secret=SECRET&grant_type=client_credentials"` — should return JSON with `access_token`. |

## License

MIT — see [LICENSE](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

---

## Deutsch

Einrichtung: [3CX Admin] Integrationen > API > Hinzufügen > Client-ID (numerisch, z.B. `900`) > XAPI aktivieren > Rolle: **Systemeigentümer** > Speichern > API-Key sofort kopieren.
Port 443 für gehostete Instanzen (`*.my3cx.de`), Port 5001 für selbst-gehostete.
Vollständige Anleitung: siehe englische Dokumentation oben.

---

<p align="center">
  Made with MCP by <a href="https://ssig-it.com">SSIG-IT GmbH</a> · Blaubeuren, Germany
</p>
