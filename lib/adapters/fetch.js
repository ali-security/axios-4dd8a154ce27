import platform from "../platform/index.js";
import utils from "../utils.js";
import AxiosError from "../core/AxiosError.js";
import composeSignals from "../helpers/composeSignals.js";
import {trackStream} from "../helpers/trackStream.js";
import AxiosHeaders from "../core/AxiosHeaders.js";
import {progressEventReducer, progressEventDecorator, asyncDecorator} from "../helpers/progressEventReducer.js";
import resolveConfig from "../helpers/resolveConfig.js";
import settle from "../core/settle.js";
import estimateDataURLDecodedBytes from '../helpers/estimateDataURLDecodedBytes.js';

const isFetchSupported = typeof fetch === 'function' && typeof Request === 'function' && typeof Response === 'function';
const isReadableStreamSupported = isFetchSupported && typeof ReadableStream === 'function';

// used only inside the fetch adapter
const encodeText = isFetchSupported && (typeof TextEncoder === 'function' ?
    ((encoder) => (str) => encoder.encode(str))(new TextEncoder()) :
    async (str) => new Uint8Array(await new Response(str).arrayBuffer())
);

const test = (fn, ...args) => {
  try {
    return !!fn(...args);
  } catch (e) {
    return false
  }
}

const supportsRequestStream = isReadableStreamSupported && test(() => {
  let duplexAccessed = false;

  const hasContentType = new Request(platform.origin, {
    body: new ReadableStream(),
    method: 'POST',
    get duplex() {
      duplexAccessed = true;
      return 'half';
    },
  }).headers.has('Content-Type');

  return duplexAccessed && !hasContentType;
});

const DEFAULT_CHUNK_SIZE = 64 * 1024;

const supportsResponseStream = isReadableStreamSupported &&
  test(() => utils.isReadableStream(new Response('').body));


const resolvers = {
  stream: supportsResponseStream && ((res) => res.body)
};

isFetchSupported && (((res) => {
  ['text', 'arrayBuffer', 'blob', 'formData', 'stream'].forEach(type => {
    !resolvers[type] && (resolvers[type] = utils.isFunction(res[type]) ? (res) => res[type]() :
      (_, config) => {
        throw new AxiosError(`Response type '${type}' is not supported`, AxiosError.ERR_NOT_SUPPORT, config);
      })
  });
})(new Response));

const getBodyLength = async (body) => {
  if (body == null) {
    return 0;
  }

  if(utils.isBlob(body)) {
    return body.size;
  }

  if(utils.isSpecCompliantForm(body)) {
    const _request = new Request(platform.origin, {
      method: 'POST',
      body,
    });
    return (await _request.arrayBuffer()).byteLength;
  }

  if(utils.isArrayBufferView(body) || utils.isArrayBuffer(body)) {
    return body.byteLength;
  }

  if(utils.isURLSearchParams(body)) {
    body = body + '';
  }

  if(utils.isString(body)) {
    return (await encodeText(body)).byteLength;
  }
}

const resolveBodyLength = async (headers, body) => {
  const length = utils.toFiniteNumber(headers.getContentLength());

  return length == null ? getBodyLength(body) : length;
}

