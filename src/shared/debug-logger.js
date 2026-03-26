const MAX_BUFFER = 500;
const SESSION_KEY = 'clusiv_debug_log';
let sessionId = Math.random().toString(36).slice(2, 10);
let buffer = [];

chrome.storage.session.get([SESSION_KEY], (result) => {
  if (Array.isArray(result[SESSION_KEY])) {
    buffer = result[SESSION_KEY];
  }
});

function persist() {
  chrome.storage.session.set({ [SESSION_KEY]: buffer.slice(-MAX_BUFFER) }, () => {
  });
}

function write(level, event, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    ts_mono: Number(performance.now().toFixed(2)),
    session: sessionId,
    level,
    event,
    ...data
  };

  const colors = {
    DEBUG: 'color:#7f8c8d',
    INFO: 'color:#2980b9;font-weight:bold',
    WARNING: 'color:#e67e22;font-weight:bold',
    ERROR: 'color:#c0392b;font-weight:bold',
    JOURNEY: 'color:#16a085;font-weight:bold'
  };

  console.log(`%c[CLUSIV][${level}] ${event}`, colors[level] || 'color:#333', data);

  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) {
    buffer = buffer.slice(-MAX_BUFFER);
  }

  persist();
  return entry;
}

export const ClusivLogger = {
  debug: (event, data) => write('DEBUG', event, data),
  info: (event, data) => write('INFO', event, data),
  warning: (event, data) => write('WARNING', event, data),
  error: (event, data) => write('ERROR', event, data),
  journey: (event, data) => write('JOURNEY', event, data),
  export() {
    return JSON.stringify(buffer, null, 2);
  },
  getBuffer() {
    return [...buffer];
  },
  clear() {
    buffer = [];
    chrome.storage.session.remove(SESSION_KEY);
  },
  getSessionId() {
    return sessionId;
  }
};

globalThis.ClusivLogger = ClusivLogger;

export default ClusivLogger;