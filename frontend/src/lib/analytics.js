import posthog from 'posthog-js';

/**
 * Product analytics + error tracking via PostHog (our Sentry replacement for errors too).
 *
 * It only initializes when VITE_PUBLIC_POSTHOG_KEY is set, so local dev and any
 * environment without a key run completely untouched — no network calls, no noise.
 *
 * What we get with almost no code:
 *  - autocapture: clicks, pageviews, form interactions
 *  - exception capture: uncaught errors + unhandled promise rejections (error monitoring)
 *  - identify(): tie events to a user after login
 */
let enabled = false;

export function initAnalytics() {
  const key = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
  if (!key || enabled) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: true,
    capture_exceptions: true, // sends uncaught errors + unhandled rejections to PostHog
    autocapture: true,
    persistence: 'localStorage+cookie',
  });
  enabled = true;
}

/** Associate subsequent events with a logged-in user. */
export function identifyUser(user) {
  if (!enabled || !user) return;
  posthog.identify(user.id || user._id, { email: user.email, name: user.name });
}

/** Clear identity on logout. */
export function resetAnalytics() {
  if (!enabled) return;
  posthog.reset();
}

/** Track a custom product event, e.g. capture('source_added', { type }). */
export function capture(event, props) {
  if (!enabled) return;
  posthog.capture(event, props);
}

export default posthog;
