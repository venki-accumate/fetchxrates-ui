# Login & Subscription Flow — Full Trace + Issues

## 1. Route Map

```
/login          → LoginComponent           [no guard]       hideLayout: true
/signup         → CheckinModule            [no guard]       hideLayout: true
/checkin        → CheckinModule            [authGuard]      hideLayout: true
/payment-success → StripeSuccessComponent  [authGuard]      hideMenuItems: true
/dashboard/**   → DashboardModule          [authGuard]
/api/**         → ApiModule                [authGuard, subscriptionGuard]
```

---

## 2. Auth State Architecture

`AuthStateService` holds two in-memory `BehaviorSubject` streams:

| Subject          | What it stores                          | Set by                                    |
|------------------|-----------------------------------------|-------------------------------------------|
| `userSubject`    | Amplify user (userId, username, email)  | `setUser()`, `hydrateFromAmplify()`       |
| `userDataSubject`| S3 user record (status, substatus, ...) | `setUserData()`                           |

**Critical**: Both are in-memory only. On any page refresh or direct URL navigation, both are `null` until explicitly rehydrated.

---

## 3. Flow A — Cognito Email/Password Login

```
User visits /login
  └─ LoginComponent.ngOnInit()
       ├─ fetchAuthSession()         ← Amplify SDK call
       │    ├─ Session exists?
       │    │    └─ getCurrentUser() → authState.setUser()
       │    │         └─ router.navigate(['/checkin'])
       │    └─ No session → showLogin = true
       │
       └─ User submits form → login()
            └─ signIn() → getCurrentUser() → postAuthenticationStep()
                 └─ authState.setUser() → router.navigate(['/checkin'])


/checkin (authGuard passes via fetchAuthSession)
  └─ CheckinComponent.ngOnInit() → handleUserDataAndNavigation()
       ├─ authState.getUser()  ← in-memory BehaviorSubject value
       │    ├─ null? → enterSignupFlowFromRoute() → show pricing
       │    │          [ISSUE 1: null on page refresh even for logged-in user]
       │    └─ user present → fetchUserData(user.email)
       │         └─ emailToSafeKey(email) → GET /aws-s3/user-file?user={hash}
       │
       ├─ API success → userExists(userData)
       │    ├─ status=active & substatus=subscription_created_active
       │    │    └─ router.navigate([homePage])
       │    │       [ISSUE 3: no return — code keeps executing after navigate]
       │    ├─ substatus=payment_succeeded_pending_activation
       │    │    └─ router.navigate(['/payment-success'])
       │    │       [ISSUE 3: same — no return]
       │    └─ any other status → show pricing (correct — no subscription yet)
       │
       └─ API error → newUser(err, user)
            ├─ err.status === 500 → showSignupFields = true (pre-fill from auth)
            │   [ISSUE 11: 404 is the correct HTTP code for "not found"; 500 is wrong]
            └─ other error → apiCallPending = false, spinner hides (no signup form shown)
```

---

## 4. Flow B — Gmail / Google OAuth Login

### B1. New user (not yet subscribed) via pricing page

```
User visits /signup  (no authGuard)
  └─ CheckinComponent → authState.getUser() = null
       └─ enterSignupFlowFromRoute() → show pricing with signup fields

PricingComponent.signInWith('Google')
  └─ localStorage.setItem('stripeFlow', { selectedPlan, googleFlow: true })
  └─ signInWithRedirect({ provider: 'Google' })
       └─ Browser redirects to Google → back to app

App reloads → router lands on /login (Amplify redirect URI)
  └─ LoginComponent.ngOnInit()
       └─ fetchAuthSession() → session found
            └─ getCurrentUser() → authState.setUser(user)
                 └─ router.navigate(['/checkin'])

/checkin (authGuard passes)
  └─ handleUserDataAndNavigation()
       └─ authState.getUser() → user (set moments ago in login ngOnInit — same in-memory session)
            └─ fetchUserData(user.email) → API error (new user)
                 └─ catch block reads localStorage['stripeFlow']
                      └─ stripeFlow.selectedPlan exists && googleFlow = true
                           └─ startCheckout({ priceId, userData: user })
                                [ISSUE 2: JSON.parse(emitJSON) called on an already-parsed object
                                 → throws "Unexpected token" error — ENTIRE GOOGLE CHECKOUT BROKEN]
```

