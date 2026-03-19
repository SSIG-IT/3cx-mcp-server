<p align="center">
  <img src="assets/header.png" alt="3CX MCP Server" width="800">
</p>

<p align="center">
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Server-blue" alt="MCP Server"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-blue" alt="TypeScript"></a>
  <a href="https://github.com/SSIG-IT/3cx-mcp-server#available-tools-22"><img src="https://img.shields.io/badge/Tools-22-brightgreen" alt="Tools"></a>
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

The server authenticates via OAuth2 Client Credentials against the 3CX Configuration API (XAPI), manages token lifecycle automatically, and exposes 22 tools over MCP's stdio transport.

> **Quick Start**
> ```bash
> git clone https://github.com/SSIG-IT/3cx-mcp-server.git && cd 3cx-mcp-server
> npm install && npm run build
> cp .env.example .env  # edit with your 3CX credentials
> npm start
> ```

**Contents:** [Prerequisites](#prerequisites) · [API Setup](#3cx-api-setup) · [Installation](#installation) · [Configuration](#configuration) · [Usage](#usage) · [Tools (22)](#available-tools-22) · [Troubleshooting](#troubleshooting) · [Deutsch](#deutsch)

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

> ⚠️ **The role MUST be "System Owner", NOT "System Administrator".** With System Administrator, most tools work but `get_call_history`, `ChatHistoryView`, `Recordings` and `ScheduledReports` return 403.

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

### MetaMCP

For MetaMCP, add the server with:

- Command: `npx`
- Arguments: `-y github:SSIG-IT/3cx-mcp-server`

Set these environment variables:

```env
TCX_FQDN=your-company.my3cx.de
TCX_PORT=443
TCX_TIMEZONE=Europe/Berlin
TCX_CLIENT_ID=900
TCX_CLIENT_SECRET=your_api_secret_here
```

`TCX_TIMEZONE` is strongly recommended — it defines the day boundary for `get_call_history(scope="today")`. Without it, "today" falls back to the host timezone (may be UTC on remote systems).

To force a fresh install after updates: `npx --force -y github:SSIG-IT/3cx-mcp-server`

### Standalone HTTP Transport

Run the server as a remote HTTP endpoint (without MetaMCP):

```env
MCP_TRANSPORT=http
MCP_HTTP_PORT=8080
```

```bash
npm run build && npm start
# Server listens on http://0.0.0.0:8080/mcp
# Health check: http://0.0.0.0:8080/health
```

Deploy behind a reverse proxy (nginx/Cloudflare) with HTTPS for production use.

### Testing

Test with [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npm run inspect` (macOS/Linux) or `npm run inspect:win` (Windows). The `.env` file is loaded automatically.

## Available Tools (22)

<details>
<summary><strong>System</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_system_status` | Read | System health, version, license, active calls count, disk usage |
| `get_event_logs` | Read | System event logs (filter by Type: Error, Warning, Info) |

</details>

<details>
<summary><strong>Users & Extensions</strong> — 6 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `find_users` | Read | Search users by name, extension, email, or mobile. Set `onlyRegistered=true` for online users |
| `get_user` | Read | Full details of one user by extension number (returns Id needed for update/delete) |
| `get_extension_status` | Read | Quick status: is registered? current profile? queue status? |
| `create_user` | **Write** | Create a new extension |
| `update_user` | **Write** | Update user fields by Id |
| `delete_user` | **Write** | Delete users by Id array |

</details>

<details>
<summary><strong>Forwarding</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_forwarding_profiles` | Read | All forwarding profiles and routing rules for an extension |
| `set_forwarding_profile` | **Write** | Change active profile (Available, Away, Out of office, etc.) |

</details>

<details>
<summary><strong>Departments</strong> — 3 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_departments` | Read | All departments/groups |
| `create_department` | **Write** | Create a department |
| `update_department` | **Write** | Update department fields by Id |

</details>

<details>
<summary><strong>Trunks</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `list_trunks` | Read | All SIP trunks with registration status |
| `get_trunk_details` | Read | Full trunk config by Id |

</details>

<details>
<summary><strong>Calls & History</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `get_active_calls` | Read | Currently live calls |
| `get_call_history` | Read | Call history (V20 U6+ ReportCallLogData) with scope (today/last_24h/all), missedOnly filter, extension/queue filter. Timezone-aware. |

</details>

<details>
<summary><strong>Queues</strong> — 3 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `find_queues` | Read | Search queues by number or name |
| `get_queue_agents` | Read | Agents/members of a specific queue, with optional logged-in filter |
| `list_ring_groups` | Read | All ring groups |

</details>

<details>
<summary><strong>Contacts</strong> — 2 tools</summary>

| Tool | Type | Description |
|------|------|-------------|
| `search_contacts` | Read | Search phonebook by name, company, or phone number |
| `find_contact_by_phone` | Read | Exact phone number lookup with normalization |

</details>

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **401 Unauthorized** | Invalid credentials | Re-check `TCX_CLIENT_ID` and `TCX_CLIENT_SECRET`. Regenerate the API key if the secret was lost. |
| **403 Forbidden** on get_call_history | Wrong role | Service principal role must be **System Owner**, not System Administrator. |
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
