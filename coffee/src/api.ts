// src/api.ts
//
// All calls to the real backend live here, matched against the actual
// authController / categoryController / itemController you shared.

const APP_DOMAIN = 'aecm.site' // TODO: replace with your actual domain if different

function buildPath(route: string): string {
  if (import.meta.env.DEV) {
    return 'http://localhost:5000' + route
  }
  return 'https://' + APP_DOMAIN + route
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Item photos come back from the upload endpoint as a path relative to the
// API host (e.g. "/uploads/xxx.jpg"), not a full URL -- resolve it against
// the same host api.ts already talks to. Leaves already-absolute URLs (e.g.
// the external Unsplash links seed.js uses for demo data) untouched.
export function resolveImageUrl(pictureURL?: string): string | undefined {
  if (!pictureURL) return undefined
  if (/^(https?:)?\/\//.test(pictureURL) || pictureURL.startsWith('data:')) return pictureURL
  return buildPath(pictureURL)
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data.error || data.message || `Request failed (${res.status})`
    throw new Error(data.details ? `${message}: ${data.details}` : message)
  }
  return data
}

// ---------------- Auth ----------------

export type NotificationFrequency = 'immediate' | 'hourly' | 'daily'

export type AccountSettings = {
  companyName: string
  businessType: string
  managerName: string
  accentColor: string
  notificationsEnabled: boolean
  notificationFrequency: NotificationFrequency
}

export type AuthUser = {
  id: string
  email: string
  isVerified?: boolean
  bannerImage?: string
  settings?: AccountSettings
}

// register does NOT log the user in -- your authController only returns a
// confirmation message, so the caller needs to call login() afterward.
export async function register(email: string, password: string): Promise<{ message: string }> {
  const res = await fetch(buildPath('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handle(res)
}

export type ResendVerificationResult =
  { ok: true } | { ok: false; message: string; retryAfterSeconds?: number }

// Doesn't throw on failure (unlike the rest of this file) so the caller can
// read retryAfterSeconds off a 429 and sync the resend button's cooldown to
// the server's authoritative value -- e.g. if localStorage was cleared or
// this is a second device.
export async function resendVerification(): Promise<ResendVerificationResult> {
  const res = await fetch(buildPath('/api/auth/resend-verification'), {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true }
  return {
    ok: false,
    message: data.error || data.message || `Request failed (${res.status})`,
    retryAfterSeconds:
      typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
  }
}

export async function login(
  email: string,
  password: string,
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(buildPath('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return handle(res)
}

// bannerImage should be the relative path returned by uploadItemImage() --
// that upload endpoint isn't actually item-specific, just a generic
// compress-and-store-an-image endpoint, so it's reused here as-is.
export async function updateBanner(bannerImage: string): Promise<AuthUser> {
  const res = await fetch(buildPath('/api/auth/banner'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ bannerImage }),
  })
  const data = await handle(res)
  return data.user ?? data
}

// Updates the account-level dashboard settings (company name/type, manager
// name, brand accent color). Only pass the fields that changed -- the server
// only ever touches the keys present in the body.
export async function updateSettings(settings: Partial<AccountSettings>): Promise<AuthUser> {
  const res = await fetch(buildPath('/api/auth/settings'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(settings),
  })
  const data = await handle(res)
  return data.user ?? data
}

// Deletes the logged-in account along with all of its items, categories,
// and uploaded files (photos, banner) -- handled server-side.
export async function deleteAccount(): Promise<void> {
  const res = await fetch(buildPath('/api/auth/account'), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  await handle(res)
}

// ---------------- Items ----------------
// Matches your Item schema: name, sku, unit, amount, categoryID, pictureURL, lowStockThreshold

export type ApiItem = {
  _id: string
  accountID?: string
  categoryID: string
  name: string
  sku?: string
  unit?: string
  amount: number
  pictureURL?: string
  lowStockThreshold?: number
}

export type NewItemPayload = {
  name: string
  sku?: string
  unit?: string
  amount: number
  categoryID: string
  pictureURL?: string
  lowStockThreshold?: number
}

export async function fetchItems(search = ''): Promise<ApiItem[]> {
  const res = await fetch(buildPath('/api/items/searchitems'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ search }),
  })
  const data = await handle(res)
  return data.results ?? data.items ?? data
}

export async function addItem(item: NewItemPayload): Promise<ApiItem> {
  const res = await fetch(buildPath('/api/items/additem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(item),
  })
  const data = await handle(res)
  return data.item ?? data
}

export async function updateItem(id: string, item: Partial<NewItemPayload>): Promise<ApiItem> {
  const res = await fetch(buildPath(`/api/items/updateitem/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(item),
  })
  const data = await handle(res)
  return data.item ?? data
}

// Uploads a photo for compression/storage and returns the relative URL to
// save as an item's pictureURL. Resolve it for display with resolveImageUrl().
export async function uploadItemImage(file: Blob): Promise<string> {
  const formData = new FormData()
  formData.append('image', file)
  const res = await fetch(buildPath('/api/items/upload'), {
    method: 'POST',
    // No Content-Type header -- the browser sets the multipart boundary itself.
    headers: { ...authHeaders() },
    body: formData,
  })
  const data = await handle(res)
  return data.pictureURL
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(buildPath(`/api/items/deleteitem/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  await handle(res)
}

// ---------------- Categories ----------------

export type ApiCategory = { _id: string; accountID?: string; name: string }

export async function fetchCategories(search = ''): Promise<ApiCategory[]> {
  const res = await fetch(buildPath('/api/categories/searchcategories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ search }),
  })
  const data = await handle(res)
  return data.results ?? data.categories ?? data
}

export async function addCategory(name: string): Promise<ApiCategory> {
  const res = await fetch(buildPath('/api/categories/addcategory'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  })
  const data = await handle(res)
  return data.category ?? data
}

export async function updateCategory(id: string, name: string): Promise<ApiCategory> {
  const res = await fetch(buildPath(`/api/categories/updatecategory/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  })
  const data = await handle(res)
  return data.category ?? data
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(buildPath(`/api/categories/deletecategory/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  await handle(res)
}
