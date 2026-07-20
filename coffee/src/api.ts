export type Account = {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

export type InventoryRecord = {
  id: string
  accountId: string
  categoryId: string
  categoryName: string
  name: string
  amount: number
  pictureURL: string
  threshold: number
  sku: string
  unit: string
}

type JsonObject = Record<string, unknown>

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function apiError(body: JsonObject, fallback: string): string {
  return text(body.error ?? body.Error ?? body.message) || fallback
}

async function post(path: string, payload: JsonObject, fallback: string): Promise<JsonObject> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Unable to reach the server. Check that the backend is running and try again.')
  }

  const body = await response.json().catch(() => ({})) as JsonObject
  const error = apiError(body, response.ok ? '' : fallback)
  if (!response.ok || error) throw new Error(error || fallback)
  return body
}

function normalizeItem(value: unknown, accountId: string): InventoryRecord | null {
  if (!value || typeof value !== 'object') return null
  const item = value as JsonObject
  const category = item.category && typeof item.category === 'object'
    ? item.category as JsonObject
    : null

  const id = text(item._id ?? item.id)
  if (!id) return null
  const categoryId = text(item.categoryID ?? item.categoryId ?? category?._id)
  return {
    id,
    accountId: text(item.accountID ?? item.accountId) || accountId,
    categoryId,
    categoryName: text(item.categoryName ?? category?.name) || categoryId || 'Uncategorized',
    name: text(item.name),
    amount: Number(item.amount ?? item.quantity ?? 0),
    pictureURL: text(item.pictureURL ?? item.image),
    threshold: Number(item.lowStockThreshold ?? item.threshold ?? item.min ?? 0),
    sku: text(item.sku) || id.slice(-8).toUpperCase(),
    unit: text(item.unit) || 'units',
  }
}

export async function login(email: string, password: string): Promise<Account> {
  // `login` is also sent for compatibility with the supplied local server.
  const body = await post('/api/login', { email, login: email, password }, 'Unable to sign in.')
  const id = text(body._id ?? body.id ?? (body.user as JsonObject | undefined)?._id)
  if (!id || id === '-1') throw new Error('Invalid email or password.')
  return {
    id,
    email,
    firstName: text(body.firstName),
    lastName: text(body.lastName),
  }
}

export async function register(email: string, password: string): Promise<void> {
  await post('/api/register', { email, password }, 'Unable to create the account.')
}

export async function searchItems(accountId: string, search = ''): Promise<InventoryRecord[]> {
  const body = await post('/api/itemSearch', { accountID: accountId, search }, 'Unable to load inventory.')
  const raw = body.results ?? body.items ?? body.search ?? body
  const list = Array.isArray(raw) ? raw : []
  return list.map(item => normalizeItem(item, accountId)).filter((item): item is InventoryRecord => item !== null)
}

export type ItemWrite = Omit<InventoryRecord, 'id' | 'accountId'>

function itemPayload(accountId: string, item: ItemWrite): JsonObject {
  return {
    accountID: accountId,
    categoryID: item.categoryId,
    name: item.name,
    amount: item.amount,
    pictureURL: item.pictureURL,
    threshold: item.threshold,
    lowStockThreshold: item.threshold,
    sku: item.sku,
    unit: item.unit,
  }
}

export async function addItem(accountId: string, item: ItemWrite): Promise<string | null> {
  const body = await post('/api/itemAdd', itemPayload(accountId, item), 'Unable to add the item.')
  return text(body._id ?? body.id ?? (body.item as JsonObject | undefined)?._id) || null
}

export async function updateItem(accountId: string, id: string, item: ItemWrite): Promise<void> {
  await post('/api/itemUpdate', { _id: id, ...itemPayload(accountId, item) }, 'Unable to update the item.')
}

export async function removeItem(accountId: string, id: string): Promise<void> {
  await post('/api/itemRemove', { _id: id, accountID: accountId }, 'Unable to remove the item.')
}
