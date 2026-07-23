# Inventory Hub

<img src="coffee/src/assets/icon.png" alt="Inventory Hub app icon" width="120" />

A coffee-shop inventory management app with a Node/Express/MongoDB backend and a React/Vite frontend.

## Project layout

```
.
├── backend/   Express API (auth, categories, items) backed by MongoDB/Mongoose
├── coffee/    React + TypeScript frontend (Vite)
└── package.json   Root wrapper scripts (start the backend, run all tests)
```

Each of the three directories above (`.`, `backend/`, `coffee/`) has its own `package.json` and its own dependencies, so install steps are needed in each one.

## Requirements

- **Node.js v20.19 or newer** (v22.12+ recommended) — required by `vite` and `mongoose`. Check with `node -v`.
- **npm** (bundled with Node).
- **A MongoDB connection string** (e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster) for the backend to connect to.

## Installing dependencies

Install dependencies in all three locations:

```bash
# 1. Root (test runner + start-script wrapper)
npm install

# 2. Backend API
cd backend
npm install
cd ..

# 3. Frontend
cd coffee
npm install
cd ..
```

### What gets installed

**Root** (`package.json`) — mainly a wrapper to run the backend and the full test suite from one place:
| Package | Purpose |
|---|---|
| `nodemon` *(dev)* | Auto-restarts the backend on file changes (`npm start`) |
| `jest` *(dev)* | Runs the backend test suite (`npm test`) |

**`backend/`** — the Express API:
| Package | Purpose |
|---|---|
| `express` | HTTP server / routing |
| `mongoose` | MongoDB object modeling |
| `bcryptjs` | Password hashing |
| `jsonwebtoken` | JWT auth tokens |
| `dotenv` | Loads `.env` config |
| `cors` | Cross-origin requests from the frontend |
| `multer` | Parses multipart/form-data uploads (item photos) |
| `sharp` | Resizes/compresses uploaded item photos before they're saved to disk |
| `nodemailer` | Sends the account-verification email on registration |

**`coffee/`** — the React frontend:
| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI framework |
| `@capacitor/core` | Capacitor runtime — wraps the built web app as a native Android shell |
| `@capacitor/android` | Capacitor's Android platform project |
| `@capacitor/camera` | Native camera/gallery access for item photos (Android only) |
| `@capacitor-mlkit/barcode-scanning` | Native barcode scanning for the SKU field and inventory search (Android only) |
| `@capacitor/local-notifications` | Native low-stock push notifications (Android only) |
| `vite` *(dev)* | Dev server / build tool |
| `@vitejs/plugin-react` *(dev)* | React support for Vite |
| `typescript` *(dev)* | Type checking (`tsc -b`) |
| `vitest` *(dev)* | Frontend test runner |
| `oxlint` *(dev)* | Linting |
| `prettier` *(dev)* | Code formatting (`npm run format`) |
| `@capacitor/cli` *(dev)* | Capacitor CLI (`npx cap ...`) |
| `@types/react`, `@types/react-dom`, `@types/node` *(dev)* | Type declarations (`@types/node` is needed for type-checking `vite.config.ts`) |

## Environment variables

A single `.env` file in the **repo root** is shared by both the backend and the frontend — there's no separate `.env` needed in `backend/` or `coffee/`. Copy the example and fill in real values:

```bash
cp .env.example .env
```

```
API_PORT=5000
MONGODB_URI=<your MongoDB connection string>
MONGODB_DB_NAME=<your database name>
JWT_SECRET=<a random secret string>
JWT_EXPIRES_IN=24h

# Account verification email (sent on registration)
EMAIL_USER=<your Gmail address>
EMAIL_APP_PASSWORD=<a Gmail App Password -- not your regular password>
EMAIL_FROM=<optional; defaults to EMAIL_USER>

# Days after verifying before an account is auto-deactivated (blocked from
# logging in). Optional; defaults to 7.
ACCOUNT_DEACTIVATION_DAYS=7

# Days after deactivation before the account is permanently deleted if it's
# never reactivated. Optional; defaults to 7.
ACCOUNT_DELETION_GRACE_DAYS=7

# The backend's public URL -- used by BOTH the backend (verification-email
# links) and the frontend (base URL for API calls)
API_DOMAIN=https://your-domain.com
```

