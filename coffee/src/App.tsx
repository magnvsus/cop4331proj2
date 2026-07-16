import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import * as api from './api'

type Item = { id: string; name: string; sku: string; category: string; quantity: number; unit: string; min: number; image?: string }

const categories = ['Dairy', 'Coffee & Tea', 'Syrups', 'Bakery', 'Food', 'Packaging', 'Cleaning', 'Retail']
const demoItems: Item[] = [
  { id: '1', name: 'Whole Milk', sku: 'DRY-001', category: 'Dairy', quantity: 4, unit: 'gallons', min: 8 },
  { id: '2', name: 'Oat Milk', sku: 'DRY-006', category: 'Dairy', quantity: 12, unit: 'cartons', min: 6 },
  { id: '3', name: 'Espresso Beans', sku: 'COF-001', category: 'Coffee & Tea', quantity: 18, unit: 'bags', min: 10 },
  { id: '4', name: 'Vanilla Syrup', sku: 'SYR-002', category: 'Syrups', quantity: 3, unit: 'bottles', min: 5 },
  { id: '5', name: 'Butter Croissants', sku: 'BAK-004', category: 'Bakery', quantity: 8, unit: 'pieces', min: 12 },
  { id: '6', name: 'Turkey Sandwiches', sku: 'FOD-003', category: 'Food', quantity: 14, unit: 'pieces', min: 8 },
  { id: '7', name: '12 oz Hot Cups', sku: 'PKG-012', category: 'Packaging', quantity: 240, unit: 'cups', min: 100 },
  { id: '8', name: '12 oz Lids', sku: 'PKG-013', category: 'Packaging', quantity: 76, unit: 'lids', min: 100 },
  { id: '9', name: 'Surface Cleaner', sku: 'CLN-005', category: 'Cleaning', quantity: 6, unit: 'bottles', min: 3 },
  { id: '10', name: 'Coffee Hour Mug', sku: 'RTL-002', category: 'Retail', quantity: 22, unit: 'mugs', min: 8 },
]

const blankItem = (): Omit<Item, 'id'> => ({ name: '', sku: '', category: 'Dairy', quantity: 0, unit: 'units', min: 5, image: '' })

// The backend Item schema only has name/amount/categoryID/pictureURL/lowStockThreshold --
// there is no sku or unit field. This maps a server item (plus a categoryID -> name
// lookup, since the server only knows the category by its id) into what the UI expects.
// sku/unit are intentionally left blank here; see saveItem() for how they're kept
// visible for the current session even though the backend doesn't persist them.
function normalizeItem(apiItem: api.ApiItem, categoryNameById: Record<string, string>): Item {
  return {
    id: apiItem._id,
    name: apiItem.name,
    sku: '',
    category: categoryNameById[apiItem.categoryID] ?? 'Uncategorized',
    quantity: apiItem.amount ?? 0,
    unit: 'units',
    min: apiItem.lowStockThreshold ?? 0,
    image: apiItem.pictureURL || undefined,
  }
}

