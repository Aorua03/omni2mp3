type EventProperties = Record<string, string | number | boolean | undefined>;

const ALLOWED_PROPERTIES: Record<string, string[]> = {
  app_opened: ['device_type', 'browser_family', 'is_pwa', 'referrer_domain', 'utm_source', 'utm_medium', 'utm_campaign'],
  control_clicked: ['control_id', 'area'],
  files_imported: ['import_id', 'import_method', 'accepted_count', 'rejected_count'],
  file_queued: ['file_id', 'import_id', 'input_format', 'size_bucket'],
  file_started: ['file_id', 'import_id', 'input_format', 'size_bucket', 'queue_ms'],
  file_finished: [
    'file_id',
    'import_id',
    'status',
    'input_format',
    'output_mode',
    'process_ms',
    'decrypt_ms',
    'encoder_load_ms',
    'encoder_cold_start',
    'encode_ms',
    'error_stage',
    'error_code',
    'error_exit_code',
  ],
  zip_requested: ['song_count', 'size_bucket', 'name_policy'],
  zip_finished: ['status', 'zip_ms', 'song_count', 'size_bucket', 'error_code'],
  metadata_edit_finished: ['status', 'error_code'],
  audio_play_started: [],
};

const CONFIGURED_TOKEN = process.env.VUE_APP_POSTHOG_PROJECT_TOKEN || '';
const CONFIGURED_HOST = (process.env.VUE_APP_POSTHOG_HOST || '').replace(/\/$/, '');
const ENVIRONMENT = process.env.VUE_APP_ANALYTICS_ENV || process.env.NODE_ENV || 'unknown';
let appVersion = process.env.VUE_APP_VERSION || 'unknown';

let fallbackDistinctId = '';
let fallbackSessionId = '';

function uuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidV7(): string {
  const time = Date.now().toString(16).padStart(12, '0').slice(-12);
  const bytes = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const variant = (parseInt(hex[3], 16) & 0x3) | 0x8;
  return `${time.slice(0, 8)}-${time.slice(8)}-7${hex.slice(0, 3)}-${variant.toString(16)}${hex.slice(4, 7)}-${hex.slice(7, 19)}`;
}

function readOrCreate(storage: Storage, key: string, create: () => string): string {
  try {
    let value = storage.getItem(key);
    if (!value) {
      value = create();
      storage.setItem(key, value);
    }
    return value;
  } catch (_error) {
    if (key === 'omni_analytics_distinct_id') {
      if (!fallbackDistinctId) fallbackDistinctId = create();
      return fallbackDistinctId;
    }
    if (!fallbackSessionId) fallbackSessionId = create();
    return fallbackSessionId;
  }
}

function getSessionId(): string {
  const now = Date.now();
  const stored = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('omni_analytics_session') || 'null');
    } catch (_error) {
      return null;
    }
  })();
  if (!stored && fallbackSessionId) return fallbackSessionId;
  if (!stored || now - stored.lastSeenAt > 30 * 60 * 1000 || now - stored.startedAt > 24 * 60 * 60 * 1000) {
    const session = { id: uuidV7(), startedAt: now, lastSeenAt: now };
    try {
      sessionStorage.setItem('omni_analytics_session', JSON.stringify(session));
    } catch (_error) {
      fallbackSessionId = session.id;
    }
    return session.id;
  }
  stored.lastSeenAt = now;
  try {
    sessionStorage.setItem('omni_analytics_session', JSON.stringify(stored));
  } catch (_error) {
    fallbackSessionId = stored.id;
  }
  return stored.id;
}

export function createAnalyticsId(): string {
  return uuidV4();
}

export function initializeAnalytics(version: string): void {
  appVersion = version || appVersion;
}

export function sizeBucket(bytes: number): string {
  if (bytes < 5 * 1024 * 1024) return 'lt_5mb';
  if (bytes < 20 * 1024 * 1024) return '5_20mb';
  if (bytes < 100 * 1024 * 1024) return '20_100mb';
  return 'gte_100mb';
}

function environmentDetails(): EventProperties {
  const userAgent = navigator.userAgent;
  const browserFamily = /Edg\//.test(userAgent)
    ? 'edge'
    : /Chrome\//.test(userAgent)
      ? 'chrome'
      : /Firefox\//.test(userAgent)
        ? 'firefox'
        : /Safari\//.test(userAgent)
          ? 'safari'
          : 'other';
  const deviceType = /Mobi|Android/i.test(userAgent) ? 'mobile' : 'desktop';
  const details: EventProperties = {
    device_type: deviceType,
    browser_family: browserFamily,
    is_pwa: (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any).standalone === true,
  };
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer?.hostname) details.referrer_domain = referrer.hostname.slice(0, 120).toLowerCase();
    const params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign'].forEach((key) => {
      const value = params.get(key);
      if (value) details[key] = value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64) || 'other';
    });
  } catch (_error) {
    // Attribution is optional and must never prevent analytics or app startup.
  }
  return details;
}

export function track(event: string, properties: EventProperties = {}): void {
  if (!CONFIGURED_TOKEN || !CONFIGURED_HOST || !ALLOWED_PROPERTIES[event] || typeof fetch !== 'function') return;

  try {
    const allowed = ALLOWED_PROPERTIES[event];
    const safeProperties: EventProperties = {};
    allowed.forEach((key) => {
      const value = properties[key];
      if (value !== undefined) safeProperties[key] = value;
    });

    const payload = {
      token: CONFIGURED_TOKEN,
      event,
      properties: {
        ...safeProperties,
        distinct_id: (() => {
          try {
            return readOrCreate(localStorage, 'omni_analytics_distinct_id', uuidV4);
          } catch (_error) {
            if (!fallbackDistinctId) fallbackDistinctId = uuidV4();
            return fallbackDistinctId;
          }
        })(),
        $session_id: getSessionId(),
        $insert_id: uuidV4(),
        $process_person_profile: false,
        app_version: appVersion,
        environment: ENVIRONMENT,
        schema_version: 1,
        ...(['app_opened'].includes(event) ? environmentDetails() : {}),
      },
      timestamp: new Date().toISOString(),
    };

    fetch(`${CONFIGURED_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch (_error) {
    // Analytics is best-effort and must never interrupt the local conversion flow.
  }
}
