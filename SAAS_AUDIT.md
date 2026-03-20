# SaaS Audit — fetchxrates-ui

> Focus: SaaS survival, security, and resilience gaps.  
> Not a feature list — these are things that can cause churn, breach, or outage.

---

---

## 2. Payment & Subscription

| # | Gap | Risk |
|---|-----|------|
| 2.1 | **Payment failure** has no dedicated UI state. If a Stripe webhook fires `invoice.payment_failed`, the user's subscription goes `inactive` on the backend, but the frontend only shows this when they reload and re-hydrate — there is no proactive "your payment failed, please update your card" banner. | Silent churn. |
| 2.2 | **Past-due grace period** is not surfaced. A user with `subscription.substatus === 'invoice_payment_failed'` navigates normally until the guard eventually kicks them to `/checkin`. They should see a dismissible banner prompting them to update billing details. | Churn from confusion. |
| 2.4 | After returning from the Stripe billing portal for upgrade (`?billing=updated`), the in-memory `UserProfile` signal is **not refreshed**. The account page shows stale plan info until hard reload. | User thinks upgrade didn't work → support tickets. |
| 2.5 | The `cancel-subscription?status=cancelled` confirmation is triggered purely by a **URL query param**. Any user can navigate to that URL manually and see the "cancelled" confirmation even without having cancelled. **💡 Fix:** Treat `?status=cancelled` as a trigger to force-reload the user profile from the backend, not as the source of truth. Only set `showConfirmation` when the refreshed data confirms `subscription.cancelAtPeriodEnd === true`. After reading the param, clear it from the URL via `router.navigate([], { queryParams: {}, replaceUrl: true })` to prevent bookmarking or sharing the confirmation screen. | Misleading UI; erosion of trust. |
| 2.6 | **Subscription re-activation flow** is missing. A cancelled-at-period-end user has no in-app path to re-subscribe other than navigating to the Stripe portal manually. | Prevents win-backs. |
| 2.7 | There is no **dunning UI** — no in-app prompts for users in `past_due` / `unpaid` state to update their payment method. | Revenue leakage. |

---

## 3. Security

| # | Gap | Risk |
|---|-----|------|
| 3.1 | The `BackendStatusInterceptor` redirects to `/error` on any `status === 0`. A **slow or intermittent API** (e.g. 30-second cold start on Lambda) returns `0` via timeout and the user is shown the error page unnecessarily. Add a retry with backoff before declaring backend down. | False-positive error screens damaging trust. |
| 3.2 | The `auth.interceptor.ts` attaches the Bearer token to **any** request that starts with `environment.backendUrl`. If the backend URL is ever a relative path or is misconfigured, tokens could be sent to unintended origins. | Token leakage. |
| 3.5 | OTP value is returned in the API response (noted in a code comment "Remove this in production"). If the frontend ever calls the OTP init endpoint, this leaks the OTP to the browser console / network tab. | Credential exposure. |

---

## 4. Error Handling & Resilience

| # | Gap | Risk |
|---|-----|------|

---

## 5. Observability & Support

| # | Gap | Risk |
|---|-----|------|
| 5.1 | No **client-side error tracking** (Sentry, Datadog RUM, etc.). JavaScript exceptions and unhandled promise rejections are invisible in production. | Cannot detect regressions after deploys. |
| 5.2 | No **analytics / product telemetry**. There is no way to know which features users engage with, where they drop off, or which plans convert best. | Cannot make informed SaaS decisions. |
| 5.3 | The `console.error` calls in services are the only debugging trail in production — there is no structured logging that correlates a frontend user action with a backend request (e.g. correlation IDs). | Hard to debug production issues. |

---

## 6. UX / SaaS Table-Stakes

| # | Gap | Risk |
|---|-----|------|
| 6.4 | No **password change** flow in user profile. *(Email cannot be changed in Cognito once set — accepted. Password change acknowledged as in-progress.)* | Support burden until self-service password change is live. |