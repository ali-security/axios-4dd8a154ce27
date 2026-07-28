import platform from "../platform/index.js";
import utils from "../utils.js";
import isURLSameOrigin from "./isURLSameOrigin.js";
import cookies from "./cookies.js";
import buildFullPath from "../core/buildFullPath.js";
import mergeConfig from "../core/mergeConfig.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
import buildURL from "./buildURL.js";

export default (config) => {
  const newConfig = mergeConfig({}, config);

  // Read only own properties to prevent prototype pollution gadgets
  // (e.g. Object.prototype.baseURL = 'https://evil.com'). See GHSA-q8qp-cvcw-x6jj.
  const own = (key) => (utils.hasOwnProp(newConfig, key) ? newConfig[key] : undefined);

  const data = own('data');
  let withXSRFToken = own('withXSRFToken');
  const xsrfHeaderName = own('xsrfHeaderName');
  const xsrfCookieName = own('xsrfCookieName');
  let headers = own('headers');
  const auth = own('auth');
  const baseURL = own('baseURL');
  const allowAbsoluteUrls = own('allowAbsoluteUrls');
  const url = own('url');

  newConfig.headers = headers = AxiosHeaders.from(headers);

  newConfig.url = buildURL(buildFullPath(baseURL, url, allowAbsoluteUrls, newConfig), config.params, config.paramsSerializer);

  // HTTP basic authentication
  if (auth) {
    const username = utils.getSafeProp(auth, 'username') || '';
    const password = utils.getSafeProp(auth, 'password') || '';

    headers.set('Authorization', 'Basic ' +
      btoa(username + ':' + (password ? unescape(encodeURIComponent(password)) : ''))
    );
  }

  let contentType;

  if (utils.isFormData(data)) {
    if (platform.hasStandardBrowserEnv || platform.hasStandardBrowserWebWorkerEnv) {
      headers.setContentType(undefined); // Let the browser set it
    } else if ((contentType = headers.getContentType()) !== false) {
      // fix semicolon duplication issue for ReactNative FormData implementation
      const [type, ...tokens] = contentType ? contentType.split(';').map(token => token.trim()).filter(Boolean) : [];
      headers.setContentType([type || 'multipart/form-data', ...tokens].join('; '));
    }
  }

  // Add xsrf header
  // This is only done if running in a standard browser environment.
  // Specifically not if we're in a web worker, or react-native.

  if (platform.hasStandardBrowserEnv) {
    if (utils.isFunction(withXSRFToken)) {
      withXSRFToken = withXSRFToken(newConfig);
    }

    const shouldSendXSRF =
      withXSRFToken === true ||
      (withXSRFToken == null && isURLSameOrigin(newConfig.url));

    if (shouldSendXSRF) {
      const xsrfValue = xsrfHeaderName && xsrfCookieName && cookies.read(xsrfCookieName);

      if (xsrfValue) {
        headers.set(xsrfHeaderName, xsrfValue);
      }
    }
  }

  return newConfig;
}

