const tokenVariable = 'LINKROVIA_MCP_TOKEN';
const environmentAuthorization = 'Bearer ${LINKROVIA_MCP_TOKEN}';

export function mcpClientConfigurations(endpoint: string, tokenPrompt: string) {
  const http = { type: 'http', url: endpoint };
  const runtime = {
    ...http,
    headers: { Authorization: environmentAuthorization },
  };
  const hosted = {
    url: endpoint,
    headers: { Authorization: 'Bearer ${env:LINKROVIA_MCP_TOKEN}' },
  };

  return [
    {
      id: 'codex',
      name: 'Codex',
      file: '~/.codex/config.toml',
      configuration: `[mcp_servers.linkrovia]
url = ${JSON.stringify(endpoint)}
bearer_token_env_var = "${tokenVariable}"`,
    },
    {
      id: 'claudeCode',
      name: 'Claude Code',
      file: '.mcp.json',
      configuration: JSON.stringify(
        { mcpServers: { linkrovia: runtime } },
        null,
        2,
      ),
    },
    {
      id: 'claudeConnector',
      name: 'Claude / Claude Desktop / Cowork',
      file: '',
      configuration: 'Authorization: Bearer YOUR_LINKROVIA_API_KEY',
    },
    {
      id: 'claudeDesktop',
      name: 'Claude Desktop (stdio)',
      file: 'claude_desktop_config.json',
      configuration: JSON.stringify(
        {
          mcpServers: {
            linkrovia: {
              command: 'mcp-remote',
              args: [
                endpoint,
                '--transport',
                'http-only',
                '--header',
                'Authorization:${LINKROVIA_MCP_AUTHORIZATION}',
                '--silent',
              ],
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot',
      file: '~/.copilot/mcp-config.json',
      configuration: JSON.stringify(
        { mcpServers: { linkrovia: { ...runtime, tools: ['*'] } } },
        null,
        2,
      ),
    },
    {
      id: 'vsCode',
      name: 'VS Code (editor-managed)',
      file: '.vscode/mcp.json',
      configuration: JSON.stringify(
        {
          inputs: [
            {
              type: 'promptString',
              id: 'linkrovia-mcp-token',
              description: tokenPrompt,
              password: true,
            },
          ],
          servers: {
            linkrovia: {
              ...http,
              headers: { Authorization: 'Bearer ${input:linkrovia-mcp-token}' },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'cursor',
      name: 'Cursor',
      file: '~/.cursor/mcp.json',
      configuration: JSON.stringify(
        { mcpServers: { linkrovia: hosted } },
        null,
        2,
      ),
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      file: '~/.gemini/settings.json',
      configuration: JSON.stringify(
        {
          mcpServers: {
            linkrovia: {
              httpUrl: endpoint,
              headers: runtime.headers,
            },
          },
        },
        null,
        2,
      ),
    },
  ] as const;
}
