# Login & Subscription Flow

> **Audience**: Developers and Business Analysts  
> **Last updated**: March 2026  
> **Related project**: `fetchxrates-api` (backend webhook handler)

---

## Business Summary

FetchXRates requires every user to have a **paid subscription** before accessing any feature.
There are two ways to sign up:

| Provider | How it works |
|---|---|
| **Google (OAuth)** | User clicks "Sign in with Google", is redirected through Google, returns to the app and is prompted to choose a plan and pay |
| **Cognito (Email/Password)** | User registers with email + password via the `/signup` page and subscribes as part of onboarding |

Until a subscription is confirmed by Stripe's webhook, the user cannot access the dashboard or API — they are held at the payment-success waiting screen.

---

## Subscription Status States

The user record (stored in AWS S3 at `Users/{emailHash}/user.json`) uses two fields as the source of truth:

| `status` | `substatus` | Meaning | What the app does |
|---|---|---|---|
| *(no record)* | — | Brand new user, never subscribed | Show pricing + signup form |
| `pending` | `payment_succeeded_pending_activation` | Stripe payment received, webhook processing | Show `/payment-success` with polling |
| `active` | `subscription_created_active` | ✅ Fully active subscriber | Route to `homePage` (default `/dashboard`) |
| `inactive` | `subscription_deleted` | Subscription cancelled | Show pricing page |
| `inactive` | `invoice_payment_failed` | Payment failed | Show pricing page |

> **Note**: The `status`/`substatus` fields are written by the Stripe webhook handler in `fetchxrates-api`.
> The legacy `subscription` field is set to `'Inactive'` when the record is first created and is **not** used for access control.

---

## Route Map

```
/login           [no guard]                   → LoginComponent
/signup          [no guard]                   → CheckinModule (unauthenticated pricing entry)
/checkin         [authGuard]                  → CheckinModule (authenticated routing hub)
/payment-success [authGuard]                  → StripeSuccessComponent
/dashboard/**    [authGuard]                  → DashboardModule
/api/**          [authGuard, subscriptionGuard] → ApiModule
```

### Who lands where

- **Unauthenticated users** → `/login` or `/signup`
- **All authenticated users** → `/checkin` (this is the routing hub — always passes through here)
- **Active subscribers** → `/dashboard` (redirected by `/checkin`)
- **Users who just paid** → `/payment-success` (redirected by `/checkin`)

---

## Flow A — Cognito Email/Password Login

### A1. New User Signup

```
User visits /signup
  └── CheckinComponent.ngOnInit()
       └── hydrateFromAmplify() → no session → user is null
            └── enterSignupFlowFromRoute() → shows PricingComponent with signup form

User fills in name/email/password, selects a plan, clicks Subscribe
  └── PricingComponent.startCheckout(priceId)
       └── builds newUserData { email, emailHash, firstName, lastName, ... }
            └── emits startStripeCheckout(JSON.stringify({ priceId, userData }))

CheckinComponent.startCheckout(jsonString)
  └── saveUserData(userData)          ← creates S3 user record (status: Inactive)
  └── createCheckoutSession(priceId)  ← POST to /stripe-checkout/create-session
       └── window.location.href = stripeUrl  ← user leaves app

Stripe payment completes → redirects to /payment-success?session_id=xxx
  └── StripeSuccessComponent.ngOnInit()
       ├── hydrateFromAmplify()        ← restores user from Amplify token
       ├── updateUserStatus(sessionId) ← POST /stripe-success/payment-success
       │    └── marks user as payment_succeeded_pending_activation in S3
       └── startPollingAfterDelay()   ← polls every 60s for up to 10 minutes
            └── Stripe webhook fires → updates S3 → status: active
                 └── poll detects active → router.navigate([homePage])
```

### A2. Returning User Login

```
User visits /login, submits credentials
  └── Amplify signIn() → getCurrentUser()
       └── authState.setUser(user)
            └── router.navigate(['/checkin'])

/checkin → CheckinComponent.ngOnInit()
  └── hydrateFromAmplify()    ← ensures user is set even on direct visits
  └── fetchUserData(email)    ← GET /aws-s3/user-file?user={emailHash}
       └── userExists(userData)
            └── status === active → router.navigate([userData.homePage])
```

---

## Flow B — Google OAuth Login

### B1. New Google User (First Time)

```
User visits /signup or /login, clicks "Sign in with Google"
  └── PricingComponent.signInWith('Google')
       └── localStorage.setItem('stripeFlow', { selectedPlan, googleFlow: true })
            └── signInWithRedirect({ provider: 'Google' })

→ Browser goes to Google → returns to Amplify callback URL (/login)

LoginComponent.ngOnInit()
  └── fetchAuthSession() → session found
       └── getCurrentUser() → authState.setUser(user)
            └── router.navigate(['/checkin'])

/checkin → handleUserDataAndNavigation()
  └── hydrateFromAmplify() → user is set
  └── fetchUserData(email) → 404 (user has no S3 record yet)
       └── catch block reads localStorage['stripeFlow']
            └── stripeFlow.selectedPlan && googleFlow === true
                 └── builds newUserData from Amplify user token
                      └── startCheckout(JSON.stringify({ priceId, userData }))
                           └── same Stripe → payment-success → webhook flow
```

### B2. Returning Google Subscriber