function Icon({ name }: { name: 'grid' | 'box' | 'alert' | 'search' | 'plus' | 'edit' | 'trash' | 'logout' | 'coffee' }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"/><path d="M12 13v8"/></>,
    alert: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>, edit: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    coffee: <><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 10h1a3 3 0 0 1 0 6h-1M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 2"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onLogin(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="login-page">
    <section className="login-art">
      <div className="brand brand-light"><span className="brand-mark"><Icon name="coffee" /></span><span>Inventory Hub</span></div>
      <div className="art-copy"><div className="steam">⌇</div><div className="big-cup"><Icon name="coffee" /></div><h1>Everything in its place.</h1><p>Simple inventory management for busy small businesses.</p></div>
      <div className="beans">●　·　●</div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="mobile-brand brand"><span className="brand-mark"><Icon name="coffee" /></span><span>Inventory Hub</span></div>
        <span className="eyebrow">WELCOME BACK</span><h2>Sign in to your account</h2><p className="muted">Keep your shelves stocked and your day running smoothly.</p>
        <form onSubmit={handleSubmit}>
          <label>Email address<input type="email" placeholder="you@coffeehour.com" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          <div className="form-row"><label className="check"><input type="checkbox" /> Remember me</label><button type="button" className="link-button">Forgot password?</button></div>
          {error && <p className="field-help" style={{ color: '#a33b31', marginBottom: 14 }}>{error}</p>}
          <button className="primary login-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : <>Sign in <span>→</span></>}</button>
        </form>
        <p className="demo-note"><span>●</span> Sign in with your Inventory Hub account</p>
      </div>
      <p className="copyright">© 2026 Inventory Hub · Coffee Hour Demo</p>
    </section>
  </main>
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [items, setItems] = useState<Item[]>(demoItems)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [view, setView] = useState<'all' | 'low'>('all')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [draft, setDraft] = useState<Omit<Item, 'id'>>(blankItem())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const lowItems = items.filter(i => i.quantity <= i.min)
  const filtered = useMemo(() => items.filter(i => (view === 'all' || i.quantity <= i.min) && (category === 'All categories' || i.category === category) && `${i.name} ${i.sku}`.toLowerCase().includes(query.toLowerCase())), [items, view, category, query])
  const openEdit = (item: Item) => { setSelectedId(item.id); setDraft(item); setModal('edit') }
  const saveItem = (e: FormEvent) => { e.preventDefault(); if (modal === 'add') setItems([...items, { ...draft, id: String(Date.now()) }]); else setItems(items.map(i => i.id === selectedId ? { ...draft, id: i.id } : i)); setModal(null) }
  if (!loggedIn) return <Login onLogin={async () => { setLoggedIn(true) }} />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="coffee" /></span><span>Inventory Hub<small>COFFEE HOUR</small></span></div>
      <nav><button className="active"><Icon name="grid" /> Dashboard</button><button onClick={() => setView('all')}><Icon name="box" /> Inventory</button><button onClick={() => setView('low')}><Icon name="alert" /> Low stock <b>{lowItems.length}</b></button></nav>
      <div className="sidebar-bottom"><div className="user-avatar">AM</div><div><strong>Alex Morgan</strong><small>Store manager</small></div><button aria-label="Sign out" onClick={() => setLoggedIn(false)}><Icon name="logout" /></button></div>
    </aside>
    <main className="dashboard">
      <header><div><span className="eyebrow">SATURDAY, JULY 11</span><h1>Good morning, Alex.</h1><p>Here’s what’s happening with your inventory today.</p></div><button className="primary" onClick={() => { setDraft(blankItem()); setModal('add') }}><Icon name="plus" /> Add item</button></header>
      {lowItems.length > 0 && <div className="alert-banner"><span><Icon name="alert" /></span><div><strong>{lowItems.length} items need your attention</strong><p>Stock is at or below the reorder level.</p></div><button onClick={() => setView('low')}>View low stock →</button></div>}
      <section className="stats">
        <article><span className="stat-icon brown"><Icon name="box" /></span><div><p>Total items</p><strong>{items.length}</strong><small>Across {new Set(items.map(i => i.category)).size} categories</small></div></article>
        <article><span className="stat-icon amber"><Icon name="alert" /></span><div><p>Low stock</p><strong>{lowItems.length}</strong><small>Needs attention</small></div></article>
        <article><span className="stat-icon green"><Icon name="grid" /></span><div><p>Units in stock</p><strong>{items.reduce((a, i) => a + i.quantity, 0)}</strong><small>Current total</small></div></article>
      </section>
      <section className="inventory-card">
        <div className="section-heading"><div><h2>{view === 'low' ? 'Low-stock items' : 'Inventory'}</h2><p>{view === 'low' ? 'Items that have reached their reorder level.' : 'Manage stock levels across your store.'}</p></div><div className="tools"><label className="search"><Icon name="search" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search items or SKU..." /></label><select value={category} onChange={e => setCategory(e.target.value)}><option>All categories</option>{categories.map(c => <option key={c}>{c}</option>)}</select></div></div>
        <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>QUANTITY</th><th>REORDER AT</th><th>STATUS</th><th></th></tr></thead><tbody>{filtered.map(item => { const low = item.quantity <= item.min; return <tr key={item.id}><td><div className="item-name"><span className={`product-icon ${item.category.toLowerCase().replaceAll(' ', '-')}`}>{item.name.charAt(0)}</span><div><strong>{item.name}</strong><small>{item.sku}</small></div></div></td><td><span className="category-pill">{item.category}</span></td><td><strong>{item.quantity}</strong> <span className="unit">{item.unit}</span></td><td>{item.min} {item.unit}</td><td><span className={`status ${low ? 'low' : 'good'}`}><i />{low ? 'Low stock' : 'In stock'}</span></td><td><div className="row-actions"><button aria-label="Edit" onClick={() => openEdit(item)}><Icon name="edit" /></button><button aria-label="Delete" onClick={() => { setSelectedId(item.id); setModal('delete') }}><Icon name="trash" /></button></div></td></tr>})}</tbody></table>{filtered.length === 0 && <div className="empty"><Icon name="search" /><h3>No items found</h3><p>Try another search or category.</p></div>}</div>
        <div className="table-footer">Showing {filtered.length} of {items.length} items</div>
      </section>
    </main>
    {(modal === 'add' || modal === 'edit') && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal" onSubmit={saveItem} onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">INVENTORY ITEM</span><h2>{modal === 'add' ? 'Add a new item' : 'Edit item'}</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="form-grid"><label className="wide">Item name<input value={draft.name} onChange={e => setDraft({...draft, name:e.target.value})} placeholder="e.g. Almond Milk" required /></label><label>SKU<input value={draft.sku} onChange={e => setDraft({...draft, sku:e.target.value})} placeholder="DRY-007" required /></label><label>Category<select value={draft.category} onChange={e => setDraft({...draft, category:e.target.value})}>{categories.map(c => <option key={c}>{c}</option>)}</select></label><label>Quantity<input type="number" min="0" value={draft.quantity} onChange={e => setDraft({...draft, quantity:+e.target.value})} required /></label><label>Unit<input value={draft.unit} onChange={e => setDraft({...draft, unit:e.target.value})} required /></label><label className="wide">Low-stock alert level<input type="number" min="0" value={draft.min} onChange={e => setDraft({...draft, min:+e.target.value})} required /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit">{modal === 'add' ? 'Add item' : 'Save changes'}</button></div></form></div>}
    {modal === 'delete' && <div className="modal-backdrop"><div className="modal delete-modal"><span className="delete-icon"><Icon name="trash" /></span><h2>Delete this item?</h2><p>This will remove <strong>{items.find(i => i.id === selectedId)?.name}</strong> from your inventory. This action cannot be undone.</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="danger" onClick={() => { setItems(items.filter(i => i.id !== selectedId)); setModal(null) }}>Delete item</button></div></div></div>}
  </div>
}

export { App as LegacyApp }

type Page = 'dashboard' | 'inventory' | 'low' | 'settings'
type Company = { name: string; type: string; accent: string; manager: string }

function CustomApp() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [items, setItems] = useState<Item[]>([])
  const [company, setCompany] = useState<Company>({ name: 'Coffee Hour', type: 'Coffee shop', accent: '#a9642e', manager: 'Alex Morgan' })
  const [businessCategories, setBusinessCategories] = useState<string[]>(categories)
  const [categoryIdByName, setCategoryIdByName] = useState<Record<string, string>>({})
  const [categoryInput, setCategoryInput] = useState(categories.join(', '))
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [draft, setDraft] = useState<Omit<Item, 'id'>>(blankItem())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)

  const categoryNameById = useMemo(() => {
    const map: Record<string, string> = {}
    Object.entries(categoryIdByName).forEach(([name, id]) => { map[id] = name })
    return map
  }, [categoryIdByName])

  // Load categories first, then items -- items only store a categoryID, so we
  // need the id->name map in hand before normalizeItem can show a category name.
  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const fetchedCategories = await api.fetchCategories()
        if (cancelled) return
        const idByName: Record<string, string> = {}
        const nameById: Record<string, string> = {}
        fetchedCategories.forEach(c => { idByName[c.name] = c._id; nameById[c._id] = c.name })
        setCategoryIdByName(idByName)
        if (fetchedCategories.length) {
          const names = fetchedCategories.map(c => c.name)
          setBusinessCategories(names)
          setCategoryInput(names.join(', '))
        }
        // otherwise: fresh account, no categories yet -- keep the starter demo
        // list in the dropdown; ensureCategoryId() below creates real
        // categories on the backend the first time each one is actually used.

        const fetchedItems = await api.fetchItems()
        if (cancelled) return
        setItems(fetchedItems.map(it => normalizeItem(it, nameById)))
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load inventory data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loggedIn])

  const lowItems = items.filter(item => item.quantity <= item.min)
  const visibleItems = useMemo(() => items.filter(item => (page !== 'low' || item.quantity <= item.min) && (category === 'All categories' || item.category === category) && `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase())), [items, page, category, query])
  const initials = company.manager.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase()

  const handleLogin = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password)
    localStorage.setItem('token', token)
    // Your User model doesn't store a display name, so this derives one from
    // the email address (e.g. "alex.morgan@coffeehour.com" -> "Alex Morgan").
    const displayName = user.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    setCompany(current => ({ ...current, manager: displayName || current.manager }))
    setLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setLoggedIn(false)
    setItems([])
    setPage('dashboard')
  }

  const openAdd = () => { setDraft(blankItem()); setSelectedId(null); setModal('add') }
  const openEdit = (item: Item) => { setDraft({ ...item }); setSelectedId(item.id); setModal('edit') }

  // Creates the category on the backend the first time it's used, so the
  // user never has to visit Settings before adding their first item.
  const ensureCategoryId = async (name: string): Promise<string> => {
    if (categoryIdByName[name]) return categoryIdByName[name]
    const created = await api.addCategory(name)
    setCategoryIdByName(current => ({ ...current, [name]: created._id }))
    setBusinessCategories(current => current.includes(name) ? current : [...current, name])
    return created._id
  }

  const saveItem = async (event: FormEvent) => {
    event.preventDefault()
    setLoadError('')
    try {
      const categoryID = await ensureCategoryId(draft.category)
      const payload: api.NewItemPayload = {
        name: draft.name,
        amount: draft.quantity,
        lowStockThreshold: draft.min,
        categoryID,
        // Works for now since pictureURL is just a String field on the schema,
        // but a real upload endpoint (Multer + Cloudinary/S3, from the earlier
        // project plan) is the better long-term home for this.
        pictureURL: draft.image || undefined,
      }

      if (modal === 'add') {
        const created = await api.addItem(payload)
        // sku/unit aren't in the backend schema, so they're carried over
        // from the form directly rather than from the server response --
        // they'll reset on a page reload until the schema supports them.
        setItems(current => [...current, { id: created._id, name: created.name, sku: draft.sku, category: draft.category, quantity: created.amount, unit: draft.unit, min: created.lowStockThreshold ?? draft.min, image: created.pictureURL || undefined }])
      } else if (selectedId) {
        const updated = await api.updateItem(selectedId, payload)
        setItems(current => current.map(item => item.id === selectedId ? { id: item.id, name: updated.name, sku: draft.sku, category: draft.category, quantity: updated.amount, unit: draft.unit, min: updated.lowStockThreshold ?? draft.min, image: updated.pictureURL || undefined } : item))
      }
      setModal(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not save item')
    }
  }

  const confirmDelete = async () => {
    if (!selectedId) return
    setLoadError('')
    try {
      await api.deleteItem(selectedId)
      setItems(current => current.filter(item => item.id !== selectedId))
      setModal(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not delete item')
    }
  }

  const saveCategorySettings = async (event: FormEvent) => {
    event.preventDefault()
    setLoadError('')
    const values = categoryInput.split(',').map(value => value.trim()).filter(Boolean)
    const toAdd = values.filter(v => !businessCategories.includes(v))
    const toRemove = businessCategories.filter(v => !values.includes(v))
    try {
      const newIds: Record<string, string> = {}
      for (const name of toAdd) {
        const created = await api.addCategory(name)
        newIds[name] = created._id
      }
      for (const name of toRemove) {
        const id = categoryIdByName[name]
        if (id) await api.deleteCategory(id)
      }
      setCategoryIdByName(current => ({ ...current, ...newIds }))
      setBusinessCategories(values)
      if (values.length && !values.includes(draft.category)) setDraft(current => ({ ...current, category: values[0] }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not update categories')
    }
  }

  const choosePhoto = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setDraft(current => ({ ...current, image: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  if (!loggedIn) return <Login onLogin={handleLogin} />

  const inventoryPanel = <section className="inventory-card">
    <div className="section-heading"><div><h2>{page === 'low' ? 'Low-stock items' : page === 'dashboard' ? 'Inventory overview' : 'All inventory'}</h2><p>{page === 'low' ? 'Items at or below their reorder level.' : 'Search, update, and organize all company stock.'}</p></div><div className="tools"><label className="search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items or SKU..." /></label><select value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{businessCategories.map(option => <option key={option}>{option}</option>)}</select></div></div>
    <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>QUANTITY</th><th>REORDER AT</th><th>STATUS</th><th /></tr></thead><tbody>{visibleItems.map(item => { const low = item.quantity <= item.min; return <tr key={item.id}><td><div className="item-name">{item.image ? <img className="product-photo" src={item.image} alt="" /> : <span className={`product-icon ${item.category.toLowerCase().replaceAll(' ', '-')}`}>{item.name.charAt(0)}</span>}<div><strong>{item.name}</strong><small>{item.sku}</small></div></div></td><td><span className="category-pill">{item.category}</span></td><td><strong>{item.quantity}</strong> <span className="unit">{item.unit}</span></td><td>{item.min} {item.unit}</td><td><span className={`status ${low ? 'low' : 'good'}`}><i />{low ? 'Low stock' : 'In stock'}</span></td><td><div className="row-actions"><button aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Icon name="edit" /></button><button aria-label={`Delete ${item.name}`} onClick={() => { setSelectedId(item.id); setModal('delete') }}><Icon name="trash" /></button></div></td></tr>})}</tbody></table>{visibleItems.length === 0 && <div className="empty"><Icon name="search" /><h3>No items found</h3><p>{loading ? 'Loading inventory…' : 'Try another search or category.'}</p></div>}</div>
    <div className="table-footer">Showing {visibleItems.length} of {items.length} items</div>
  </section>

  return <div className="app-shell" style={{ '--company-accent': company.accent } as React.CSSProperties}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="box" /></span><span>Inventory Hub<small>{company.name.toUpperCase()}</small></span></div>
      <nav>
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}><Icon name="grid" /> Dashboard</button>
        <button className={page === 'inventory' ? 'active' : ''} onClick={() => setPage('inventory')}><Icon name="box" /> Inventory</button>
        <button className={page === 'low' ? 'active' : ''} onClick={() => setPage('low')}><Icon name="alert" /> Low stock <b>{lowItems.length}</b></button>
        <button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}><Icon name="edit" /> Customize</button>
      </nav>
      <div className="sidebar-bottom"><div className="user-avatar">{initials}</div><div><strong>{company.manager}</strong><small>{company.type}</small></div><button aria-label="Sign out" onClick={handleLogout}><Icon name="logout" /></button></div>
    </aside>
    <main className="dashboard">
      <header><div><span className="eyebrow">{company.name.toUpperCase()} · INVENTORY HUB</span><h1>{page === 'dashboard' ? `Good morning, ${company.manager.split(' ')[0]}.` : page === 'inventory' ? 'Inventory' : page === 'low' ? 'Low-stock alerts' : 'Customize your workspace'}</h1><p>{page === 'settings' ? 'Adapt Inventory Hub to match any business or brand.' : `Manage inventory for your ${company.type.toLowerCase()}.`}</p></div>{page !== 'settings' && <button className="primary" onClick={openAdd}><Icon name="plus" /> Add item</button>}</header>
      {loadError && <div className="alert-banner"><span><Icon name="alert" /></span><div><strong>Something went wrong</strong><p>{loadError}</p></div><button onClick={() => setLoadError('')}>Dismiss</button></div>}
      {page === 'dashboard' && <><div className="alert-banner"><span><Icon name="alert" /></span><div><strong>{lowItems.length} items need your attention</strong><p>Stock is at or below the reorder level.</p></div><button onClick={() => setPage('low')}>View low stock →</button></div><section className="stats"><article><span className="stat-icon brown"><Icon name="box" /></span><div><p>Total items</p><strong>{items.length}</strong><small>Across {new Set(items.map(item => item.category)).size} categories</small></div></article><article><span className="stat-icon amber"><Icon name="alert" /></span><div><p>Low stock</p><strong>{lowItems.length}</strong><small>Needs attention</small></div></article><article><span className="stat-icon green"><Icon name="grid" /></span><div><p>Units in stock</p><strong>{items.reduce((total, item) => total + item.quantity, 0)}</strong><small>Current total</small></div></article></section></>}
      {page !== 'settings' ? inventoryPanel : <section className="settings-grid">
        <form className="settings-card" onSubmit={saveCategorySettings}><div className="settings-title"><span className="settings-symbol"><Icon name="edit" /></span><div><h2>Company details</h2><p>These details appear throughout the dashboard.</p></div></div><label>Company name<input value={company.name} onChange={event => setCompany({ ...company, name: event.target.value })} required /></label><label>Business type<input value={company.type} onChange={event => setCompany({ ...company, type: event.target.value })} placeholder="Retail store, salon, clinic..." required /></label><label>Manager name<input value={company.manager} onChange={event => setCompany({ ...company, manager: event.target.value })} required /></label><label>Inventory categories<input value={categoryInput} onChange={event => setCategoryInput(event.target.value)} placeholder="Supplies, Products, Equipment" required /><small className="field-help">Separate categories with commas.</small></label><div className="settings-actions"><span className={saved ? 'save-message show' : 'save-message'}>✓ Changes saved</span><button className="primary" type="submit">Save customization</button></div></form>
        <div className="settings-card"><div className="settings-title"><span className="settings-symbol"><Icon name="grid" /></span><div><h2>Brand color</h2><p>Choose an accent color for buttons and highlights.</p></div></div><div className="color-row"><input aria-label="Brand color" type="color" value={company.accent} onChange={event => setCompany({ ...company, accent: event.target.value })} /><div><strong>{company.accent.toUpperCase()}</strong><small>Custom brand accent</small></div></div><div className="preview-brand"><span className="brand-mark"><Icon name="box" /></span><div><strong>Inventory Hub</strong><small>{company.name}</small></div></div><button className="secondary full-button" onClick={() => { setCompany({ name: 'Coffee Hour', type: 'Coffee shop', accent: '#a9642e', manager: 'Alex Morgan' }); setCategoryInput(businessCategories.join(', ')) }}>Restore demo branding</button></div>
      </section>}
    </main>
    {(modal === 'add' || modal === 'edit') && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal" onSubmit={saveItem} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">INVENTORY ITEM</span><h2>{modal === 'add' ? 'Add a new item' : 'Edit item'}</h2></div><button type="button" onClick={() => setModal(null)}>×</button></div><div className="photo-field"><div className="photo-preview">{draft.image ? <img src={draft.image} alt="Item preview" /> : <><Icon name="box" /><span>No photo</span></>}</div><div><strong>Item photo</strong><p>Upload an image or take a photo on your phone.</p><label className="photo-button">Choose or take photo<input type="file" accept="image/*" capture="environment" onChange={event => choosePhoto(event.target.files?.[0])} /></label>{draft.image && <button type="button" className="remove-photo" onClick={() => setDraft({ ...draft, image: '' })}>Remove photo</button>}</div></div><div className="form-grid"><label className="wide">Item name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label><label>SKU<input value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} required /></label><label>Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value })}>{businessCategories.map(option => <option key={option}>{option}</option>)}</select></label><label>Quantity<input type="number" min="0" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: +event.target.value })} required /></label><label>Unit<input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} required /></label><label className="wide">Low-stock alert level<input type="number" min="0" value={draft.min} onChange={event => setDraft({ ...draft, min: +event.target.value })} required /></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit">{modal === 'add' ? 'Add item' : 'Save changes'}</button></div></form></div>}
    {modal === 'delete' && <div className="modal-backdrop"><div className="modal delete-modal"><span className="delete-icon"><Icon name="trash" /></span><h2>Delete this item?</h2><p>This will remove <strong>{items.find(item => item.id === selectedId)?.name}</strong> from your inventory.</p><div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>Cancel</button><button className="danger" onClick={confirmDelete}>Delete item</button></div></div></div>}
  </div>
}

export default CustomApp
