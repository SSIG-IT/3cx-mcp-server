# 3CX MCP Server

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

### Step 1: Create a Service Principal

1. Open the **3CX Admin Console**
2. Navigate to **Integrations > API > Add**
3. Enable **XAPI** access
4. Set the role to **System Owner** (Systemeigentümer)
5. Copy the **Client ID** (numeric extension number) and **Client Secret**

> **Warning:** The role **must** be **System Owner**, not System Administrator. With System Administrator, most endpoints work, but `CallHistoryView`, `ChatHistoryView`, `Recordings`, and `ScheduledReports` will return **403 Forbidden**.

### Step 2: Store API credentials securely

Keep the Client ID and Client Secret in a safe place (e.g. a password manager). You will need them for the `.env` file and for any MCP client configuration.

## Installation

```bash
git clone https://github.com/SSIG-IT/3cx-mcp-server.git
cd 3cx-mcp-server
npm install
npm run build
```

## Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

```env
TCX_FQDN=your-company.my3cx.de
TCX_PORT=443
TCX_CLIENT_ID=your_client_id
TCX_CLIENT_SECRET=your_client_secret
```

**Port configuration:**
- Hosted instances (`*.my3cx.de`) use port **443** (standard HTTPS)
- Self-hosted instances typically use port **5001**

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
        "TCX_CLIENT_ID": "your_client_id",
        "TCX_CLIENT_SECRET": "your_client_secret"
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
        "TCX_CLIENT_ID": "your_client_id",
        "TCX_CLIENT_SECRET": "your_client_secret"
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
| `TCX_CLIENT_ID` | Yes | — | OAuth2 Client ID from 3CX API setup |
| `TCX_CLIENT_SECRET` | Yes | — | OAuth2 Client Secret from 3CX API setup |
| `TCX_WEBAPI_KEY` | No | — | Legacy WebAPI access key (not used yet) |
| `TCX_CALLCONTROL_ENABLED` | No | `false` | Enable Call Control API (Enterprise only, not used yet) |
| `MCP_TRANSPORT` | No | `stdio` | Transport type (`stdio` or `http`) |
| `MCP_LOG_LEVEL` | No | `info` | Log level (`debug`, `info`, `warn`, `error`) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| **401 Unauthorized** | Invalid or expired credentials | Re-check `TCX_CLIENT_ID` and `TCX_CLIENT_SECRET`. Regenerate the API key in 3CX Admin if needed. |
| **403 Forbidden** on CallHistoryView, Recordings | Insufficient role | Change the service principal role to **System Owner** (not System Administrator). |
| **Connection refused** on port 5001 | Hosted instance uses different port | Set `TCX_PORT=443` for hosted `*.my3cx.de` instances. |
| **fetch failed** / ENOTFOUND | Wrong hostname or no connectivity | Verify `TCX_FQDN` is correct and reachable via HTTPS. |

## License

MIT — see [LICENSE](LICENSE)

## Contributing

Issues and pull requests are welcome at [github.com/SSIG-IT/3cx-mcp-server](https://github.com/SSIG-IT/3cx-mcp-server).

---

## Deutsch — Kurzanleitung

Ein MCP-Server, der Claude mit einer 3CX Telefonanlage (V20+) verbindet.

### Einrichtung in 5 Schritten

1. **API-Key erstellen:** 3CX Admin Console > Integrationen > API > Hinzufügen > XAPI aktivieren > Rolle: **Systemeigentümer**
2. **Repository klonen:** `git clone https://github.com/SSIG-IT/3cx-mcp-server.git`
3. **Konfigurieren:** `.env.example` nach `.env` kopieren, FQDN und Credentials eintragen. Port 443 für gehostete Instanzen (`*.my3cx.de`), Port 5001 für selbst-gehostete.
4. **Bauen:** `npm install && npm run build`
5. **In Claude einbinden:** MCP-Server in `claude_desktop_config.json` oder VS Code `settings.json` eintragen (siehe Beispiele oben)
