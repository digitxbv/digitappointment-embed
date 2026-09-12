# @digitxbv/digitappointment

A small, dependency-free JavaScript popup for booking meetings with a hosted DigitAppointment service. Works with Nuxt, Vue, React, or plain JavaScript. The service handles Microsoft 365 availability, booking questions, confirmation emails, and Teams meetings.

## Install

Install from a pinned GitHub tag, just like DigitCookie. No npm registry account or token is needed:

```sh
npm install github:digitxbv/digitappointment-embed#v0.2.0
```

Your `package.json` will contain:

```json
{
  "dependencies": {
    "@digitxbv/digitappointment": "github:digitxbv/digitappointment-embed#v0.2.0"
  }
}
```

Commit the lockfile. This repository contains the ready-to-use package: no build step or service source is downloaded. It is distributed through GitHub, not published on npmjs.com. Import it by its package name, as shown below.

## Before integrating

In the booking service administrator:

1. Connect the host's Microsoft calendar and publish a meeting type.
2. Open **Integrations**, create or use an integration for your product, and allow its meeting types.
3. Add every exact website origin, for example `https://www.example.com`, `https://app.example.com`, and `http://localhost:3000`. Origins have no path or trailing slash; wildcard domains are not supported. HTTP is allowed only for localhost/loopback development.
4. Copy the **public project key** shown when creating or rotating the integration. Use the published meeting type's slug, not its title or ID.

The public project key is intended for browser configuration. Never pass Microsoft credentials, admin passwords, calendar encryption keys, or private API tokens to this package.

## Quick start

```html
<button id="book-demo" type="button">Book a demo</button>
<p id="booking-error" role="alert"></p>
```

```js
import { createBookingPopup } from '@digitxbv/digitappointment';

const button = document.querySelector('#book-demo');
const errorMessage = document.querySelector('#booking-error');
const popup = createBookingPopup({
  serviceUrl: 'https://appointments.example.com', // Your booking service origin
  projectKey: 'dap_public_REPLACE_WITH_YOUR_PUBLIC_KEY',
  meetingType: 'product-demo',
  locale: 'nl',
  onComplete(booking) {
    console.log('Booked:', booking.id, booking.start, booking.host.name);
  },
  onError(error) {
    errorMessage.textContent = error.message;
  },
});

button.addEventListener('click', () => {
  errorMessage.textContent = '';
  void popup.open().catch(() => {}); // onError displays startup failures.
});
// When removing this feature or navigating away in an SPA:
// popup.destroy();
```

A pooled meeting type automatically assigns one available host. A personal meeting type books its configured host. The integration code is the same for both.

## Nuxt / Vue

Define public runtime configuration in your product. For Nuxt:

```js
// nuxt.config.js
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      appointmentsUrl: '',
      appointmentsKey: '',
    },
  },
});
```

Provide `NUXT_PUBLIC_APPOINTMENTS_URL` and `NUXT_PUBLIC_APPOINTMENTS_KEY` using your project's environment manager. These are public browser settings. Then use this component:

```vue
<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { createBookingPopup } from '@digitxbv/digitappointment';

const config = useRuntimeConfig();
const error = ref('');
let popup;

async function bookDemo() {
  error.value = '';
  try {
    popup ??= createBookingPopup({
      serviceUrl: config.public.appointmentsUrl,
      projectKey: config.public.appointmentsKey,
      meetingType: 'product-demo',
      locale: 'nl',
      appearance: { primaryColor: '#f27405', width: 960, height: 760 },
      onComplete(booking) { console.log('Booked:', booking.id); },
      onError(failure) { error.value = failure.message; },
    });
    await popup.open();
  } catch (failure) {
    error.value = failure.message;
  }
}

onBeforeUnmount(() => popup?.destroy());
</script>

<template>
  <button type="button" @click="bookDemo">Plan een demo</button>
  <p v-if="error" role="alert">{{ error }}</p>
</template>
```

For plain Vue, replace `useRuntimeConfig()` with your own configuration. Import is SSR-safe; only call `open()` in the browser. In React, keep the popup in a ref, open it from a click handler, and call `destroy()` from effect cleanup. Each instance keeps its own configuration; create a new instance to change it.

## Colors, size, and branding

Default branding and colors are managed per meeting type under **Booking-page style**. **Hide DigitAppointment branding** is enabled by default and removes the header and powered-by footer. The meeting's own logo stays visible. This setting also applies inside the popup; it is not a client-side option.

Override only the colors you need for a particular product:

```js
appearance: {
  primaryColor: '#f27405',
  backgroundColor: '#fffaf5',
  textColor: '#29221d',
  calendarBackgroundColor: '#ffffff',
  calendarTextColor: '#29221d',
  calendarDateColor: '#b64a00',
  calendarSelectedColor: '#f27405',
  calendarSelectedTextColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  borderRadius: 16,
  width: 960,
  height: 760,
}
```

