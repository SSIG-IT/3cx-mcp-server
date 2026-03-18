# 3CX MCP Server

[![MCP Server](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![3CX V20+](https://img.shields.io/badge/3CX-V20+-orange)](https://www.3cx.com)

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude to a **3CX Phone System** (V20+). Manage users, monitor calls, search contacts, configure forwarding — directly from Claude Desktop, Claude Code, or any MCP-compatible client.

## Features

- **User Management** — list, create, update, delete users and extensions
- **Call Monitoring** — view active calls and call history (CDR)
- **Contact Search** — search and browse the 3CX phonebook
- **Queue & Ring Group Status** — monitor call queues and ring groups
- **Forwarding Control** — view and change forwarding profiles per extension
- **System Administration** — system status, trunks, departments, event logs

## Prerequisites

- **Node.js** 20 or later
- **3CX** V20+ (hosted or self-hosted)
- **3CX License** with XAPI access — Enterprise (ENT/AI) or Enterprise Plus (ENT+)

## 3CX API Setup

### Step 1: Open the Admin Console

Log in to your 3CX Web Client as **System Owner**. Click the **gear icon** (bottom left) to enter the Admin area.

### Step 2: Create a Service Principal

1. Navigate to **Integrations > API** (German: Integrationen > API)
2. Click **Add** (Hinzufügen)
3. Enter a **Client ID**

> **The Client ID must be a numeric extension number** (e.g. `900`, `950`). 3CX uses this as a route point internally. Text values like `mcp-server` will be rejected with "Format invalid". Choose an unused number.

4. Check the **XAPI** access checkbox
5. Set **Department** to your main department (usually DEFAULT)
6. Set the **Role** to **System Owner** (Systemeigentümer)

> ⚠️ **CRITICAL: The role MUST be "System Owner" (Systemeigentümer), NOT "System Administrator" (Systemadministrator).** With System Administrator, most tools work fine, but these endpoints return 403 Forbidden: `CallHistoryView`, `ChatHistoryView`, `Recordings`, `ScheduledReports`. This means `get_call_logs` will fail. Always use System Owner.

7. Click **Save**
8. A popup shows the **API Secret** — **copy it immediately, it is only shown once!**
9. Store the Client ID (e.g. `900`) and API Secret securely (e.g. in a password manager)

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
TCX_CLIENT_ID=900
TCX_CLIENT_SECRET=your_api_secret_here
```

### Which port to use?

| Deployment | Example FQDN | Port |
|------------|---------------|------|
| 3CX Hosted | `company.my3cx.de`, `company.3cx.eu` | **443** |
| Self-hosted (Linux/Windows) | `pbx.company.com` | **5001** |

If unsure, try port 443 first. If you get "Connection refused", switch to 5001.

### Verify API Connection

Before starting the MCP server, test that your credentials work:

```bash
curl -s -X POST "https://YOUR-FQDN/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_SECRET&grant_type=client_credentials"
```

**Expected:** JSON with `"access_token"` and `"token_type": "Bearer"`

| Response | Meaning |
|----------|---------|
| `{"access_token":"eyJ..."}` | Connection works |
| `401 Unauthorized` | Wrong Client ID or Secret |
| `Connection refused` | Wrong port — try 443 or 5001 |
| `Could not resolve host` | Wrong FQDN |

## Usage

### Claude Desktop

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

### Claude Code (VS Code)

Add to your VS Code `settings.json`:

```json
{
  "claude.mcpServers": {
    "3cx": {
      "command": "node",
      "args": ["${workspaceFolder}/build/index.js"],
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

## Testing with MCP Inspector

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you interactively test each tool. The `.env` file is loaded automatically:

```bash
# Linux / macOS
npm run inspect

# Windows (PowerShell)
npm run inspect:win
```

## Available Tools (21)

### System

| Tool | Type | Description |
|------|------|-------------|
| `get_system_status` | Read | System status, version, license info, uptime |
| `get_event_logs` | Read | System event logs with optional filter and paging |

### Users & Extensions

| Tool | Type | Description |
|------|------|-------------|
| `list_users` | Read | List all users (supports OData `$filter`, `$top`, `$skip`) |
| `get_user` | Read | Get a single user by extension number |
| `create_user` | **Write** | Create a new user/extension (Number, FirstName, LastName, Email) |
| `update_user` | **Write** | Update user fields by ID (name, email, mobile, enabled) |
| `delete_user` | **Write** | Delete one or more users by ID array |
| `get_extension_status` | Read | Extension registration status, current profile, queue status |

### Forwarding

| Tool | Type | Description |
|------|------|-------------|
| `get_forwarding_profiles` | Read | List all forwarding profiles and routing rules for an extension |
| `set_forwarding_profile` | **Write** | Set active profile (Available, Away, Out of office, Custom 1, etc.) |

### Departments

| Tool | Type | Description |
|------|------|-------------|
| `list_departments` | Read | List all departments/groups (supports OData filter) |
| `create_department` | **Write** | Create a new department (Name, Language, TimeZoneId) |
| `update_department` | **Write** | Update department fields by ID |

### Trunks

| Tool | Type | Description |
|------|------|-------------|
| `list_trunks` | Read | List all configured SIP trunks |
| `get_trunk_details` | Read | Detailed trunk info by ID (registration, routes, codecs) |

### Calls & History

| Tool | Type | Description |
|------|------|-------------|
| `get_active_calls` | Read | Currently active calls on the system |
| `get_call_logs` | Read | Call history/CDR with filter and paging (requires System Owner) |

### Queues

| Tool | Type | Description |
|------|------|-------------|
| `list_queues` | Read | List all call queues (supports OData filter) |
| `list_ring_groups` | Read | List all ring groups (supports OData filter) |

### Contacts

| Tool | Type | Description |
|------|------|-------------|
| `list_contacts` | Read | List phonebook contacts with filter and paging |
| `search_contacts` | Read | Search by name, company, or phone number |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TCX_FQDN` | Yes | — | 3CX hostname (e.g. `company.my3cx.de`) |
| `TCX_PORT` | No | `443` | HTTPS port (443 for hosted, 5001 for self-hosted) |
| `TCX_CLIENT_ID` | Yes | — | Numeric extension number from API setup (e.g. `900`) |
| `TCX_CLIENT_SECRET` | Yes | — | API Secret from 3CX (shown once during setup) |
| `MCP_LOG_LEVEL` | No | `info` | Log level (`debug`, `info`, `warn`, `error`) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **401 Unauthorized** | Invalid credentials | Re-check `TCX_CLIENT_ID` and `TCX_CLIENT_SECRET`. The secret is only shown once during creation — regenerate the API key if lost. |
| **403 Forbidden** on get_call_logs | Wrong role | Service principal role must be **System Owner**, not System Administrator. Recreate the API key with the correct role. |
| **"Format invalid"** when creating API key | Non-numeric Client ID | The Client ID must be a number (e.g. `900`), not text. |
| **Connection refused** on port 5001 | Hosted instance | Set `TCX_PORT=443` for `*.my3cx.de` hosted instances. |
| **fetch failed** / ENOTFOUND | Wrong hostname | Verify `TCX_FQDN` is correct and reachable. Try opening `https://YOUR-FQDN` in a browser. |
| **ECONNREFUSED** | Wrong port | Try the other port (443 vs 5001). See port table above. |

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and pull requests are welcome at [github.com/SSIG-IT/3cx-mcp-server](https://github.com/SSIG-IT/3cx-mcp-server).

## Publishing & Distribution

### Official MCP Registry

The [`server.json`](server.json) file contains the registry metadata. To publish:

```bash
# Install the MCP publisher CLI (requires Go)
go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest

# Login with GitHub
mcp-publisher login github

# Publish
mcp-publisher publish server.json
```

> **Note:** The npm package `@ssig-it/3cx-mcp-server` referenced in `server.json` must be published to npm first (`npm publish`) before registry submission.

### GitHub Topics

Set the following topics on the GitHub repository for discoverability:
`mcp`, `mcp-server`, `3cx`, `pbx`, `telephony`, `voip`, `claude`, `model-context-protocol`

---

## Deutsch — Kurzanleitung

Ein MCP-Server, der Claude mit einer 3CX Telefonanlage (V20+) verbindet.

### Einrichtung

1. **API-Key erstellen:** 3CX Web Client > Zahnrad-Icon (Admin) > Integrationen > API > Hinzufügen
   - **Client-ID:** Muss eine **numerische Nebenstellennummer** sein (z.B. `900`), kein Text!
   - **XAPI** aktivieren
   - **Rolle:** Unbedingt **Systemeigentümer** wählen (nicht Systemadministrator — sonst scheitert z.B. `get_call_logs` mit 403)
   - Speichern > **API-Key sofort kopieren** — er wird nur einmal angezeigt!

2. **Repository klonen und bauen:**
   ```bash
   git clone https://github.com/SSIG-IT/3cx-mcp-server.git
   cd 3cx-mcp-server
   npm install && npm run build
   ```

3. **Konfigurieren:** `.env.example` nach `.env` kopieren und ausfüllen:
   ```env
   TCX_FQDN=firma.my3cx.de
   TCX_PORT=443
   TCX_CLIENT_ID=900
   TCX_CLIENT_SECRET=dein_api_secret
   ```
   Port **443** für gehostete Instanzen (`*.my3cx.de`), Port **5001** für selbst-gehostete.

4. **Verbindung testen:**
   ```bash
   curl -s -X POST "https://FQDN/connect/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "client_id=CLIENT_ID&client_secret=SECRET&grant_type=client_credentials"
   ```
   Erwartete Antwort: JSON mit `access_token`.

5. **In Claude einbinden:** MCP-Server in `claude_desktop_config.json` oder VS Code `settings.json` eintragen (siehe Beispiele oben)
