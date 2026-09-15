const protocol = 'digitappointment/v1';

const supportedLocales = new Set(['en', 'nl']);
const textKeys = new Set([
  'selectDateTime', 'yourDetails', 'confirmBooking', 'chooseAnotherTime',
  'bookingConfirmed', 'rescheduleBooking', 'cancelBooking', 'popupLabel',
  'popupClose', 'popupTimeout', 'networkError',
]);
const shellText = {
  en: {
    popupLabel: 'Book a meeting',
    popupClose: 'Close booking popup',
    popupTimeout: 'The booking form took too long to open. Please try again.',
    networkError: 'The booking service could not be reached. Check your connection and try again.',
    openError: 'The booking popup could not be opened. Check its project access and try again.',
    invalidSession: 'The booking service returned an invalid popup session. Please try again.',
  },
  nl: {
    popupLabel: 'Een afspraak boeken',
    popupClose: 'Boekingsvenster sluiten',
    popupTimeout: 'Het boekingsformulier kon niet op tijd worden geopend. Probeer het opnieuw.',
    networkError: 'De boekingsservice is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.',
    openError: 'Het boekingsvenster kon niet worden geopend. Controleer de projecttoegang en probeer het opnieuw.',
    invalidSession: 'De boekingsservice heeft een ongeldige popupsessie teruggegeven. Probeer het opnieuw.',
  },
};
const trackingKey = /^[A-Za-z0-9_.-]{1,64}$/;
const trackingLimits = { entries: 30, valueLength: 1000, totalLength: 8000 };
const colorFields = ['primaryColor', 'backgroundColor', 'textColor', 'calendarBackgroundColor', 'calendarTextColor', 'calendarDateColor', 'calendarSelectedColor', 'calendarSelectedTextColor'];
const appearanceFields = new Set([...colorFields, 'fontFamily', 'borderRadius', 'width', 'height']);

function popupError(message, code = 'popup_error', retryable = false) {
  return Object.assign(new Error(message), { code, retryable });
}

function invalid(message) {
  throw popupError(message, 'invalid_configuration');
}

function localeOption(value) {
  const locale = value ?? 'auto';
  if (locale !== 'auto' && !supportedLocales.has(locale)) invalid("locale must be 'auto', 'en', or 'nl'.");
  return locale;
}

function configuredTexts(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('texts must be an object of supported text overrides.');
  const texts = {};
  let total = 0;
  for (const [key, text] of Object.entries(value)) {
    if (!textKeys.has(key)) invalid(`texts contains unsupported key '${key}'.`);
    if (typeof text !== 'string' || !text.trim() || text.length > 500) invalid(`texts.${key} must be a non-empty string of at most 500 characters.`);
    total += text.length;
    texts[key] = text;
  }
  if (total > 6000) invalid('texts may contain at most 6000 characters in total.');
  return texts;
}

function configuredTracking(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('tracking must be an object of string values.');
  const entries = Object.entries(value);
  if (entries.length > trackingLimits.entries) invalid(`tracking may contain at most ${trackingLimits.entries} entries.`);
  const tracking = {};
  let total = 0;
  for (const [key, text] of entries) {
    if (!trackingKey.test(key)) invalid(`tracking key '${key}' must use letters, digits, '_', '.', or '-' (1–64 characters).`);
    if (typeof text !== 'string' || text.length > trackingLimits.valueLength) invalid(`tracking.${key} must be a string of at most ${trackingLimits.valueLength} characters.`);
    total += key.length + text.length;
    tracking[key] = text;
  }
  if (total > trackingLimits.totalLength) invalid(`tracking may contain at most ${trackingLimits.totalLength} characters in total.`);
  return tracking;
}

function boundedNumber(appearance, name, minimum, maximum) {
  if (!Object.hasOwn(appearance, name)) return undefined;
  const value = appearance[name];
  if (!Number.isFinite(value) || value < minimum || value > maximum) invalid(`appearance.${name} must be a number from ${minimum} to ${maximum}.`);
  return value;
}

function configuredAppearance(value) {
  if (value === undefined) return { iframe: {}, shell: { width: 1080, height: 780, borderRadius: 18 } };
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('appearance must be an object of supported appearance values.');
  for (const key of Object.keys(value)) if (!appearanceFields.has(key)) invalid(`appearance contains unsupported key '${key}'.`);
  const iframe = {};
  for (const name of colorFields) {
    if (!Object.hasOwn(value, name)) continue;
    if (typeof value[name] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[name])) invalid(`appearance.${name} must be a six-digit hex color.`);
    iframe[name] = value[name];
  }
  if (Object.hasOwn(value, 'fontFamily')) {
    if (typeof value.fontFamily !== 'string' || !value.fontFamily.trim() || value.fontFamily.length > 120
      || !/^[a-zA-Z0-9 ,"'\-]+$/.test(value.fontFamily)) {
      invalid('appearance.fontFamily must be a safe font stack of at most 120 characters.');
    }
    iframe.fontFamily = value.fontFamily;
  }
  const borderRadius = boundedNumber(value, 'borderRadius', 0, 40);
  if (borderRadius !== undefined) iframe.borderRadius = borderRadius;
  return {
    iframe,
    shell: {
      width: boundedNumber(value, 'width', 320, 1200) ?? 1080,
      height: boundedNumber(value, 'height', 480, 900) ?? 780,
      borderRadius: borderRadius ?? 18,
    },
  };
}

