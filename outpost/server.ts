// Voicebench's Outpost app: the published results (results/voicebench.json in this copy of the repository,
// which Outpost updates on every new commit) and the workflow's runs, live (<outpost-workflow-graph>).
import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const PAGE = 'ui://voicebench/main';
const server = new McpServer({ name: 'voicebench', version: '0.1.0' });
const results = () => JSON.parse(readFileSync(new URL('../results/voicebench.json', import.meta.url), 'utf8'));

server.registerResource('main', PAGE, { title: 'Voicebench', mimeType: 'text/html;profile=mcp-app' }, async () => ({
  contents: [{ uri: PAGE, mimeType: 'text/html;profile=mcp-app', text: readFileSync(new URL('./page.html', import.meta.url), 'utf8') }],
}));

server.registerTool(
  'voicebench',
  {
    description: "Voicebench's results: every speech model's score, word errors and wait, best first. Shows the Voicebench page, where runs can be started and followed.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: PAGE }, 'outpost/cacheSeconds': 0 },
  },
  async () => {
    const { date, models, input } = results();
    const summary = {
      date,
      speakers: input?.speakers?.length ?? 0,
      models, // full rows: the page shows a model's breakdown and facts when it is clicked
    };
    return { content: [{ type: 'text', text: JSON.stringify(summary) }], structuredContent: summary };
  },
);

await server.connect(new StdioServerTransport());
