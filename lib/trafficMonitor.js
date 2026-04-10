function normalizePath(value) {
  const text = String(value || '').trim();
  if (!text) return '/';
  try {
    const url = new URL(text, 'http://localhost');
    return url.pathname || '/';
  } catch (_) {
    const pathOnly = text.split('?')[0].split('#')[0];
    return pathOnly || '/';
  }
}

function estimateByteLength(value) {
  if (value == null) return 0;
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === 'string') return Buffer.byteLength(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch (_) {
    return 0;
  }
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(2)}MB`;
}

function takeTopEntries(map, limit = 10) {
  return Array.from(map.entries())
    .sort((a, b) => {
      const byteDiff = (b[1].bytes || 0) - (a[1].bytes || 0);
      if (byteDiff !== 0) return byteDiff;
      return (b[1].count || 0) - (a[1].count || 0);
    })
    .slice(0, limit);
}

function createTrafficMonitor(options = {}) {
  const intervalMs = Math.max(15 * 1000, Number(options.intervalMs) || 60 * 1000);
  const logger = typeof options.logger === 'function' ? options.logger : console.log;
  const inbound = new Map();
  const outbound = new Map();

  const flush = () => {
    if (inbound.size === 0 && outbound.size === 0) return;

    const inboundTop = takeTopEntries(inbound, 12).map(([key, value]) => `${key} count=${value.count} bytes=${formatBytes(value.bytes)}`);
    const outboundTop = takeTopEntries(outbound, 12).map(([key, value]) => `${key} count=${value.count} bytes=${formatBytes(value.bytes)}`);

    logger(`[traffic] summary interval=${intervalMs}ms`);
    if (inboundTop.length > 0) logger(`[traffic] inbound ${inboundTop.join(' | ')}`);
    if (outboundTop.length > 0) logger(`[traffic] outbound ${outboundTop.join(' | ')}`);

    inbound.clear();
    outbound.clear();
  };

  const timer = setInterval(flush, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    recordInbound(req, statusCode, bytes) {
      const method = String(req.method || 'GET').toUpperCase();
      const path = normalizePath(req.originalUrl || req.url || '/');
      const status = Number(statusCode) || 0;
      const key = `${method} ${path} ${status}`;
      const current = inbound.get(key) || { count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += Math.max(0, Number(bytes) || 0);
      inbound.set(key, current);
    },
    recordOutbound(config, responseLike) {
      const method = String((config && config.method) || 'GET').toUpperCase();
      const urlValue = String((config && config.url) || '');
      const path = normalizePath(urlValue);
      let host = 'unknown-host';
      try {
        host = new URL(urlValue).host;
      } catch (_) {}

      const status = Number(responseLike && responseLike.status) || Number(responseLike && responseLike.statusCode) || 0;
      let bytes = 0;
      try {
        const headers = responseLike && responseLike.headers ? responseLike.headers : null;
        const contentLength = headers && (headers['content-length'] || headers['Content-Length']);
        if (contentLength != null && String(contentLength).trim() !== '') {
          bytes = Number(contentLength) || 0;
        }
        if (!bytes && responseLike && Object.prototype.hasOwnProperty.call(responseLike, 'data')) {
          bytes = estimateByteLength(responseLike.data);
        }
      } catch (_) {}

      const key = `${method} ${host}${path} ${status || 'ERR'}`;
      const current = outbound.get(key) || { count: 0, bytes: 0 };
      current.count += 1;
      current.bytes += Math.max(0, Number(bytes) || 0);
      outbound.set(key, current);
    },
    createMiddleware() {
      return (req, res, next) => {
        let bytes = 0;
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);

        res.write = function patchedWrite(chunk, encoding, callback) {
          bytes += estimateByteLength(chunk);
          return originalWrite(chunk, encoding, callback);
        };

        res.end = function patchedEnd(chunk, encoding, callback) {
          bytes += estimateByteLength(chunk);
          return originalEnd(chunk, encoding, callback);
        };

        res.on('finish', () => {
          let finalBytes = bytes;
          try {
            const contentLength = res.getHeader('Content-Length');
            if ((Number(contentLength) || 0) > 0) {
              finalBytes = Number(contentLength) || finalBytes;
            }
          } catch (_) {}
          this.recordInbound(req, res.statusCode, finalBytes);
        });

        next();
      };
    },
    installAxiosMonitor(axios) {
      if (!axios || axios.__trafficMonitorInstalled) return;
      axios.__trafficMonitorInstalled = true;

      axios.interceptors.response.use(
        (response) => {
          try {
            this.recordOutbound(response && response.config, response);
          } catch (_) {}
          return response;
        },
        (error) => {
          try {
            const responseLike = error && error.response ? error.response : error;
            this.recordOutbound(error && error.config, responseLike);
          } catch (_) {}
          return Promise.reject(error);
        }
      );
    },
  };
}

module.exports = {
  createTrafficMonitor,
};