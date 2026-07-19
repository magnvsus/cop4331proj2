# Inventory Hub

<img src="coffee/src/assets/icon.png" alt="Inventory Hub app icon" width="120" />

A coffee-shop inventory management app (COP 4331 project) with a Node/Express/MongoDB backend and a React/Vite frontend.

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

**`coffee/`** — the React frontend:
| Package | Purpose |
|---|---|
| `react`, `react-dom` | UI framework |
| `@capacitor/core` | Capacitor runtime — wraps the built web app as a native Android shell |
| `@capacitor/android` | Capacitor's Android platform project |
| `@capacitor/camera` | Native camera/gallery access for item photos (Android only) |
| `@capacitor-mlkit/barcode-scanning` | Native barcode scanning for the SKU field and inventory search (Android only) |
| `vite` *(dev)* | Dev server / build tool |
| `@vitejs/plugin-react` *(dev)* | React support for Vite |
| `typescript` *(dev)* | Type checking (`tsc -b`) |
| `vitest` *(dev)* | Frontend test runner |
| `oxlint` *(dev)* | Linting |
| `prettier` *(dev)* | Code formatting (`npm run format`) |
| `@capacitor/cli` *(dev)* | Capacitor CLI (`npx cap ...`) |
| `@types/react`, `@types/react-dom`, `@types/node` *(dev)* | Type declarations (`@types/node` is needed for type-checking `vite.config.ts`) |

## Environment variables

Create a `.env` file inside `backend/` (and, if you run the backend from the repo root via `npm start`, one at the repo root too) with:

```
PORT=5000
MONGODB_URI=<your MongoDB connection string>
MONGODB_DB_NAME=<your database name>
JWT_SECRET=<a random secret string>
JWT_EXPIRES_IN=24h
```

## Running the app for development

```bash
# Start the backend (from the repo root, auto-restarts on changes)
npm start

# In a separate terminal, start the frontend dev server (development only)
cd coffee
npm run dev
```

### Building the frontend for production

```bash
cd coffee
npm run build
```

This type-checks the project (`tsc -b`) and bundles it with Vite into `coffee/dist/`. Serve that folder's contents with any static file host, or preview the production build locally with:

```bash
npm run preview
```

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
