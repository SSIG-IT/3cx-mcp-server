# 3CX MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects Claude to a 3CX Phone System (V20+). Query system status, manage users, view call logs, and more — directly from Claude Desktop, Claude Code, or any MCP-compatible client.

## Prerequisites

- **Node.js** 20+
- **3CX** V20+ with a hosted or on-premise instance
- **3CX API Key** — requires a license that includes XAPI access (ENT/AI or ENT+)
- **System Owner role** — the service principal must have the **System Owner** (Systemeigentümer) role, not just System Administrator. The System Administrator role works for most endpoints, but `CallHistoryView`, `ChatHistoryView`, `Recordings`, and `ScheduledReports` return **403 Forbidden** without System Owner.

## Setup

### 1. Create a 3CX API Key

1. Open the 3CX Admin Console
2. Go to **Integrations > API > Add**
3. Enable **XAPI** access
4. Set the role to **System Owner** (Systemeigentümer)
5. Copy the **Client ID** and **Client Secret**

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
TCX_FQDN=your-company.my3cx.de
TCX_PORT=443
TCX_CLIENT_ID=your_client_id
TCX_CLIENT_SECRET=your_client_secret
```

> **Port:** Hosted 3CX instances (`*.my3cx.de`) use port **443** (standard HTTPS). Self-hosted instances typically use port **5001**.

### 3. Build & Run

```bash
npm install
npm run build
npm start
```

## Usage with Claude Desktop

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

## Usage with Claude Code (VS Code)

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

```bash
npm run inspect
```

This launches the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) where you can interactively test each tool.

## Available Tools

| Tool | Description |
|------|-------------|
| `get_system_status` | Retrieves 3CX system status (version, license, uptime) |
| `list_users` | Lists all users with optional OData filter and paging |
| `get_user` | Retrieves a single user by extension number |
| `create_user` | **[WRITE]** Creates a new user/extension |
| `update_user` | **[WRITE]** Updates user fields (name, email, enabled, etc.) |
| `delete_user` | **[WRITE]** Deletes one or more users by ID |
| `list_departments` | Lists all departments/groups with optional filter |
| `create_department` | **[WRITE]** Creates a new department |
| `update_department` | **[WRITE]** Updates department fields |
| `list_trunks` | Lists all configured SIP trunks |
| `get_trunk_details` | Retrieves detailed info for a specific trunk |
| `get_active_calls` | Retrieves currently active calls |
| `get_call_logs` | Retrieves call history (CDR) with optional filter (requires System Owner role) |
| `list_queues` | Lists all call queues with optional filter |
| `list_ring_groups` | Lists all ring groups with optional filter |
| `list_contacts` | Lists phonebook contacts with optional filter and paging |
| `search_contacts` | Searches phonebook by name, company, or phone number |
| `get_extension_status` | Retrieves extension status (registered, profile, queue status) |
| `get_forwarding_profiles` | Retrieves forwarding profiles and routing rules for an extension |
| `set_forwarding_profile` | **[WRITE]** Sets active forwarding profile (Available, Away, DND, etc.) |
| `get_event_logs` | Retrieves system event logs with optional filter |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TCX_FQDN` | Yes | — | 3CX hostname (e.g. `company.my3cx.de`) |
| `TCX_PORT` | No | `443` | HTTPS port (443 for hosted `*.my3cx.de`, typically 5001 for self-hosted) |
| `TCX_CLIENT_ID` | Yes | — | OAuth2 Client ID |
| `TCX_CLIENT_SECRET` | Yes | — | OAuth2 Client Secret |
| `TCX_WEBAPI_KEY` | No | — | Legacy WebAPI access key |
| `TCX_CALLCONTROL_ENABLED` | No | `false` | Enable Call Control API (Enterprise only) |
| `MCP_TRANSPORT` | No | `stdio` | Transport type (`stdio` or `http`) |
| `MCP_LOG_LEVEL` | No | `info` | Log level (`debug`, `info`, `warn`, `error`) |

## License

MIT

---

## Deutsch

Ein MCP-Server, der Claude mit einer 3CX Telefonanlage (V20+) verbindet. Systemstatus abfragen, Benutzer verwalten, Anrufprotokolle einsehen — direkt aus Claude Desktop oder Claude Code.

### Voraussetzungen

- Node.js 20+
- 3CX V20+ (gehostet oder on-premise)
- 3CX API Key mit XAPI-Zugriff (ENT/AI oder ENT+ Lizenz)
- Dienstprinzipal mit Rolle **Systemeigentümer** (nicht nur Systemadministrator — sonst geben CallHistoryView, Recordings u.a. einen 403-Fehler zurück)

### Einrichtung

1. **API Key erstellen:** 3CX Admin Console > Integrationen > API > Hinzufügen > XAPI aktivieren > Rolle: **Systemeigentümer**
2. **Konfiguration:** `.env.example` nach `.env` kopieren und Werte eintragen
3. **Bauen:** `npm install && npm run build`
4. **Starten:** `npm start`