`EMAIL_APP_PASSWORD` requires 2-Step Verification to be enabled on the Gmail account, then generating an [App Password](https://myaccount.google.com/apppasswords) for it — a regular Gmail password won't authenticate over SMTP.

`ACCOUNT_DEACTIVATION_DAYS` is a **one-time verification deadline**, not a recurring inactivity check — it starts counting from **registration**, and every account is on this clock the moment it's created. If it isn't verified in time, login is blocked with a distinct `ACCOUNT_DEACTIVATED` error code (restoring an existing session is blocked the same way) until it's verified — and the verification-link mechanism doubles as reactivation, so the exact same click that would verify a never-verified account also reactivates a deactivated one. The moment `verifyEmail` succeeds (on time, or late via a reactivation link), `deactivatesAt` is cleared for good — a verified account is never put back on this clock, no matter how long it goes unused afterward. A deactivated account that attempts to log in automatically gets a fresh link emailed to it, subject to the same 60-second resend cooldown enforced server-side (not just in the UI) so repeated login attempts can't spam the mailbox. If `ACCOUNT_DELETION_GRACE_DAYS` passes with no reactivation, the account and all its data (items, categories, uploaded photos) are permanently deleted the next time anyone attempts to log in to it or restore a session with its token — there's no background job, deletion is only ever checked lazily at that point. Either way, the account's email address is sent a notice that it happened. That same abandoned-past-its-grace state also gets checked during **registration**: signing up with an email that belongs to an account this far gone deletes the old one (with the same notice email) and creates the new account instead of rejecting it as already-taken — a still-verified account, or one that's deactivated but not yet past its grace period, still blocks registration normally.

`API_DOMAIN` is shared by both sides under the same name: the backend uses it to build the link in the verification email (the link itself is a backend route, `/api/auth/verify-email/:token`, that shows a plain confirmation page, not a frontend route), and the frontend uses it as the base URL for every API call. It's optional for local dev (defaults to `http://localhost:5000` on both sides), but for a production or Android build where the API is served from a different origin than the frontend, it needs to be set **before** running `npm run build` (see below) — Vite bakes it in at build time, there's no way to change it afterward without rebuilding.

Vite only exposes `VITE_`-prefixed variables to the frontend's client-side bundle by default; `API_DOMAIN` is the one deliberate exception, explicitly exposed via `define` in `coffee/vite.config.ts` (which also points Vite's env loading at this root file via `envDir`) — every other backend-only secret above stays out of the client bundle even though everything lives in one file.

## Running the app for development

```bash
# Start the backend (from the repo root, auto-restarts on changes)
npm start

# In a separate terminal, start the frontend dev server (development only)
cd coffee
npm run dev
```

### Building the frontend for production

Make sure the root `.env` has `API_DOMAIN` set to your deployed backend's URL first (see [Environment variables](#environment-variables)) — this also applies to Android builds, since `npx cap sync android` just copies this same build output into the native project.

```bash
cd coffee
npm run build
```

This type-checks the project (`tsc -b`) and bundles it with Vite into `coffee/dist/`. Serve that folder's contents with any static file host, or preview the production build locally with:

```bash
npm run preview
```

## Testing account deactivation

The deactivation/reactivation/deletion lifecycle (see [Environment variables](#environment-variables)) is entirely driven by two `.env` durations, `ACCOUNT_DEACTIVATION_DAYS` and `ACCOUNT_DELETION_GRACE_DAYS`. Both accept fractional values, so for local testing or a live demo, set them to a fraction of a day instead of waiting a real week:

```
ACCOUNT_DEACTIVATION_DAYS=0.0007   # ~1 minute
ACCOUNT_DELETION_GRACE_DAYS=0.0007 # ~1 minute
```

(`days × 86400` = seconds -- e.g. `30 / 86400 = 0.000347` for 30 seconds.)

Restart the backend after changing these (`npm start` picks up `.env` on startup, not live). With that in place, here's a script for demoing the whole lifecycle:

1. **Register** a new account through the app (or `POST /api/auth/register`) — **don't verify it yet.** Registration itself starts the `ACCOUNT_DEACTIVATION_DAYS` clock, so this alone is enough to demo the "never verified in time" path.
2. **Wait** past whatever you set `ACCOUNT_DEACTIVATION_DAYS` to (~1 minute with the value above).
3. **Attempt to log in.** You'll see the "Account deactivated" modal — and the backend console will log a fresh confirmation link at the same moment, since a deactivated login attempt auto-sends one (subject to the 60-second resend cooldown, so don't spam the login button expecting a new link every time). No need to wait on real email delivery: the backend logs the exact link to its console every time one is sent (`Verification/reactivation link for ...: https://...`), so you can just copy it from the terminal running `npm start`.
4. **To demonstrate reactivation:** open the link the console just logged. You'll get the "Account confirmed" confirmation page — this verifies the account and clears `deactivatesAt` for good, so logging in now succeeds. Check the Settings page too: the "Verification deadline" warning is gone, permanently -- a verified account is never put back on this clock, no matter how long it goes unused.
5. **To demonstrate auto-deletion instead:** don't click the link. Wait past `ACCOUNT_DELETION_GRACE_DAYS` as well, then attempt to log in (or just refresh the page) one more time — the account is deleted at that exact moment (there's no background job; deletion is only ever checked lazily, right when someone tries to use the account) and the response switches to a distinct "permanently deleted" message rather than the deactivated one. You can confirm it's actually gone by trying to log in again with the same credentials — you'll get the normal "Invalid email or password" for a nonexistent account. The backend console also logs `Account-deleted notice sent to ...` at that moment, matching a real email sent to the account.
6. **To demonstrate reclaiming an abandoned email:** right after step 5, register again with that same email address — it succeeds and creates a brand-new account (rather than "email already registered"), since the old one was already past its deletion grace.

If you verify *before* the deadline instead (the normal path), nothing ever gets blocked -- verifying on time clears `deactivatesAt` immediately, same as reactivating late does.

Remember to set both variables back to real day-scale values (or just remove them, since 7 is the default for both) before deploying for real.

## Running tests

```bash
# Run backend and frontend tests in sequence, from the repo root
npm test
```

## Formatting

```bash
cd coffee
npm run format         # rewrites files in place
npm run format:check   # check only, no changes -- useful in CI
```
