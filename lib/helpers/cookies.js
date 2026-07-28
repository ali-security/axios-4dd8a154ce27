import utils from './../utils.js';
import platform from '../platform/index.js';

export default platform.hasStandardBrowserEnv ?

  // Standard browser envs support document.cookie
  {
    write(name, value, expires, path, domain, secure) {
      const cookie = [name + '=' + encodeURIComponent(value)];

      utils.isNumber(expires) && cookie.push('expires=' + new Date(expires).toGMTString());

      utils.isString(path) && cookie.push('path=' + path);

      utils.isString(domain) && cookie.push('domain=' + domain);

      secure === true && cookie.push('secure');

      document.cookie = cookie.join('; ');
    },

    read(name) {
      // Match name=value by splitting on the semicolon separator instead of building a
      // RegExp from `name` — interpolating an unescaped string into a RegExp would let
      // metacharacters (e.g. `.+?` in an attacker-influenced cookie name) cause ReDoS or
      // match the wrong cookie. Browsers may serialize cookie pairs as either ";" or
      // "; ", so ignore optional whitespace before each cookie name.
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].replace(/^\s+/, '');
        const eq = cookie.indexOf('=');
        if (eq !== -1 && cookie.slice(0, eq) === name) {
          return decodeURIComponent(cookie.slice(eq + 1));
        }
      }
      return null;
    },

    remove(name) {
      this.write(name, '', Date.now() - 86400000);
    }
  }

  :

  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {},
    read() {
      return null;
    },
    remove() {}
  };

