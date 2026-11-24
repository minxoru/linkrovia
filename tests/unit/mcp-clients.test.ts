import { describe, expect, it } from 'vitest';
import { mcpClientConfigurations } from '../../src/routes/admin/integrations/mcp/clients';

const endpoint = 'https://links.example.test/mcp';
const clients = mcpClientConfigurations(endpoint, 'Scoped API key');

function configuration(id: (typeof clients)[number]['id']) {
  return clients.find((client) => client.id === id)!.configuration;
}

describe('MCP client settings', () => {
  it('uses each native client schema and keeps credentials outside the examples', () => {
    expect(configuration('codex')).toContain(
      'bearer_token_env_var = "LINKROVIA_MCP_TOKEN"',
    );
    for (const id of ['claudeCode', 'copilot'] as const) {
      expect(JSON.parse(configuration(id))).toMatchObject({
        mcpServers: {
          linkrovia: {
            type: 'http',
            url: endpoint,
            headers: { Authorization: 'Bearer ${LINKROVIA_MCP_TOKEN}' },
          },
        },
      });
    }

    expect(JSON.parse(configuration('vsCode'))).toEqual({
      inputs: [
        {
          type: 'promptString',
          id: 'linkrovia-mcp-token',
          description: 'Scoped API key',
          password: true,
        },
      ],
      servers: {
        linkrovia: {
          type: 'http',
          url: endpoint,
          headers: { Authorization: 'Bearer ${input:linkrovia-mcp-token}' },
        },
      },
    });
    expect(JSON.parse(configuration('cursor')).mcpServers.linkrovia).toEqual({
      url: endpoint,
      headers: { Authorization: 'Bearer ${env:LINKROVIA_MCP_TOKEN}' },
    });
    expect(JSON.parse(configuration('gemini')).mcpServers.linkrovia).toEqual({
      httpUrl: endpoint,
      headers: { Authorization: 'Bearer ${LINKROVIA_MCP_TOKEN}' },
    });
  });

  it('shows only a placeholder for the hosted connector and uses an environment reference for the desktop bridge', () => {
    expect(configuration('claudeConnector')).toBe(
      'Authorization: Bearer YOUR_LINKROVIA_API_KEY',
    );
    expect(
      JSON.parse(configuration('claudeDesktop')).mcpServers.linkrovia,
    ).toEqual({
      command: 'mcp-remote',
      args: [
        endpoint,
        '--transport',
        'http-only',
        '--header',
        'Authorization:${LINKROVIA_MCP_AUTHORIZATION}',
        '--silent',
      ],
    });
  });
});
