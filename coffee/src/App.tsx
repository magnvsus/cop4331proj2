import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  addItem,
  login,
  register,
  removeItem,
  searchItems,
  updateItem,
  type Account,
  type InventoryRecord,
  type ItemWrite,
} from './api'
import './App.css'
import './ServerStates.css'

type Page = 'dashboard' | 'inventory' | 'low'
type Modal = 'add' | 'edit' | 'delete' | null

const blankItem = (): ItemWrite => ({
  name: '',
  sku: '',
  categoryId: '',
  categoryName: '',
  amount: 0,
  unit: 'units',
  threshold: 5,
  pictureURL: '',
})

function Icon({ name }: { name: 'grid' | 'box' | 'alert' | 'search' | 'plus' | 'edit' | 'trash' | 'logout' | 'coffee' }) {
  const paths: Record<string, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    box: <><path d="M21 8 12 3 3 8l9 5 9-5Z"/><path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z"/><path d="M12 13v8"/></>,
    alert: <><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    edit: <><path d="M12 20h9"/><path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></>,
    coffee: <><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 10h1a3 3 0 0 1 0 6h-1M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 2"/></>,
  }
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function Auth({ onAuthenticated }: { onAuthenticated: (account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (mode === 'register') {
        await register(email.trim(), password)
        setMode('login')
        setNotice('Account created. You can sign in now.')
      } else {
        onAuthenticated(await login(email.trim(), password))
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong.')
    } finally {
      setBusy(false)
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
        <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</span>
        <h2>{mode === 'login' ? 'Sign in to your account' : 'Create an account'}</h2>
        <p className="muted">{mode === 'login' ? 'Access the inventory connected to your account.' : 'Register with the inventory service.'}</p>
        <form onSubmit={submit}>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Password<div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} required /><button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button></div></label>
          {error && <p className="api-message error" role="alert">{error}</p>}
          {notice && <p className="api-message success" role="status">{notice}</p>}
          <button className="primary login-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
          <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice('') }}>{mode === 'login' ? 'Need an account? Register' : 'Already registered? Sign in'}</button>
        </form>
      </div>
    </section>
  </main>
}

