import { createServer, type ServerResponse } from 'node:http';

export class LiveServer {
  private clients: ServerResponse[] = [];
  private buffer: string[] = [];
  private server: ReturnType<typeof createServer>;

  constructor(readonly port: number = 7777) {
    this.server = createServer((req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        });
        res.end();
        return;
      }
      if (req.url !== '/events') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      for (const ev of this.buffer) {
        res.write(ev);
      }
      this.clients.push(res);
      req.on('close', () => {
        this.clients = this.clients.filter(c => c !== res);
      });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => resolve());
      this.server.on('error', reject);
    });
  }

  broadcast(msg: Record<string, unknown>): void {
    const ev = `data: ${JSON.stringify(msg)}\n\n`;
    this.buffer.push(ev);
    for (const c of this.clients) {
      try { c.write(ev); } catch { /* disconnected */ }
    }
  }

  close(): void {
    for (const c of this.clients) {
      try { c.end(); } catch { /* ignore */ }
    }
    this.server.close();
  }
}
