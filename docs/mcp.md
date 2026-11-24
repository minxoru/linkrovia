# Model Context Protocol

Linkrovia exposes link management and click analytics to MCP clients over Streamable HTTP.

1. As the owner, enable MCP under **MCP** in the admin console. Copy the endpoint from this page. It ends in `/mcp` and uses the instance's management hostname.
2. In **API keys**, create a dedicated key for the client. Select `mcp:connect` and the scopes for the tools you need. Start with `links:read` to read links. Add `analytics:read` for reports or `links:write` for link changes and new UTM templates.
3. Open the matching client example on the **MCP** page and merge it into your existing client settings. The file examples use environment variables or a password prompt to keep the key out of your settings. Set each environment variable on the host where the client runs and restart it so it picks up the value.
4. Confirm the client discovers Linkrovia's tools and try a read-only tool such as `list_links` if your key includes `links:read`.

Revoke a client's key under **API keys** to disconnect it, or disable MCP to disconnect all clients.

## Client configuration

In the table, `LINKROVIA_MCP_TOKEN` holds the issued key with no prefix. The admin console fills in your instance's endpoint in every file example.

| Client                   | Where to configure it                                                                           | How to supply the key                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex                    | `~/.codex/config.toml`                                                                          | Set `bearer_token_env_var = "LINKROVIA_MCP_TOKEN"`. [Codex MCP configuration](https://developers.openai.com/codex/mcp)                                                                                                                                                                                 |
| Claude Code              | Project `.mcp.json`                                                                             | Set a Streamable HTTP server with `"type": "http"` and `"Authorization": "Bearer ${LINKROVIA_MCP_TOKEN}"` in `headers`. Approve the project server when prompted. [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)                                                                 |
| GitHub Copilot           | `~/.copilot/mcp-config.json` under `mcpServers`. If you set `COPILOT_HOME`, use that directory. | Use `"type": "http"`, `"tools": ["*"]` and `"Authorization": "Bearer ${LINKROVIA_MCP_TOKEN}"` in `headers`. The key's scopes determine which tools Linkrovia exposes. [Copilot configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration#_portable-configuration) |
| VS Code (editor-managed) | `.vscode/mcp.json` or **MCP: Open User Configuration**                                          | Use the `servers` and `inputs` example on the MCP page. VS Code prompts for the key using a password input. [VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)                                                                               |
| Cursor                   | `~/.cursor/mcp.json` or `.cursor/mcp.json`                                                      | Set `"Authorization": "Bearer ${env:LINKROVIA_MCP_TOKEN}"` in `headers`. [Cursor MCP configuration](https://cursor.com/docs/mcp)                                                                                                                                                                       |
| Gemini CLI               | `~/.gemini/settings.json`                                                                       | Set `httpUrl` to the endpoint and `"Authorization": "Bearer ${LINKROVIA_MCP_TOKEN}"` in `headers`. [Gemini CLI MCP configuration](https://geminicli.com/docs/tools/mcp-server/) and [environment-variable references](https://geminicli.com/docs/reference/configuration/)                             |

## Claude web, Desktop and Cowork

If your Claude account shows **Request headers** in the custom connector dialog, add a custom Web connector under **Customize → Connectors**. Enter the Linkrovia MCP endpoint, select **No sign-in**, and set the required `Authorization` header to `Bearer YOUR_LINKROVIA_API_KEY` with the issued key. Claude sends the header from its cloud, so the endpoint must be reachable from the internet on HTTPS port 443. Request header authentication is in limited beta. For organization-wide connectors, all members who can use the connector share the key's permissions. [Claude custom connector documentation](https://claude.com/docs/connectors/custom/add-unlisted#authenticate-with-request-headers)

Claude Desktop can also launch a local stdio bridge. This path works from the desktop's network and uses [mcp-remote 0.16.6](https://github.com/punkpeye/mcp-remote/releases/tag/v0.16.6), a third-party package:

1. Install Node.js and the pinned bridge with `npm install --global mcp-remote@0.16.6`.
2. Launch Claude Desktop with `LINKROVIA_MCP_AUTHORIZATION` set in the environment it inherits. The value is `Bearer`, one space and the issued key. Keep the value in your local secret store and have your launcher supply it to the process.
3. Open **Settings → Developer → Edit Config** in Claude Desktop and merge the stdio example shown on Linkrovia's MCP page. If the app cannot locate `mcp-remote`, set `command` to the full path of the installed executable. Fully quit and relaunch Claude Desktop after changing the configuration. [Bridge configuration reference](https://github.com/punkpeye/mcp-remote/tree/v0.16.6#custom-headers)

## Other MCP clients

The endpoint accepts stateless Streamable HTTP and requires the `Authorization: Bearer` header on every request. [MCP transport specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

ChatGPT custom plugins require OAuth for authenticated MCP connections. Linkrovia's endpoint uses a scoped API key, so direct connection through ChatGPT's custom plugin setup is unavailable. [ChatGPT MCP authentication](https://developers.openai.com/plugins/build/auth)

| Scope            | Tools                                                                               |
| ---------------- | ----------------------------------------------------------------------------------- |
| `links:read`     | `list_links`, `get_link`, `simulate_redirect`, `list_domains`, `list_utm_templates` |
| `analytics:read` | `get_link_analytics`                                                                |
| `links:write`    | `create_link`, `update_link`, `disable_link`, `create_utm_template`                 |

The tools use the same link validation and permissions as the REST API. `update_link` and `disable_link` require the current `updatedAt` value. DNS changes, backup restores, and one-time redemptions stay outside MCP. The admin audit records the key ID and tool name for tool calls.