### B2. Returning Google user (already subscribed)

```
App reloads → /login → session found → authState.setUser() → /checkin
  └─ handleUserDataAndNavigation()
       └─ fetchUserData() → API success → userExists(userData)
            └─ status=active → router.navigate([homePage])
```

### B3. Returning Google user — direct navigation / page refresh

```
User refreshes at /checkin
  └─ authGuard: fetchAuthSession() → passes (Amplify SDK check)
  └─ CheckinComponent.ngOnInit()
       └─ authState.getUser() → NULL  (BehaviorSubject reset on page reload)
            └─ enterSignupFlowFromRoute() → shows signup/pricing form
               [ISSUE 1: authenticated user sees signup form]
```

---

## 5. Flow C — Stripe Checkout & Payment Success

```
PricingComponent.startCheckout(priceId)
  └─ builds newUserData = { email, emailHash, firstName, lastName, subscription: 'Inactive', ... }
  └─ emits startStripeCheckout(JSON.stringify({ priceId, userData: newUserData }))

CheckinComponent.startCheckout(emitJSON: string)  ← receives JSON string from template event
  └─ JSON.parse(emitJSON)  ← OK here (string from $event)
  └─ saveUserData(userData)  ← POST to /aws-s3/save-user-file  (creates S3 record)
  └─ stripeCheckoutService.createCheckoutSession(priceId, userId, email)
       └─ window.location.href = stripeUrl  ← leaves app

Stripe checkout completes → redirects to /payment-success?session_id=xxx

/payment-success (authGuard: fetchAuthSession passes)
  └─ StripeSuccessComponent.ngOnInit()
       ├─ localStorage.removeItem('stripeFlow')
       ├─ username = localStorage.getItem('username')
       │   [ISSUE 9: 'username' key is never set anywhere — always null]
       ├─ hydrateFromAmplify()  ← sets userSubject only (not userDataSubject)
       ├─ updateUserStatus(sessionId)
       │    └─ const { email } = authState.getUserData()
       │         [ISSUE 6: getUserData() returns null — userDataSubject not set by hydrateFromAmplify]
       │         [CRASH: "Cannot destructure property 'email' of null"]
       └─ startPollingAfterDelay()
            └─ after 30s: doPoll()
                 └─ const { email } = authState.getUserData()
                      [ISSUE 6: same null crash in polling too]
```

---

## 6. Flow D — Subscription Guard (for /api route)

```
User navigates to /api
  └─ subscriptionGuard
       └─ authState.hasActiveSubscription()
            └─ userDataSubject.value?.subscription === 'Active'
               [ISSUE 4: backend never writes 'subscription' field to S3 user record]
               [stripe-success.controller.ts only writes: status, substatus, lastUpdate, stripeXxxId]
               [subscription field was set to 'Inactive' at signup and is NEVER updated to 'Active']
               [Guard always redirects to /checkin]
               
               [ISSUE 5: userDataSubject is null on page refresh even for valid subscribers]
               [Guard would also fail even if the field was correctly set]
```

---

## 7. Identified Issues — Full List

### 🔴 Critical (breaks functionality)

