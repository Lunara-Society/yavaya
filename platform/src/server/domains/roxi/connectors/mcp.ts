import 'server-only';
import { safeRequest } from './safe-http';

/**
 * A small client for remote MCP servers over Streamable HTTP
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
 *
 * Each use is a short, stateless exchange: initialize, then one request
 * (tools/list or tools/call), with the session id the server hands back.
 * Answers may come as JSON or as a server-sent event stream; both are read.
 * Every request goes through safeRequest, so a member's server address can
 * never reach Yavaya's own network.
 */

export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown>; readOnly: boolean };

const PROTOCOL = '2025-06-18';

export class McpError extends Error {}

function parseBody(body: string, contentType: string, id: number): Record<string, unknown> | null {
  const messages: unknown[] = [];
  if (contentType.includes('text/event-stream')) {
    for (const block of body.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) {
        try {
          messages.push(JSON.parse(data));
        } catch {
          // a keep-alive or a malformed event: skipped
        }
      }
    }
  } else if (body.trim()) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (Array.isArray(parsed)) messages.push(...parsed);
      else messages.push(parsed);
    } catch {
      return null;
    }
  }
  const match = messages.find((message) => typeof message === 'object' && message !== null && (message as { id?: unknown }).id === id);
  return (match as Record<string, unknown> | undefined) ?? null;
}

async function rpc(url: string, headers: Record<string, string>, method: string, params: unknown, id: number | null, sessionId?: string): Promise<{ result: unknown; sessionId?: string }> {
  const response = await safeRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
      ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      ...headers,
    },
    body: JSON.stringify(id === null ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id, method, params }),
    timeoutMs: 20_000,
    maxBytes: 2_000_000,
  });
  if (response.status === 401 || response.status === 403) throw new McpError('unauthorized');
  if (id === null) return { result: null };
  if (response.status >= 400) throw new McpError(`http_${response.status}`);
  const message = parseBody(response.body, response.headers['content-type'] ?? '', id);
  if (!message) throw new McpError('no_answer');
  if (message.error) throw new McpError(String((message.error as { message?: unknown }).message ?? 'error').slice(0, 200));
  return { result: message.result, sessionId: response.headers['mcp-session-id'] ?? sessionId };
}

async function session(url: string, headers: Record<string, string>): Promise<string | undefined> {
  const init = await rpc(url, headers, 'initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'Yavaya Roxi', version: '1.0' } }, 1);
  await rpc(url, headers, 'notifications/initialized', {}, null, init.sessionId).catch(() => undefined);
  return init.sessionId;
}

export async function listMcpTools(url: string, headers: Record<string, string>): Promise<McpTool[]> {
  const sessionId = await session(url, headers);
  const { result } = await rpc(url, headers, 'tools/list', {}, 2, sessionId);
  const tools = ((result as { tools?: unknown[] } | null)?.tools ?? []) as Array<Record<string, unknown>>;
  return tools.slice(0, 60).map((tool) => ({
    name: String(tool.name ?? '').slice(0, 80),
    description: String(tool.description ?? '').slice(0, 500),
    inputSchema: (typeof tool.inputSchema === 'object' && tool.inputSchema ? tool.inputSchema : {}) as Record<string, unknown>,
    // Unless the server says a tool only reads, it is treated as one that changes something: the member confirms it.
    readOnly: (tool.annotations as { readOnlyHint?: unknown } | undefined)?.readOnlyHint === true,
  }));
}

/** Calls one tool; the answer comes back as text, cut to what a model can read. */
export async function callMcpTool(url: string, headers: Record<string, string>, name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const sessionId = await session(url, headers);
  const { result } = await rpc(url, headers, 'tools/call', { name, arguments: args }, 2, sessionId);
  const content = ((result as { content?: unknown[] } | null)?.content ?? []) as Array<Record<string, unknown>>;
  const text = content
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : part.type === 'resource' ? String((part.resource as { text?: unknown } | undefined)?.text ?? '') : `[${String(part.type)}]`))
    .join('\n')
    .slice(0, 6_000);
  return { text, isError: (result as { isError?: unknown } | null)?.isError === true };
}