```
User visits any URL / page refresh
  └── authGuard: fetchAuthSession() → valid token → passes
  └── CheckinComponent (or direct to dashboard for /dashboard routes)
       └── hydrateFromAmplify() → user restored from token
            └── fetchUserData() → status: active → router.navigate([homePage])
```

> **Note on page refresh at `/api`**: `subscriptionGuard` reads in-memory state which is null on refresh → redirects to `/checkin` → checkin fetches user data → if active, navigates to `/dashboard`. The user does not land back at `/api` after refresh — they must navigate there again from the dashboard.

---

## State Architecture

`AuthStateService` holds two **in-memory** BehaviorSubjects:

```
AuthStateService
├── userSubject          { userId, username, email, givenName, familyName }
│   Set by:  setUser(), hydrateFromAmplify()
│   Cleared: on signOut()
│   ⚠️  Cleared on every page refresh
│       → Every component must call hydrateFromAmplify() on init
│
└── userDataSubject      S3 user record { status, substatus, homePage, ... }
    Set by:  setUserData()
    Cleared: on signOut()
    ⚠️  Never auto-fetched — only set by CheckinComponent after API call
        → subscriptionGuard will see null on page refresh (expected)
```

### `hydrateFromAmplify()` — what it does

Reads the current Amplify session token (stored in localStorage by the Amplify SDK — **not** the same as Angular's in-memory state). Extracts `email`, `given_name`, `family_name` from the JWT payload and populates `userSubject`.

**This must be called by any component that needs user identity and may be reached via direct URL or page refresh.**
Currently called in: `CheckinComponent`, `StripeSuccessComponent`.

---

## Key Files

| File | Role |
|---|---|
| `src/app/modules/login/login.component.ts` | Cognito form login + Google OAuth trigger |
| `src/app/modules/checkin/checkin.component.ts` | **Central routing hub** — all users pass through here |
| `src/app/modules/checkin/pricing/pricing.component.ts` | Plan selection + signup form + Google sign-in button |
| `src/app/components/stripe-success/stripe-success.component.ts` | Post-payment waiting page with auto-polling |
| `src/app/services/auth-state.service.ts` | In-memory auth state holder |
| `src/app/services/fetchXR-api.service.ts` | All API calls to `fetchxrates-api` |
| `src/app/services/stripe-checkout.service.ts` | Creates Stripe checkout sessions |
| `src/app/guards/auth.guard.ts` | Checks Amplify session (SDK call — survives page refresh) |
| `src/app/guards/subscription.guard.ts` | Checks in-memory userData for active subscription |

---

## Guards

### `authGuard`
Calls `fetchAuthSession()` directly from the Amplify SDK. This reads the locally stored Amplify tokens (IndexedDB/localStorage). Works correctly across page refreshes.

```typescript
// Passes if a valid Amplify session token exists
if (session?.tokens?.idToken) return true;
else router.navigate(['/login']);
```

### `subscriptionGuard`
Synchronous check against in-memory `userDataSubject`. On page refresh at a guarded route, `userDataSubject` is null → redirects to `/checkin`. This is **expected behaviour**: checkin will re-fetch user data and route correctly.

```typescript
// Active = status:active AND substatus:subscription_created_active
return authState.hasActiveSubscription() ? true : router.createUrlTree(['/checkin']);
```

---

## Stripe Webhook Integration

The backend (`fetchxrates-api`) receives Stripe events at `POST /stripe-success/webhook`.

The webhook verifies the Stripe signature using `STRIPE_EVENTS_SECRET` (Lambda environment variable) and then updates the user's S3 record:

| Stripe Event | S3 Update |
|---|---|
| `checkout.session.completed` | `status: pending`, `substatus: checkout_session_completed` |
| `customer.subscription.created` (active) | `status: active`, `substatus: subscription_created_active` |
| `invoice.payment_succeeded` | `status: active`, `substatus: invoice_payment_succeeded` |
| `invoice.payment_failed` | `status: inactive`, `substatus: invoice_payment_failed` |
| `customer.subscription.deleted` | `status: inactive`, `substatus: subscription_deleted` |

The `StripeSuccessComponent` polls `GET /aws-s3/user-file?user={emailHash}` every 60 seconds (after an initial 30-second delay) for up to 10 attempts, watching for `status: active`.

---

## Email Hashing

User records are keyed by a SHA-256 hash of the lowercase email address. This hash is used as the S3 path prefix (`Users/{hash}/user.json`) and as the `user` query parameter in API calls.

The same `emailToSafeKey()` helper is duplicated in `CheckinComponent`, `PricingComponent`, and `StripeSuccessComponent`.

---

## Known Limitations & Future Improvements

| # | Limitation | Suggested Fix |
|---|---|---|
| 1 | `userDataSubject` is never auto-hydrated | Add `APP_INITIALIZER` that fetches user data on app boot if Amplify session exists |
| 2 | After page refresh at `/api`, user is redirected to `/dashboard` not back to `/api` | `subscriptionGuard` could save intended URL in `sessionStorage` and redirect back after checkin |
| 3 | Google name from OAuth (`given_name`) may not match the name the user wants displayed | Add a profile edit screen |
| 4 | `emailToSafeKey()` duplicated in 3 components | Extract to a shared utility service |
| 5 | No error state shown if Stripe checkout session creation fails | Add UI error handling in `CheckinComponent.startCheckout()` |