| # | File | Issue | Impact |
|---|------|-------|--------|
| **1** | `checkin.component.ts` | `authState.getUser()` returns null on any page refresh or direct URL visit because `userSubject` is in-memory only. `CheckinComponent` never calls `hydrateFromAmplify()`. | Authenticated users see the signup/pricing form on refresh |
| **2** | `checkin.component.ts` | In the Google catch block, `startCheckout({ priceId, userData: user })` passes an **object**, but `startCheckout()` opens with `JSON.parse(emitJSON)` → throws immediately. | **Entire Google new-user checkout flow is broken** |
| **3** | `checkin.component.ts` | `userExists()` calls `router.navigate()` without `return`. Code continues after navigation, calling `cdRef.detectChanges()` on a potentially destroyed view. | Race condition on navigation; potential ExpressionChanged errors |
| **4** | `stripe-success.component.ts` | `updateUserStatus()` and `doPoll()` destructure `email` from `authState.getUserData()` which is `null` after `hydrateFromAmplify()` (hydrate only fills `userSubject`, not `userDataSubject`). | Runtime crash on payment-success page |
| **5** | `fetchxrates-api` / `subscription.guard.ts` | Backend `stripe-success.controller.ts` never writes a `subscription: 'Active'` field — it only writes `status`/`substatus`. `subscriptionGuard` checks `userData.subscription === 'Active'` which can never be true. | `/api` route is permanently inaccessible to all users |

### 🟡 High (wrong behaviour, not a crash)

| # | File | Issue | Impact |
|---|------|-------|--------|
| **6** | `subscription.guard.ts` | Guard is fully synchronous — reads `userDataSubject.value` which is `null` on page refresh. Even a valid subscriber gets redirected to `/checkin` after any page reload. | Subscribers can't stay at `/api` across refreshes |
| **7** | `stripe-success.component.ts` | `localStorage.getItem('username')` — this key is never set anywhere in the codebase. `username` is always `null`. | Welcome message on payment-success page is always blank |
| **8** | `checkin.component.ts` (catch block) | When resuming Google OAuth flow, passes raw auth user (no `firstName`, `lastName`, `emailHash`) to `saveUserData`. Creates an incomplete S3 user record missing required fields. | Malformed user file in S3; downstream errors when reading user data |
| **9** | `checkin.component.ts` | `newUser()` only shows signup fields if `error.status === 500`. If API returns `404` for a non-existent user (semantically correct), signup fields never appear. | New users can't see the signup form |

### 🟢 Low (minor / code quality)

| # | File | Issue |
|---|------|-------|
| **10** | `checkin.module.ts` | Both `RouterModule.forChild(routes)` and `CheckinRoutingModule` are imported — routes are registered twice. The `:plan` param route only comes from `CheckinRoutingModule`; the inline `routes` constant is redundant. |
| **11** | `auth-state.service.ts` | In `hydrateFromAmplify()` catch block: `this.userDataSubject.next(null)` is called instead of `this.userSubject.next(null)`. Wrong subject is cleared on auth error. |
| **12** | `checkin.component.ts` | `spinner.hide()` called in `finally` block AND inside `userExists()` / `newUser()` — redundant double-hide. Harmless but cluttered. |
| **13** | `checkin.component.ts` | `checkIfLoggedIn()` method is defined but never called from `ngOnInit`. Dead code. |

---

## 8. Key Design Decisions to Confirm Before Fixing

1. **Who can access `/checkin`?**
   - Currently: only authenticated users (`authGuard`)
   - But pricing page is shown there — should unauthenticated users be able to see pricing?
   - Currently `/signup` (no guard) also loads `CheckinModule`. Is `/signup` the unauthenticated pricing entry point and `/checkin` the post-auth flow?

2. **`subscription` field vs `status`/`substatus` fields**
   - Which fields should be the source of truth for subscription validity?
   - Option A: Add `subscription: 'Active'` to the backend webhook handler and keep `subscriptionGuard` as-is
   - Option B: Change `subscriptionGuard` to check `status === 'active'` instead

3. **`subscriptionGuard` async hydration**
   - Should the guard call the API if `userDataSubject` is null, or should the app always hydrate from API on startup (e.g., in `APP_INITIALIZER`)?

4. **Google OAuth user data**
   - Should a Google user be asked for `firstName`/`lastName` before checkout, or should those be derived from the Google profile (available via Amplify token payload `given_name`/`family_name`)?
