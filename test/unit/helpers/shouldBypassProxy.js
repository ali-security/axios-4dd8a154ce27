import assert from 'assert';
import shouldBypassProxy from '../../../lib/helpers/shouldBypassProxy.js';

const originalNoProxy = process.env.no_proxy;
const originalNOProxy = process.env.NO_PROXY;

const setNoProxy = (value) => {
  process.env.no_proxy = value;
  process.env.NO_PROXY = value;
};

afterEach(() => {
  if (originalNoProxy === undefined) {
    delete process.env.no_proxy;
  } else {
    process.env.no_proxy = originalNoProxy;
  }

  if (originalNOProxy === undefined) {
    delete process.env.NO_PROXY;
  } else {
    process.env.NO_PROXY = originalNOProxy;
  }
});

describe('helpers::shouldBypassProxy', () => {
  it('should bypass proxy for localhost with a trailing dot', () => {
    setNoProxy('localhost,127.0.0.1,::1');

    assert.strictEqual(shouldBypassProxy('http://localhost.:8080/'), true);
  });

  it('should bypass proxy for bracketed ipv6 loopback', () => {
    setNoProxy('localhost,127.0.0.1,::1');

    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);
  });

  it('should support bracketed ipv6 entries in no_proxy', () => {
    setNoProxy('[::1]');

    assert.strictEqual(shouldBypassProxy('http://[::1]:8080/'), true);
  });

  it('should match wildcard and explicit ports', () => {
    setNoProxy('*.example.com,localhost:8080');

    assert.strictEqual(shouldBypassProxy('http://api.example.com/'), true);
    assert.strictEqual(shouldBypassProxy('http://localhost:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://localhost:8081/'), false);
  });

  it('should bypass proxy for 127.0.0.1 when no_proxy contains localhost', function () {
    setNoProxy('localhost');
    assert.strictEqual(shouldBypassProxy('http://127.0.0.1:7777/'), true);
  });

  it('should bypass proxy for [::1] when no_proxy contains localhost', function () {
    setNoProxy('localhost');
    assert.strictEqual(shouldBypassProxy('http://[::1]:7777/'), true);
  });

  it('should bypass proxy for localhost when no_proxy contains 127.0.0.1', function () {
    setNoProxy('127.0.0.1');
    assert.strictEqual(shouldBypassProxy('http://localhost:7777/'), true);
  });

  it('should bypass proxy for localhost when no_proxy contains ::1', function () {
    setNoProxy('::1');
    assert.strictEqual(shouldBypassProxy('http://localhost:7777/'), true);
  });

  it('should bypass proxy for 127.0.0.0/8 subnet when no_proxy contains 127.0.0.1 (GHSA-pmwg-cvhr-8vh7)', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://127.0.0.2:9191/secret'), true);
    assert.strictEqual(shouldBypassProxy('http://127.0.0.100:9191/secret'), true);
    assert.strictEqual(shouldBypassProxy('http://127.1.2.3:9191/secret'), true);
    assert.strictEqual(shouldBypassProxy('http://127.255.255.254:9191/secret'), true);
  });

  it('should bypass proxy for 127.0.0.0/8 subnet when no_proxy contains localhost', function () {
    setNoProxy('localhost');
    assert.strictEqual(shouldBypassProxy('http://127.0.0.2:7777/'), true);
    assert.strictEqual(shouldBypassProxy('http://127.1.2.3:7777/'), true);
  });

  it('should NOT bypass for non-loopback IPv4 addresses', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://128.0.0.1:9191/'), false);
    assert.strictEqual(shouldBypassProxy('http://126.255.255.255:9191/'), false);
    assert.strictEqual(shouldBypassProxy('http://10.0.0.1:9191/'), false);
    assert.strictEqual(shouldBypassProxy('http://192.168.1.1:9191/'), false);
  });

  it('should bypass proxy for full-form IPv6 loopback 0:0:0:0:0:0:0:1', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://[0:0:0:0:0:0:0:1]:8080/'), true);
  });

  it('should bypass proxy for IPv4-mapped IPv6 loopback ::ffff:127.0.0.1', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://[::ffff:127.0.0.1]:8080/'), true);
  });

  it('should treat 127.x.x.x as cross-equivalent to localhost and ::1', function () {
    setNoProxy('::1');
    assert.strictEqual(shouldBypassProxy('http://127.0.0.5:7777/'), true);
  });

  it('should still respect explicit port mismatch on no_proxy entries', function () {
    setNoProxy('127.0.0.1:8080');
    assert.strictEqual(shouldBypassProxy('http://127.0.0.2:8080/'), true);
    assert.strictEqual(shouldBypassProxy('http://127.0.0.2:9090/'), false);
  });

  it('should not bypass for hosts that merely contain 127 in other octets', function () {
    setNoProxy('localhost,127.0.0.1,::1');
    assert.strictEqual(shouldBypassProxy('http://10.0.0.127:8080/'), false);
    assert.strictEqual(shouldBypassProxy('http://200.127.0.1:8080/'), false);
  });

});