export default isFetchSupported && (async (config) => {
  let {
    url,
    method,
    data,
    signal,
    cancelToken,
    timeout,
    onDownloadProgress,
    onUploadProgress,
    responseType,
    headers,
    withCredentials = 'same-origin',
    fetchOptions,
    maxContentLength,
    maxBodyLength,
  } = resolveConfig(config);

  const hasMaxContentLength = utils.isNumber(maxContentLength) && maxContentLength > -1;
  const hasMaxBodyLength = utils.isNumber(maxBodyLength) && maxBodyLength > -1;

  responseType = responseType ? (responseType + '').toLowerCase() : 'text';

  let composedSignal = composeSignals([signal, cancelToken && cancelToken.toAbortSignal()], timeout);

  let request;

  const unsubscribe = composedSignal && composedSignal.unsubscribe && (() => {
      composedSignal.unsubscribe();
  });

  let requestContentLength;

  try {
      // Enforce maxContentLength for data: URLs up-front so we never materialize
      // an oversized payload. The HTTP adapter applies the same check (see http.js
      // "if (protocol === 'data:')" branch).
      if (hasMaxContentLength && typeof url === 'string' && url.startsWith('data:')) {
        const estimated = estimateDataURLDecodedBytes(url);
        if (estimated > maxContentLength) {
          throw new AxiosError(
            'maxContentLength size of ' + maxContentLength + ' exceeded',
            AxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
      }

      // Enforce maxBodyLength against the outbound request body before dispatch.
      // Mirrors http.js behavior (ERR_BAD_REQUEST / 'Request body larger than
      // maxBodyLength limit'). Skip when the body length cannot be determined
      // (e.g. a live ReadableStream supplied by the caller).
      if (hasMaxBodyLength && method !== 'get' && method !== 'head') {
        const outboundLength = await resolveBodyLength(headers, data);
        if (
          typeof outboundLength === 'number' &&
          isFinite(outboundLength) &&
          outboundLength > maxBodyLength
        ) {
          throw new AxiosError(
            'Request body larger than maxBodyLength limit',
            AxiosError.ERR_BAD_REQUEST,
            config,
            request
          );
        }
      }

    if (
      onUploadProgress && supportsRequestStream && method !== 'get' && method !== 'head' &&
      (requestContentLength = await resolveBodyLength(headers, data)) !== 0
    ) {
      let _request = new Request(url, {
        method: 'POST',
        body: data,
        duplex: "half"
      });

      let contentTypeHeader;

      if (utils.isFormData(data) && (contentTypeHeader = _request.headers.get('content-type'))) {
        headers.setContentType(contentTypeHeader)
      }

      if (_request.body) {
        const [onProgress, flush] = progressEventDecorator(
          requestContentLength,
          progressEventReducer(asyncDecorator(onUploadProgress))
        );

        data = trackStream(_request.body, DEFAULT_CHUNK_SIZE, onProgress, flush);
      }
    }

    if (!utils.isString(withCredentials)) {
      withCredentials = withCredentials ? 'include' : 'omit';
    }

    // Cloudflare Workers throws when credentials are defined
    // see https://github.com/cloudflare/workerd/issues/902
    const isCredentialsSupported = "credentials" in Request.prototype;
    request = new Request(url, {
      ...fetchOptions,
      signal: composedSignal,
      method: method.toUpperCase(),
      headers: headers.normalize().toJSON(),
      body: data,
      duplex: "half",
      credentials: isCredentialsSupported ? withCredentials : undefined
    });

    let response = await fetch(request);

    // Cheap pre-check: if the server honestly declares a content-length that
    // already exceeds the cap, reject before we start streaming.
    if (hasMaxContentLength) {
      const declaredLength = utils.toFiniteNumber(response.headers.get('content-length'));
      if (declaredLength != null && declaredLength > maxContentLength) {
        throw new AxiosError(
          'maxContentLength size of ' + maxContentLength + ' exceeded',
          AxiosError.ERR_BAD_RESPONSE,
          config,
          request
        );
      }
    }

    const isStreamResponse = supportsResponseStream && (responseType === 'stream' || responseType === 'response');

    if (supportsResponseStream && response.body && (onDownloadProgress || hasMaxContentLength || (isStreamResponse && unsubscribe))) {
      const options = {};

      ['status', 'statusText', 'headers'].forEach(prop => {
        options[prop] = response[prop];
      });

      const responseContentLength = utils.toFiniteNumber(response.headers.get('content-length'));

      const [onProgress, flush] = onDownloadProgress && progressEventDecorator(
        responseContentLength,
        progressEventReducer(asyncDecorator(onDownloadProgress), true)
      ) || [];

      const onChunkProgress = (loadedBytes) => {
        if (hasMaxContentLength && loadedBytes > maxContentLength) {
          throw new AxiosError(
            'maxContentLength size of ' + maxContentLength + ' exceeded',
            AxiosError.ERR_BAD_RESPONSE,
            config,
            request
          );
        }
        onProgress && onProgress(loadedBytes);
      };

      response = new Response(
        trackStream(response.body, DEFAULT_CHUNK_SIZE, onChunkProgress, () => {
          flush && flush();
          unsubscribe && unsubscribe();
        }),
        options
      );
    }

    responseType = responseType || 'text';

    let responseData = await resolvers[utils.findKey(resolvers, responseType) || 'text'](response, config);

    // Fallback enforcement for environments without ReadableStream support
    // (legacy runtimes). Detect materialized size from typed output; skip
    // streams/Response passthrough since the user will read those themselves.
    if (hasMaxContentLength && !supportsResponseStream && !isStreamResponse) {
      let materializedSize;
      if (responseData != null) {
        if (typeof responseData.byteLength === 'number') {
          materializedSize = responseData.byteLength;
        } else if (typeof responseData.size === 'number') {
          materializedSize = responseData.size;
        } else if (typeof responseData === 'string') {
          materializedSize =
            typeof TextEncoder === 'function'
              ? new TextEncoder().encode(responseData).byteLength
              : responseData.length;
        }
      }
      if (typeof materializedSize === 'number' && materializedSize > maxContentLength) {
        throw new AxiosError(
          'maxContentLength size of ' + maxContentLength + ' exceeded',
          AxiosError.ERR_BAD_RESPONSE,
          config,
          request
        );
      }
    }

    !isStreamResponse && unsubscribe && unsubscribe();

    return await new Promise((resolve, reject) => {
      settle(resolve, reject, {
        data: responseData,
        headers: AxiosHeaders.from(response.headers),
        status: response.status,
        statusText: response.statusText,
        config,
        request
      })
    })
  } catch (err) {
    unsubscribe && unsubscribe();

    if (err && err.name === 'TypeError' && /fetch/i.test(err.message)) {
      throw Object.assign(
        new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request),
        {
          cause: err.cause || err
        }
      )
    }

    throw AxiosError.from(err, err && err.code, config, request);
  }
});