function candidateLocale(value) {
  if (typeof value !== 'string') return null;
  const language = value.toLowerCase().split('-')[0];
  return supportedLocales.has(language) ? language : null;
}

function resolveLocale(configured) {
  if (configured !== 'auto') return configured;
  const candidates = [document.documentElement.lang, ...(navigator.languages || []), navigator.language];
  for (const candidate of candidates) {
    const locale = candidateLocale(candidate);
    if (locale) return locale;
  }
  return 'en';
}

function configuration(options) {
  let service;
  try { service = new URL(options?.serviceUrl); } catch { throw popupError('serviceUrl must be a valid HTTP(S) URL.', 'invalid_configuration'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(service.hostname);
  if ((service.protocol !== 'https:' && !(service.protocol === 'http:' && loopback)) || service.username || service.password || service.pathname !== '/' || service.search || service.hash) {
    throw popupError('serviceUrl must be an HTTPS origin without credentials, path, query, or fragment. Loopback HTTP is allowed for development.', 'invalid_configuration');
  }
  for (const [name, value] of [['projectKey', options?.projectKey], ['meetingType', options?.meetingType]]) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) throw popupError(`${name} is required.`, 'invalid_configuration');
  }
  const appearance = configuredAppearance(options?.appearance);
  return {
    serviceOrigin: service.origin,
    projectKey: options.projectKey.trim(),
    meetingType: options.meetingType.trim(),
    locale: localeOption(options?.locale),
    texts: configuredTexts(options?.texts),
    tracking: configuredTracking(options?.tracking),
    appearance: appearance.iframe,
    shell: appearance.shell,
    onComplete: typeof options.onComplete === 'function' ? options.onComplete : null,
    onError: typeof options.onError === 'function' ? options.onError : null,
  };
}

const detailEvent = (type, detail) => new CustomEvent(type, { detail });

