import { createServer, type Server, type Socket } from 'node:net';

/**
 * A minimal but genuine SMTP server for tests.
 *
 * It speaks the actual protocol over a real socket, so the adapter is
 * exercised end to end rather than against a mocked transport. Written by hand
 * with `node:net` instead of pulling in a dependency: it needs to run
 * unchanged in CI, and Python's `smtpd` was removed in 3.12.
 *
 * Supports exactly what a client needs to deliver a message — EHLO, MAIL,
 * RCPT, DATA, QUIT — and nothing else.
 */
export type ReceivedMessage = {
  from: string;
  to: string[];
  /** Raw message, headers and body. */
  data: string;
};

export type TestSmtpServer = {
  port: number;
  messages: ReceivedMessage[];
  close: () => Promise<void>;
};

export async function startTestSmtpServer(): Promise<TestSmtpServer> {
  const messages: ReceivedMessage[] = [];

  const server: Server = createServer((socket: Socket) => {
    let buffer = '';
    let inData = false;
    let current: ReceivedMessage = { from: '', to: [], data: '' };

    const write = (line: string) => socket.write(`${line}\r\n`);
    write('220 test.yavaya SMTP ready');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        const index = buffer.indexOf('\r\n');
        if (index === -1) break;
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current);
            current = { from: '', to: [], data: '' };
            write('250 OK: queued');
          } else {
            // A leading dot is doubled by the sender; undo that.
            current.data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          write('250-test.yavaya');
          write('250 SIZE 10240000');
        } else if (upper.startsWith('MAIL FROM:')) {
          current.from = extractAddress(line);
          write('250 OK');
        } else if (upper.startsWith('RCPT TO:')) {
          current.to.push(extractAddress(line));
          write('250 OK');
        } else if (upper === 'DATA') {
          inData = true;
          write('354 End data with <CR><LF>.<CR><LF>');
        } else if (upper === 'QUIT') {
          write('221 Bye');
          socket.end();
        } else if (upper === 'RSET') {
          current = { from: '', to: [], data: '' };
          write('250 OK');
        } else {
          write('250 OK');
        }
      }
    });

    socket.on('error', () => {
      // A client hanging up mid-conversation is not a test failure.
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') resolve(address.port);
      else reject(new Error('could not determine the test SMTP port'));
    });
  });

  return {
    port,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function extractAddress(line: string): string {
  const match = line.match(/<([^>]*)>/);
  if (match?.[1]) return match[1];
  return line.slice(line.indexOf(':') + 1).trim();
}