function App() {
  const [account, setAccount] = useState<Account | null>(null)
  const [items, setItems] = useState<InventoryRecord[]>([])
  const [page, setPage] = useState<Page>('dashboard')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [modal, setModal] = useState<Modal>(null)
  const [draft, setDraft] = useState<ItemWrite>(blankItem())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadItems = async (activeAccount: Account, search = '') => {
    setLoading(true)
    setError('')
    try {
      setItems(await searchItems(activeAccount.id, search))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!account) return
    const timeout = window.setTimeout(() => void loadItems(account, query.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [account, query])

  const categories = useMemo(() => [...new Set(items.map(item => item.categoryName).filter(Boolean))], [items])
  const lowItems = items.filter(item => item.amount <= item.threshold)
  const visibleItems = items.filter(item =>
    (page !== 'low' || item.amount <= item.threshold) &&
    (category === 'All categories' || item.categoryName === category)
  )
  const displayName = account?.firstName || account?.email.split('@')[0] || 'there'
  const initials = displayName.slice(0, 2).toUpperCase()

  const openAdd = () => {
    setDraft({ ...blankItem(), categoryName: category === 'All categories' ? '' : category })
    setSelectedId(null)
    setError('')
    setModal('add')
  }

  const openEdit = (item: InventoryRecord) => {
    const { accountId: _accountId, id: _id, ...write } = item
    setDraft(write)
    setSelectedId(item.id)
    setError('')
    setModal('edit')
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!account) return
    setSaving(true)
    setError('')
    try {
      const payload = { ...draft, categoryName: draft.categoryName.trim() || draft.categoryId.trim() }
      if (modal === 'add') await addItem(account.id, payload)
      else if (selectedId) await updateItem(account.id, selectedId, payload)
      await loadItems(account, query.trim())
      setModal(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save the item.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!account || !selectedId) return
    setSaving(true)
    setError('')
    try {
      await removeItem(account.id, selectedId)
      await loadItems(account, query.trim())
      setModal(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove the item.')
    } finally {
      setSaving(false)
    }
  }

  if (!account) return <Auth onAuthenticated={setAccount} />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand sidebar-brand"><span className="brand-mark"><Icon name="coffee" /></span><span>Inventory Hub<small>LIVE INVENTORY</small></span></div>
      <nav>
        <button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}><Icon name="grid" /> Dashboard</button>
        <button className={page === 'inventory' ? 'active' : ''} onClick={() => setPage('inventory')}><Icon name="box" /> Inventory</button>
        <button className={page === 'low' ? 'active' : ''} onClick={() => setPage('low')}><Icon name="alert" /> Low stock <b>{lowItems.length}</b></button>
      </nav>
      <div className="sidebar-bottom profile-area"><span className="user-avatar">{initials}</span><span className="profile-copy"><strong>{displayName}</strong><small>{account.email}</small></span><button aria-label="Sign out" onClick={() => { setAccount(null); setItems([]) }}><Icon name="logout" /></button></div>
    </aside>
    <main className="dashboard">
      <header><div><span className="eyebrow">INVENTORY HUB</span><h1>{page === 'dashboard' ? `Good morning, ${displayName}.` : page === 'low' ? 'Low-stock alerts' : 'Inventory'}</h1><p>Your inventory below is loaded directly from the server.</p></div><button className="primary" onClick={openAdd}><Icon name="plus" /> Add item</button></header>
      {error && !modal && <div className="api-banner" role="alert">{error}<button onClick={() => void loadItems(account, query.trim())}>Try again</button></div>}
      {page === 'dashboard' && <><section className="stats"><article><span className="stat-icon brown"><Icon name="box" /></span><div><p>Total items</p><strong>{items.length}</strong><small>Across {categories.length} categories</small></div></article><article><span className="stat-icon amber"><Icon name="alert" /></span><div><p>Low stock</p><strong>{lowItems.length}</strong><small>Needs attention</small></div></article><article><span className="stat-icon green"><Icon name="grid" /></span><div><p>Units in stock</p><strong>{items.reduce((total, item) => total + item.amount, 0)}</strong><small>Current total</small></div></article></section></>}
      <section className="inventory-card">
        <div className="section-heading"><div><h2>{page === 'low' ? 'Low-stock items' : 'Inventory'}</h2><p>{loading ? 'Loading inventory…' : 'Search and manage the items saved to your account.'}</p></div><div className="tools"><label className="search"><Icon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search items..." /></label><select value={category} onChange={event => setCategory(event.target.value)}><option>All categories</option>{categories.map(name => <option key={name}>{name}</option>)}</select></div></div>
        <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>QUANTITY</th><th>REORDER AT</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{visibleItems.map(item => { const low = item.amount <= item.threshold; return <tr key={item.id}><td><div className="item-name">{item.pictureURL ? <img className="product-photo" src={item.pictureURL} alt="" /> : <span className="product-icon">{item.name.charAt(0)}</span>}<div><strong>{item.name}</strong><small>{item.sku}</small></div></div></td><td><span className="category-pill">{item.categoryName}</span></td><td><strong>{item.amount}</strong> <span className="unit">{item.unit}</span></td><td>{item.threshold} {item.unit}</td><td><span className={`status ${low ? 'low' : 'good'}`}><i />{low ? 'Low stock' : 'In stock'}</span></td><td><div className="row-actions"><button aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}><Icon name="edit" /></button><button className="delete-action" aria-label={`Delete ${item.name}`} onClick={() => { setSelectedId(item.id); setError(''); setModal('delete') }}><Icon name="trash" /></button></div></td></tr>})}</tbody></table>{!loading && visibleItems.length === 0 && <div className="empty"><Icon name="box" /><h3>No items found</h3><p>{query ? 'Try another search.' : 'Add your first inventory item.'}</p></div>}</div>
        <div className="table-footer">Showing {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}</div>
      </section>
    </main>
    {(modal === 'add' || modal === 'edit') && <div className="modal-backdrop" onMouseDown={() => !saving && setModal(null)}><form className="modal" onSubmit={save} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">INVENTORY ITEM</span><h2>{modal === 'add' ? 'Add a new item' : 'Edit item'}</h2></div><button type="button" disabled={saving} onClick={() => setModal(null)}>×</button></div><div className="form-grid"><label className="wide">Item name<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required /></label><label>Category ID<input value={draft.categoryId} onChange={event => setDraft({ ...draft, categoryId: event.target.value })} placeholder="Backend category _id" required /></label><label>Category label<input value={draft.categoryName} onChange={event => setDraft({ ...draft, categoryName: event.target.value })} placeholder="Shown in the table" /></label><label>Quantity<input type="number" min="0" value={draft.amount} onChange={event => setDraft({ ...draft, amount: Number(event.target.value) })} required /></label><label>Reorder threshold<input type="number" min="0" value={draft.threshold} onChange={event => setDraft({ ...draft, threshold: Number(event.target.value) })} required /></label><label>SKU<input value={draft.sku} onChange={event => setDraft({ ...draft, sku: event.target.value })} /></label><label>Unit<input value={draft.unit} onChange={event => setDraft({ ...draft, unit: event.target.value })} required /></label><label className="wide">Picture URL<input type="url" value={draft.pictureURL} onChange={event => setDraft({ ...draft, pictureURL: event.target.value })} placeholder="https://..." /></label></div>{error && <p className="api-message error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : modal === 'add' ? 'Add item' : 'Save changes'}</button></div></form></div>}
    {modal === 'delete' && <div className="modal-backdrop"><div className="modal delete-modal"><span className="delete-icon"><Icon name="trash" /></span><h2>Delete this item?</h2><p>This will permanently remove <strong>{items.find(item => item.id === selectedId)?.name}</strong> from the server.</p>{error && <p className="api-message error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button className="danger" disabled={saving} onClick={() => void confirmDelete()}>{saving ? 'Deleting…' : 'Delete item'}</button></div></div></div>}
  </div>
}

export default App
