import cookies from '../../../lib/helpers/cookies';

describe('helpers::cookies', function () {
  afterEach(function () {
    // Remove all the cookies
    const expires = Date.now() - (60 * 60 * 24 * 7);
    document.cookie.split(';').map(function (cookie) {
      return cookie.split('=')[0];
    }).forEach(function (name) {
      document.cookie = name + '=; expires=' + new Date(expires).toGMTString();
    });
  });

  it('should write cookies', function () {
    cookies.write('foo', 'baz');
    expect(document.cookie).toEqual('foo=baz');
  });

  it('should read cookies', function () {
    cookies.write('foo', 'abc');
    cookies.write('bar', 'def');
    expect(cookies.read('foo')).toEqual('abc');
    expect(cookies.read('bar')).toEqual('def');
  });

  it('should remove cookies', function () {
    cookies.write('foo', 'bar');
    cookies.remove('foo');
    expect(cookies.read('foo')).toEqual(null);
  });

  it('should uri encode values', function () {
    cookies.write('foo', 'bar baz%');
    expect(document.cookie).toEqual('foo=bar%20baz%25');
  });

  it('reads cookies when the cookie separator has no following space', function () {
    const descriptor = Object.getOwnPropertyDescriptor(document, 'cookie');

    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get() {
        return 'foo=abc;bar=def';
      },
    });

    try {
      expect(cookies.read('bar')).toEqual('def');
    } finally {
      if (descriptor) {
        Object.defineProperty(document, 'cookie', descriptor);
      } else {
        delete document.cookie;
      }
    }
  });

  it('matches cookie names exactly even when the name contains regex metacharacters', function () {
    // previously cookies.read built a RegExp by interpolating
    // the requested name. Metacharacters could match a different cookie or trigger
    // catastrophic backtracking. A name such as "X.Y" must not match a cookie called
    // "XAY" set by the same site.
    cookies.write('XAY', 'wrong');

    expect(cookies.read('X.Y')).toEqual(null);
  });

  it('does not return a partial match for a name that is a prefix of another cookie', function () {
    cookies.write('xsrf-token-extra', 'wrong');

    expect(cookies.read('xsrf-token')).toEqual(null);
  });
});
