import { createServer } from 'net';
import { AddressInfo } from 'net';
import { createServer as createHttpServer } from 'http';
import { cosecGet, networkProblem } from './cosec-api.client';

/** A COSEC server that can't be reached says why, naming the server but never the credentials. */
describe('COSEC connection failures', () => {
  it('say the server refused the connection, with its host and port', async () => {
    // A port that was free a moment ago: nothing listens there.
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));

    const failure = await cosecGet({ baseUrl: `http://127.0.0.1:${port}/cosec`, username: 'api', password: 'Secret-Pass-1' }, 'user', { action: 'get' }).catch((e: Error) => e);
    expect((failure as Error).message).toBe(
      `COSEC network error: the COSEC server at 127.0.0.1:${port} refused the connection. Check that COSEC is running and that the address and port in the COSEC settings are right.`,
    );
    expect((failure as Error).message).not.toContain('Secret-Pass-1');
  });

  it('try again when the server refuses for a moment, and get through once it is back', async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const { port } = probe.address() as AddressInfo;
    await new Promise((resolve) => probe.close(resolve));
    // Down at the first attempt, up 500 ms later (before the 1 s retry).
    const server = createHttpServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ user: [{ id: 'EMP001' }] })); });
    const back = setTimeout(() => server.listen(port, '127.0.0.1'), 500);
    try {
      const data = await cosecGet({ baseUrl: `http://127.0.0.1:${port}/cosec`, username: 'api', password: 'x' }, 'user', { action: 'get' });
      expect(data).toEqual({ user: [{ id: 'EMP001' }] });
    } finally {
      clearTimeout(back);
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it.each([
    ['ENOTFOUND', 'could not be found'],
    ['UND_ERR_CONNECT_TIMEOUT', 'did not respond'],
    ['EHOSTUNREACH', 'not reachable from this server'],
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'certificate'],
    ['EWHATEVER', 'could not be reached (EWHATEVER)'],
  ])('explain %s', (code, words) => {
    const error = Object.assign(new TypeError('fetch failed'), { cause: { code } });
    expect(networkProblem('https://cosec.example.in/cosec/api.svc/v2/user?action=get', error)).toContain(words);
    expect(networkProblem('https://cosec.example.in/cosec/api.svc/v2/user', error)).toMatch(/cosec\.example\.in(:443)?/);
  });
});
