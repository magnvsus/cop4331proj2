// src/api.ts
//
// All calls to the real backend live here, matched against the actual
// authController / categoryController / itemController you shared.

const APP_DOMAIN = 'aecm.site' // TODO: replace with your actual domain if different

function buildPath(route: string): string {
  if (import.meta.env.DEV) {
    return 'http://localhost:5000' + route;
  }
  return 'https://' + APP_DOMAIN + route;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || data.message || `Request failed (${res.status})`;
    throw new Error(data.details ? `${message}: ${data.details}` : message);
  }
  return data;
}

// ---------------- Auth ----------------

export type AuthUser = { id: string; email: string; isVerified?: boolean; bannerImage?: string };

// register does NOT log the user in -- your authController only returns a
// confirmation message, so the caller needs to call login() afterward.
export async function register(email: string, password: string): Promise<{ message: string }> {
  const res = await fetch(buildPath('/api/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handle(res);
}

export async function login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(buildPath('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return handle(res);
}

// ---------------- Items ----------------
// Matches your Item schema: name, sku, unit, amount, categoryID, pictureURL, lowStockThreshold

export type ApiItem = {
  _id: string;
  accountID?: string;
  categoryID: string;
  name: string;
  sku?: string;
  unit?: string;
  amount: number;
  pictureURL?: string;
  lowStockThreshold?: number;
};

export type NewItemPayload = {
  name: string;
  sku?: string;
  unit?: string;
  amount: number;
  categoryID: string;
  pictureURL?: string;
  lowStockThreshold?: number;
};

export async function fetchItems(search = ''): Promise<ApiItem[]> {
  const res = await fetch(buildPath('/api/items/searchitems'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ search }),
  });
  const data = await handle(res);
  return data.results ?? data.items ?? data;
}

export async function addItem(item: NewItemPayload): Promise<ApiItem> {
  const res = await fetch(buildPath('/api/items/additem'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(item),
  });
  const data = await handle(res);
  return data.item ?? data;
}

export async function updateItem(id: string, item: Partial<NewItemPayload>): Promise<ApiItem> {
  const res = await fetch(buildPath(`/api/items/updateitem/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(item),
  });
  const data = await handle(res);
  return data.item ?? data;
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(buildPath(`/api/items/deleteitem/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  await handle(res);
}

// ---------------- Categories ----------------

export type ApiCategory = { _id: string; accountID?: string; name: string };

export async function fetchCategories(search = ''): Promise<ApiCategory[]> {
  const res = await fetch(buildPath('/api/categories/searchcategories'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ search }),
  });
  const data = await handle(res);
  return data.results ?? data.categories ?? data;
}

export async function addCategory(name: string): Promise<ApiCategory> {
  const res = await fetch(buildPath('/api/categories/addcategory'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  const data = await handle(res);
  return data.category ?? data;
}

export async function updateCategory(id: string, name: string): Promise<ApiCategory> {
  const res = await fetch(buildPath(`/api/categories/updatecategory/${id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name }),
  });
  const data = await handle(res);
  return data.category ?? data;
}

export async function deleteCategory(id: string): Promise<void> {
  const res = await fetch(buildPath(`/api/categories/deletecategory/${id}`), {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  await handle(res);
}
