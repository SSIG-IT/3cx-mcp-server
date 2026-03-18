# Contributing

Issues and pull requests are welcome at [github.com/SSIG-IT/3cx-mcp-server](https://github.com/SSIG-IT/3cx-mcp-server).

For developer context (project structure, coding rules, verified API endpoints), see [CLAUDE.md](CLAUDE.md).

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