export function createBookingPopup(options) {
  const config = configuration(options);
  let events = new EventTarget();
  let current = null;
  let destroyed = false;

  function emit(type, detail) {
    events.dispatchEvent(detailEvent(type, detail));
    try {
      if (type === 'complete') config.onComplete?.(detail);
      if (type === 'error') config.onError?.(detail);
    } catch {}
  }

  function close() {
    const opened = current;
    if (!opened || opened.closed) return;
    opened.closed = true;
    opened.abort.abort();
    clearTimeout(opened.readyTimeout);
    window.removeEventListener('message', opened.receive);
    window.removeEventListener('keydown', opened.escape);
    opened.dialog.removeEventListener('cancel', opened.cancel);
    opened.host.remove();
    const anotherPopup = document.querySelector('[data-digitappointment-popup]');
    if (!anotherPopup) {
      document.documentElement.style.overflow = document.documentElement.dataset.digitappointmentPreviousOverflow || '';
      delete document.documentElement.dataset.digitappointmentPreviousOverflow;
    }
    current = null;
    let opener = opened.opener;
    while (opener?.dataset?.digitappointmentPopup !== undefined && opener.digitappointmentOpener) opener = opener.digitappointmentOpener;
    if (!anotherPopup && opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    events.dispatchEvent(detailEvent('close'));
  }

  async function open(options) {
    if (destroyed) throw popupError('This booking popup was destroyed. Create a new instance.', 'popup_destroyed');
    // Per-open tracking (such as the page the popup opened from) merges over the configured block.
    const tracking = configuredTracking({ ...config.tracking, ...configuredTracking(options?.tracking) });
    if (typeof window === 'undefined' || typeof document === 'undefined') throw popupError('open() is available only in a browser.', 'browser_required');
    if (current) {
      current.closeButton.focus();
      return;
    }

    const locale = resolveLocale(config.locale);
    const copy = { ...shellText[locale], ...config.texts };
    const presentation = { locale, texts: { ...config.texts }, appearance: { ...config.appearance } };
    const channelId = crypto.randomUUID();
    const opener = document.activeElement;
    const abort = new AbortController();
    const host = document.createElement('div');
    host.dataset.digitappointmentPopup = '';
    host.digitappointmentOpener = opener;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{position:fixed;inset:0;z-index:2147483647}
      dialog{box-sizing:border-box;width:min(var(--da-popup-width),calc(100vw - 32px));height:min(var(--da-popup-height),calc(100dvh - 32px));max-width:none;max-height:none;margin:auto;padding:0;border:0;border-radius:var(--da-popup-radius);overflow:hidden;background:#fff;box-shadow:0 24px 80px rgba(12,30,24,.28)}
      dialog::backdrop{background:rgba(15,31,26,.7);backdrop-filter:blur(3px)}
      iframe{display:block;width:100%;height:100%;border:0;background:#f7f9f6}
      button{position:absolute;z-index:2;right:12px;top:12px;width:40px;height:40px;border:1px solid #d7dfda;border-radius:999px;background:#fff;color:#17211d;font:700 24px/1 system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(12,30,24,.12)}
      button:focus-visible{outline:3px solid #237766;outline-offset:2px}
      @media(max-width:600px){dialog{width:100vw;height:100dvh;border-radius:0}button{right:10px;top:10px}}
    </style><dialog><button type="button">×</button><iframe></iframe></dialog>`;
    const dialog = root.querySelector('dialog');
    const closeButton = root.querySelector('button');
    const iframe = root.querySelector('iframe');
    host.style.setProperty('--da-popup-width', `${config.shell.width}px`);
    host.style.setProperty('--da-popup-height', `${config.shell.height}px`);
    host.style.setProperty('--da-popup-radius', `${config.shell.borderRadius}px`);
    dialog.lang = locale;
    dialog.setAttribute('aria-label', copy.popupLabel);
    closeButton.setAttribute('aria-label', copy.popupClose);
    iframe.setAttribute('title', copy.popupLabel);
    const opened = { abort, channelId, closed: false, host, dialog, closeButton, iframe, opener };
    current = opened;
    if (!document.querySelector('[data-digitappointment-popup]')) {
      document.documentElement.dataset.digitappointmentPreviousOverflow = document.documentElement.style.overflow;
    }
    document.body.append(host);
    document.documentElement.style.overflow = 'hidden';

    opened.cancel = event => { event.preventDefault(); close(); };
    opened.escape = event => {
      const popups = document.querySelectorAll('[data-digitappointment-popup]');
      if (event.key === 'Escape' && popups[popups.length - 1] === host) { event.preventDefault(); close(); }
    };
    opened.receive = event => {
      const message = event.data;
      if (event.origin !== config.serviceOrigin || event.source !== iframe.contentWindow || !message
        || message.protocol !== protocol || message.channelId !== channelId) return;
      if (message.type === 'ready' && opened.sessionToken) {
        clearTimeout(opened.readyTimeout);
        iframe.contentWindow.postMessage({ protocol, channelId, type: 'init', sessionToken: opened.sessionToken, presentation, tracking }, config.serviceOrigin);
      }
      if (message.type === 'locale' && supportedLocales.has(message.locale)) {
        const translated = { ...shellText[message.locale], ...(message.locale === locale ? config.texts : {}) };
        dialog.setAttribute('aria-label', translated.popupLabel);
        closeButton.setAttribute('aria-label', translated.popupClose);
        iframe.setAttribute('title', translated.popupLabel);
        dialog.lang = message.locale;
      }
      if (message.type === 'request-close') close();
      if (message.type === 'error' && message.error && typeof message.error.message === 'string') emit('error', message.error);
      if (message.type === 'complete' && message.booking?.id && !opened.completedIds?.has(message.booking.id)) {
        (opened.completedIds ||= new Set()).add(message.booking.id);
        emit('complete', message.booking);
      }
    };
    closeButton.addEventListener('click', close);
    dialog.addEventListener('cancel', opened.cancel);
    window.addEventListener('message', opened.receive);
    window.addEventListener('keydown', opened.escape);
    dialog.showModal();
    closeButton.focus();

    try {
      const response = await fetch(`${config.serviceOrigin}/api/embed/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: config.projectKey, meetingType: config.meetingType, channelId }),
        signal: abort.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw popupError(copy.openError, result.code || 'bootstrap_failed', response.status >= 500);
      if (typeof result.integrationId !== 'string' || typeof result.sessionToken !== 'string' || result.sessionToken.length > 4096) {
        throw popupError(copy.invalidSession, 'invalid_service_response', true);
      }
      if (current !== opened || opened.closed) return;
      opened.sessionToken = result.sessionToken;
      const frame = new URL(`/embed/${encodeURIComponent(result.integrationId)}`, config.serviceOrigin);
      frame.hash = new URLSearchParams({ parentOrigin: window.location.origin, channelId }).toString();
      iframe.src = frame.href;
      opened.readyTimeout = setTimeout(() => {
        if (current !== opened || opened.closed) return;
        emit('error', { code: 'frame_timeout', message: copy.popupTimeout, retryable: true });
        if (current === opened) close();
      }, 15_000);
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (current !== opened || opened.closed) return;
      const detail = {
        code: error.code || 'network_error',
        message: error.code ? error.message : copy.networkError,
        retryable: error.retryable ?? true,
      };
      emit('error', detail);
      if (current === opened) close();
      throw popupError(detail.message, detail.code, detail.retryable);
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    close();
    config.onComplete = null;
    config.onError = null;
    events = new EventTarget();
  }

  return {
    open,
    close,
    destroy,
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
  };
}