| Option | Purpose / default |
| --- | --- |
| `primaryColor` | Main action buttons; saved meeting color, then `#237766` |
| `backgroundColor` | Page background; saved meeting color, then `#f7f9f6` |
| `textColor` | Page text; saved meeting color, then `#202925` |
| `calendarBackgroundColor` | Calendar/form panel; saved meeting color, then `#ffffff` |
| `calendarTextColor` | Calendar/form text; saved meeting color, then `#202925` |
| `calendarDateColor` | Available dates, time-slot text and borders; saved override, otherwise effective primary color |
| `calendarSelectedColor` | Selected date/time background; saved override, otherwise effective date color |
| `calendarSelectedTextColor` | Selected date/time text; saved meeting color, then `#ffffff` |
| `fontFamily` | CSS font stack, up to 120 characters; defaults to the service system stack |
| `borderRadius` | 0–40 pixels; default 18 |
| `width` | 320–1200 pixels; default 1080 |
| `height` | 480–900 pixels; default 780 |

Colors must use six-digit hex (`#123abc`). Date hover backgrounds are derived from the chosen date and calendar background colors. Saved meeting settings apply unless that exact option is supplied in `appearance`. In the admin, reset date/selection overrides to restore inherited colors. Choose readable text/background combinations.

The popup stays within the viewport and fills small screens. Styles are isolated from your product; changing its CSS will not style the iframe. Fonts must already be available inside the booking service or on the device; this package does not download font files. Allowed font-stack characters are letters, digits, spaces, commas, quotes, and hyphens. Unknown options and invalid values throw during construction. Calendar color options require service version 0.2.0 or later; deploy the service before updating consumers.

## Language and text

`locale` accepts `en`, `nl`, or `auto` (default). Automatic mode checks the product's document language, then browser languages, and falls back to English. The booking retains its language for confirmation, cancellation, and rescheduling. Authored descriptions and questions are not translated.

Use `texts` for individual interface labels:

```js
texts: {
  selectDateTime: 'Kies een moment',
  confirmBooking: 'Plan mijn demo',
  popupLabel: 'Plan een demo',
  popupClose: 'Sluiten',
}
```

Supported keys: `selectDateTime`, `yourDetails`, `confirmBooking`, `chooseAnotherTime`, `bookingConfirmed`, `rescheduleBooking`, `cancelBooking`, `popupLabel`, `popupClose`, `popupTimeout`, `networkError`. Values are plain text, 1–500 characters. HTML is displayed literally. Custom text affects this popup, not service-generated emails.

## Lifecycle and events

- `await popup.open()` authorizes and opens the popup. Handle rejection for startup/network failures. Calling it again while open focuses the existing popup.
- `popup.close()` closes it; the instance can reopen.
- `popup.destroy()` closes it and permanently disposes the instance.
- `popup.addEventListener('complete', event => ...)`, `'error'`, and `'close'` are also supported; payloads are in `event.detail`. Remove listeners with `removeEventListener` when appropriate.

`onComplete` and `complete` report a confirmed booking: `id`, `status`, `start`, `end`, `timezone`, `meeting` (`title`, `duration`), `host` (`id`, `name`, `timezone`), and `teamsJoinUrl`. Private management credentials and invitee answers are not exposed to the parent. Completion is deduplicated for the current popup opening; server-side submission retries retain the same booking. The popup stays open to show confirmation unless you explicitly close it.

Errors include a readable `message` and a stable `code`; startup errors also include `retryable`. Examples: `invalid_configuration`, `browser_required`, `popup_destroyed`. Availability or form errors remain in the form, preserving entered details for retry. Escape and the close button restore focus to the opener.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Popup unauthorized / 403 | Exact product origin, active public key, and allowed meeting type. Rotation requires updating the key and reopening. |
| No dates/times | Published meeting type, connected host calendar, working hours, notice, buffers, and booking horizon in the service. |
| Frame or bootstrap blocked by CSP | Allow the booking origin in `frame-src` and `connect-src`. The package also creates inline styles; your product's `style-src` policy must permit them. |
| Colors not changing | Use `appearance`, not host-page CSS; saved calendar overrides are independent of the primary color. Update the service for the new options. |
| Popup opened from server rendering | Move `open()` into a click handler or browser lifecycle hook. |

Requires a modern browser with ES modules, `fetch`, `<dialog>`, Shadow DOM, and `crypto.randomUUID`. Use HTTPS in production. This package contains no Microsoft connection logic or credentials; those stay in the hosted service.
