import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Capacitor } from '@capacitor/core'
import { Camera } from '@capacitor/camera'
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import './App.css'
import * as api from './api'

// Native camera/gallery capture only makes sense inside the wrapped Android
// app -- on the plain website there's no native bridge to call, so that case
// keeps using the regular HTML file input instead.
const isNativePlatform = Capacitor.isNativePlatform()

// Camera/gallery results come back as base64 thumbnails, not File objects --
// this converts one into a File so it can flow through the same
// pendingPhoto/deferred-upload path as a file picked via the web input.
function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const byteString = atob(base64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  return new File([bytes], filename, { type: mimeType })
}

type Item = {
  id: string
  name: string
  sku: string
  category: string
  quantity: number
  unit: string
  min: number
  image?: string
}

// quantity/min allow '' while the form is being edited, so the number
// inputs can be blanked out to type a fresh value instead of getting stuck
// showing "0". Coerced back to a real number on submit; `required` stops
// the form from actually being submitted while either is blank.
type Draft = Omit<Item, 'id' | 'quantity' | 'min'> & { quantity: number | ''; min: number | '' }

const categories = [
  'Dairy',
  'Coffee & Tea',
  'Syrups',
  'Bakery',
  'Food',
  'Packaging',
  'Cleaning',
  'Retail',
]

const blankItem = (): Omit<Item, 'id'> => ({
  name: '',
  sku: '',
  category: 'Dairy',
  quantity: 0,
  unit: 'units',
  min: 5,
  image: '',
})

// Unions the starter categories with an account's real ones (deduped) rather
// than replacing them, so an account with only a couple of its own categories
// saved doesn't lose access to the rest of the starter list in the dropdown.
export function mergeCategoryNames(starterNames: string[], fetchedNames: string[]): string[] {
  return Array.from(new Set([...starterNames, ...fetchedNames]))
}

// Maps a server item (plus a categoryID -> name lookup, since the server only
// knows the category by its id) into what the UI expects.
//
// `image` is kept as the raw pictureURL the server returns (relative for our
// own uploads, e.g. "/uploads/xxx.jpg") rather than resolved to an absolute
// URL here -- it gets sent straight back as pictureURL on save, and resolving
// it eagerly would mean saving an absolute URL, which breaks the backend's
// "is this one of our own /uploads/ files" check when it's time to delete it.
// Resolve with api.resolveImageUrl() only at the point of rendering <img>.
export function normalizeItem(
  apiItem: api.ApiItem,
  categoryNameById: Record<string, string>,
): Item {
  return {
    id: apiItem._id,
    name: apiItem.name,
    sku: apiItem.sku ?? '',
    category: categoryNameById[apiItem.categoryID] ?? 'Uncategorized',
    quantity: apiItem.amount ?? 0,
    unit: apiItem.unit ?? 'units',
    min: apiItem.lowStockThreshold ?? 0,
    image: apiItem.pictureURL || undefined,
  }
}

function Icon({
  name,
}: {
  name:
    | 'grid'
    | 'box'
    | 'alert'
    | 'search'
    | 'plus'
    | 'edit'
    | 'trash'
    | 'logout'
    | 'coffee'
    | 'camera'
    | 'gallery'
    | 'scan'
}) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    box: (
      <>
        <path d="M21 8 12 3 3 8l9 5 9-5Z" />
        <path d="m3 8 9 5 9-5v8l-9 5-9-5V8Z" />
        <path d="M12 13v8" />
      </>
    ),
    alert: (
      <>
        <path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
      </>
    ),
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
      </>
    ),
    coffee: (
      <>
        <path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" />
        <path d="M17 10h1a3 3 0 0 1 0 6h-1M7 4c0 1 1 1 1 2M11 3c0 1 1 1 1 2" />
      </>
    ),
    camera: (
      <>
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    gallery: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    scan: (
      <>
        <path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3" />
        <path d="M7 12h10" />
      </>
    ),
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

function Login({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [showRegister, setShowRegister] = useState(false)
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regError, setRegError] = useState('')
  const [regSubmitting, setRegSubmitting] = useState(false)

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

  const closeRegister = () => {
    setShowRegister(false)
    setRegEmail('')
    setRegPassword('')
    setRegConfirmPassword('')
    setRegError('')
  }

  // Registers the account, then immediately signs in with the same
  // credentials -- api.register() only confirms the account was created, it
  // doesn't log the user in on its own.
  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    setRegError('')
    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match')
      return
    }
    setRegSubmitting(true)
    try {
      await api.register(regEmail, regPassword)
      await onLogin(regEmail, regPassword)
      closeRegister()
    } catch (err) {
      setRegError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setRegSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand brand-light">
          <span className="brand-mark">
            <Icon name="coffee" />
          </span>
          <span>Inventory Hub</span>
        </div>
        <div className="art-copy">
          <div className="steam">⌇</div>
          <div className="big-cup">
            <Icon name="coffee" />
          </div>
          <h1>Everything in its place.</h1>
          <p>Simple inventory management for busy small businesses.</p>
        </div>
        <div className="beans">●　·　●</div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand brand">
            <span className="brand-mark">
              <Icon name="coffee" />
            </span>
            <span>Inventory Hub</span>
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your account</h2>
          <p className="muted">Keep your shelves stocked and your day running smoothly.</p>
          <form onSubmit={handleSubmit}>
            <label>
              Email address
              <input
                type="email"
                placeholder="you@coffeehour.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <div className="form-row">
              <label className="check">
                <input type="checkbox" /> Remember me
              </label>
              <button type="button" className="link-button">
                Forgot password?
              </button>
            </div>
            {error && (
              <p className="field-help" style={{ color: '#a33b31', marginBottom: 14 }}>
                {error}
              </p>
            )}
            <button className="primary login-button" type="submit" disabled={submitting}>
              {submitting ? (
                'Signing in…'
              ) : (
                <>
                  Sign in <span>→</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="secondary login-button"
              onClick={() => setShowRegister(true)}
            >
              Create an account
            </button>
          </form>
          <p className="demo-note">
            <span>●</span> Sign in with your Inventory Hub account
          </p>
        </div>
        <p className="copyright">© 2026 Inventory Hub · Coffee Hour Demo</p>
      </section>
      {showRegister && (
        <div className="modal-backdrop" onMouseDown={closeRegister}>
          <form
            className="modal"
            onSubmit={handleRegister}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">NEW ACCOUNT</span>
                <h2>Create an account</h2>
              </div>
              <button type="button" onClick={closeRegister}>
                ×
              </button>
            </div>
            <label>
              Email address
              <input
                type="email"
                placeholder="you@coffeehour.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                minLength={6}
                required
              />
              <small className="field-help">At least 6 characters.</small>
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>
            {regError && (
              <p className="field-help" style={{ color: '#a33b31' }}>
                {regError}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeRegister}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={regSubmitting}>
                {regSubmitting ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}

type Page = 'dashboard' | 'inventory' | 'low' | 'settings'
type Company = { name: string; type: string; accent: string; manager: string }

function App() {
  // ---------------- State ----------------
  const [loggedIn, setLoggedIn] = useState(false)
  const [page, setPage] = useState<Page>('dashboard')
  const [items, setItems] = useState<Item[]>([])
  const [company, setCompany] = useState<Company>({
    name: 'Coffee Hour',
    type: 'Coffee shop',
    accent: '#a9642e',
    manager: 'Alex Morgan',
  })
  const [businessCategories, setBusinessCategories] = useState<string[]>(categories)
  const [categoryIdByName, setCategoryIdByName] = useState<Record<string, string>>({})
  const [categoryInput, setCategoryInput] = useState(categories.join(', '))
  const [saved, setSaved] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [modal, setModal] = useState<'add' | 'edit' | 'delete' | null>(null)
  const [draft, setDraft] = useState<Draft>(blankItem())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Raw pictureURL-style value from the server, resolved to a displayable
  // URL only at render time -- same reasoning as Item.image (see
  // normalizeItem above): keeps whatever we send back to the server on
  // change as the real relative path, not an absolute URL.
  const [bannerImage, setBannerImage] = useState<string | undefined>(undefined)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [showBannerModal, setShowBannerModal] = useState(false)
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  // Whether the heading/eyebrow/subtitle text renders over the banner --
  // just a display preference, not persisted anywhere, so it resets to
  // shown on reload.
  const [showHeaderText, setShowHeaderText] = useState(true)
  // Whichever of white/black actually has better contrast against the
  // current banner image, computed below. Defaults to white to match the
  // page's look with no banner set.
  const [bannerTextColor, setBannerTextColor] = useState<'white' | 'black'>('white')
  // A photo the user just picked but hasn't saved yet -- held locally and
  // only actually uploaded on submit, so cancelling the modal never leaves
  // an orphaned file on the server.
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)

  // Local preview of pendingPhoto. Revoked whenever it changes/unmounts so
  // blob URLs don't pile up.
  const pendingPhotoPreview = useMemo(
    () => (pendingPhoto ? URL.createObjectURL(pendingPhoto) : null),
    [pendingPhoto],
  )
  useEffect(() => {
    return () => {
      if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
    }
  }, [pendingPhotoPreview])

  // Picks whichever of white/black text has better contrast against the
  // banner, by drawing it into an offscreen canvas and averaging pixel
  // brightness. crossOrigin is required to read pixels back out of the
  // canvas at all when the image is served from a different origin (e.g.
  // the Android app's https://localhost origin loading the image from the
  // real API domain) -- if the server hasn't sent the right CORS header for
  // that, reading the canvas throws a SecurityError, which is caught below
  // and just falls back to white rather than breaking the page.
  useEffect(() => {
    const resolvedUrl = api.resolveImageUrl(bannerImage)
    if (!resolvedUrl) {
      setBannerTextColor('white')
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (cancelled) return
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let total = 0
        for (let i = 0; i < data.length; i += 4) {
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        }
        const averageBrightness = total / (data.length / 4)
        setBannerTextColor(averageBrightness > 140 ? 'black' : 'white')
      } catch {
        setBannerTextColor('white')
      }
    }
    img.onerror = () => setBannerTextColor('white')
    img.src = resolvedUrl
    return () => {
      cancelled = true
    }
  }, [bannerImage])

  // ---------------- Data loading ----------------
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
        fetchedCategories.forEach((c) => {
          idByName[c.name] = c._id
          nameById[c._id] = c.name
        })
        setCategoryIdByName(idByName)
        const names = mergeCategoryNames(
          categories,
          fetchedCategories.map((c) => c.name),
        )
        setBusinessCategories(names)
        setCategoryInput(names.join(', '))

        const fetchedItems = await api.fetchItems()
        if (cancelled) return
        setItems(fetchedItems.map((it) => normalizeItem(it, nameById)))
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : 'Failed to load inventory data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loggedIn])

  // ---------------- Derived values ----------------
  const lowItems = items.filter((item) => item.quantity <= item.min)
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (page !== 'low' || item.quantity <= item.min) &&
          (category === 'All categories' || item.category === category) &&
          `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, page, category, query],
  )
  const initials = company.manager
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // ---------------- Handlers ----------------
  const handleLogin = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password)
    localStorage.setItem('token', token)
    // Your User model doesn't store a display name, so this derives one from
    // the email address (e.g. "alex.morgan@coffeehour.com" -> "Alex Morgan").
    const displayName = user.email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    setCompany((current) => ({ ...current, manager: displayName || current.manager }))
    setBannerImage(user.bannerImage || undefined)
    setLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setLoggedIn(false)
    setItems([])
    setPage('dashboard')
    setBannerImage(undefined)
  }

  const handleDeleteAccount = async () => {
    setLoadError('')
    setDeletingAccount(true)
    try {
      await api.deleteAccount()
      setShowDeleteAccountModal(false)
      handleLogout()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not delete account')
    } finally {
      setDeletingAccount(false)
    }
  }

  // Uploads immediately (unlike item photos, there's no surrounding form/
  // submit step here -- picking a new banner is the entire action) and
  // saves it to the account right away.
  const changeBanner = async (file?: File) => {
    if (!file) return
    setLoadError('')
    setUploadingBanner(true)
    try {
      const pictureURL = await api.uploadItemImage(file)
      const user = await api.updateBanner(pictureURL)
      setBannerImage(user.bannerImage || undefined)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not update banner')
    } finally {
      setUploadingBanner(false)
    }
  }

  const removeBanner = async () => {
    setLoadError('')
    setUploadingBanner(true)
    try {
      const user = await api.updateBanner('')
      setBannerImage(user.bannerImage || undefined)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not remove banner')
    } finally {
      setUploadingBanner(false)
    }
  }

  const openAdd = () => {
    setDraft(blankItem())
    setSelectedId(null)
    setPendingPhoto(null)
    setModal('add')
  }
  const openEdit = (item: Item) => {
    setDraft({ ...item })
    setSelectedId(item.id)
    setPendingPhoto(null)
    setModal('edit')
  }
  const closeModal = () => {
    setModal(null)
    setPendingPhoto(null)
  }

  // Creates the category on the backend the first time it's used, so the
  // user never has to visit Settings before adding their first item.
  const ensureCategoryId = async (name: string): Promise<string> => {
    if (categoryIdByName[name]) return categoryIdByName[name]
    const created = await api.addCategory(name)
    setCategoryIdByName((current) => ({ ...current, [name]: created._id }))
    setBusinessCategories((current) => (current.includes(name) ? current : [...current, name]))
    return created._id
  }

  const saveItem = async (event: FormEvent) => {
    event.preventDefault()
    setLoadError('')
    setSubmitting(true)
    try {
      const categoryID = await ensureCategoryId(draft.category)
      // The photo is only actually uploaded here, on submit -- not when it
      // was picked -- so cancelling the modal never leaves an orphaned file
      // on the server. Sent as '' rather than omitted when there's no photo,
      // so removing an existing item's photo actually clears it server-side
      // instead of the field just being silently left unchanged.
      const pictureURL = pendingPhoto
        ? await api.uploadItemImage(pendingPhoto)
        : (draft.image ?? '')
      const payload: api.NewItemPayload = {
        name: draft.name,
        sku: draft.sku || undefined,
        unit: draft.unit || undefined,
        // required on both inputs already stops the form submitting while
        // blank -- these fallbacks just satisfy the type/are a last resort.
        amount: draft.quantity === '' ? 0 : draft.quantity,
        lowStockThreshold: draft.min === '' ? 0 : draft.min,
        categoryID,
        pictureURL,
      }

      if (modal === 'add') {
        const created = await api.addItem(payload)
        setItems((current) => [
          ...current,
          {
            id: created._id,
            name: created.name,
            sku: created.sku ?? draft.sku,
            category: draft.category,
            quantity: created.amount,
            unit: created.unit ?? draft.unit,
            min: created.lowStockThreshold ?? (draft.min === '' ? 0 : draft.min),
            image: created.pictureURL || undefined,
          },
        ])
      } else if (selectedId) {
        const updated = await api.updateItem(selectedId, payload)
        setItems((current) =>
          current.map((item) =>
            item.id === selectedId
              ? {
                  id: item.id,
                  name: updated.name,
                  sku: updated.sku ?? draft.sku,
                  category: draft.category,
                  quantity: updated.amount,
                  unit: updated.unit ?? draft.unit,
                  min: updated.lowStockThreshold ?? (draft.min === '' ? 0 : draft.min),
                  image: updated.pictureURL || undefined,
                }
              : item,
          ),
        )
      }
      setPendingPhoto(null)
      setModal(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not save item')
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDelete = async () => {
    if (!selectedId) return
    setLoadError('')
    try {
      await api.deleteItem(selectedId)
      setItems((current) => current.filter((item) => item.id !== selectedId))
      setModal(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not delete item')
    }
  }

  const saveCategorySettings = async (event: FormEvent) => {
    event.preventDefault()
    setLoadError('')
    const values = categoryInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const toAdd = values.filter((v) => !businessCategories.includes(v))
    const toRemove = businessCategories.filter((v) => !values.includes(v))
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
      setCategoryIdByName((current) => ({ ...current, ...newIds }))
      setBusinessCategories(values)
      if (values.length && !values.includes(draft.category))
        setDraft((current) => ({ ...current, category: values[0] }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not update categories')
    }
  }

  // Just stages the file locally -- actually uploading happens in saveItem,
  // on submit, so picking a photo and then cancelling never leaves an
  // orphaned file on the server.
  const choosePhoto = (file?: File) => {
    if (!file) return
    setPendingPhoto(file)
  }

  const takeNativePhoto = async () => {
    try {
      const result = await Camera.takePhoto({ quality: 80 })
      if (result.thumbnail)
        setPendingPhoto(base64ToFile(result.thumbnail, 'photo.jpg', 'image/jpeg'))
    } catch {
      // User cancelled the camera or denied permission -- nothing to report.
    }
  }

  const chooseFromGalleryNative = async () => {
    try {
      const { results } = await Camera.chooseFromGallery({})
      const photo = results[0]
      if (photo?.thumbnail)
        setPendingPhoto(base64ToFile(photo.thumbnail, 'photo.jpg', 'image/jpeg'))
    } catch {
      // User cancelled the picker -- nothing to report.
    }
  }

  // Shared barcode-scan flow: checks the Google Barcode Scanner module is
  // available (kicking off installation if not), then scans and returns the
  // decoded value. Used by both the item modal's SKU field and the
  // inventory search bar.
  const scanBarcodeValue = async (): Promise<string | undefined> => {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule()
      setLoadError('Downloading the barcode scanner -- please try scanning again in a moment.')
      return undefined
    }
    const { barcodes } = await BarcodeScanner.scan()
    return barcodes[0]?.displayValue
  }

  // Scans a barcode and drops the decoded value straight into the SKU field.
  const scanBarcode = async () => {
    setLoadError('')
    try {
      const value = await scanBarcodeValue()
      if (value) setDraft((current) => ({ ...current, sku: value }))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not scan barcode')
    }
  }

  // Scans a barcode and uses the decoded value to search the inventory.
  const scanSearchBarcode = async () => {
    setLoadError('')
    try {
      const value = await scanBarcodeValue()
      if (value) setQuery(value)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not scan barcode')
    }
  }

  if (!loggedIn) return <Login onLogin={handleLogin} />

  // ---------------- Render ----------------
  const inventoryPanel = (
    <section className="inventory-card">
      <div className="section-heading">
        <div>
          <h2>
            {page === 'low'
              ? 'Low-stock items'
              : page === 'dashboard'
                ? 'Inventory overview'
                : 'All inventory'}
          </h2>
          <p>
            {page === 'low'
              ? 'Items at or below their reorder level.'
              : 'Search, update, and organize all company stock.'}
          </p>
        </div>
        <div className="tools">
          <label className={isNativePlatform ? 'search with-scan' : 'search'}>
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items or SKU..."
            />
            {isNativePlatform && (
              <button
                type="button"
                className="search-scan-button"
                aria-label="Scan barcode to search"
                onClick={scanSearchBarcode}
              >
                <Icon name="scan" />
              </button>
            )}
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All categories</option>
            {businessCategories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <button className="primary" onClick={openAdd}>
            <Icon name="plus" /> Add item
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ITEM</th>
              <th>CATEGORY</th>
              <th>QUANTITY</th>
              <th>REORDER AT</th>
              <th>STATUS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => {
              const low = item.quantity <= item.min
              return (
                <tr key={item.id}>
                  <td>
                    <div className="item-name">
                      {item.image ? (
                        <img
                          className="product-photo"
                          src={api.resolveImageUrl(item.image)}
                          alt=""
                        />
                      ) : (
                        <span
                          className={`product-icon ${item.category.toLowerCase().replaceAll(' ', '-')}`}
                        >
                          {item.name.charAt(0)}
                        </span>
                      )}
                      <div>
                        <strong>{item.name}</strong>
                        <small>{item.sku}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="category-pill">{item.category}</span>
                  </td>
                  <td>
                    <strong>{item.quantity}</strong> <span className="unit">{item.unit}</span>
                  </td>
                  <td>
                    {item.min} {item.unit}
                  </td>
                  <td>
                    <span className={`status ${low ? 'low' : 'good'}`}>
                      <i />
                      {low ? 'Low stock' : 'In stock'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}>
                        <Icon name="edit" />
                      </button>
                      <button
                        aria-label={`Delete ${item.name}`}
                        onClick={() => {
                          setSelectedId(item.id)
                          setModal('delete')
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {visibleItems.length === 0 && (
          <div className="empty">
            <Icon name="search" />
            <h3>No items found</h3>
            <p>{loading ? 'Loading inventory…' : 'Try another search or category.'}</p>
          </div>
        )}
      </div>
      <div className="table-footer">
        Showing {visibleItems.length} of {items.length} items
      </div>
    </section>
  )

  return (
    <div
      className="app-shell"
      style={{ '--company-accent': company.accent } as React.CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="box" />
          </span>
          <span>
            Inventory Hub<small>{company.name.toUpperCase()}</small>
          </span>
        </div>
        <nav>
          <button
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => setPage('dashboard')}
          >
            <Icon name="grid" /> Dashboard
          </button>
          <button
            className={page === 'inventory' ? 'active' : ''}
            onClick={() => setPage('inventory')}
          >
            <Icon name="box" /> Inventory
          </button>
          <button className={page === 'low' ? 'active' : ''} onClick={() => setPage('low')}>
            <Icon name="alert" /> Low stock <b>{lowItems.length}</b>
          </button>
          <button
            className={page === 'settings' ? 'active' : ''}
            onClick={() => setPage('settings')}
          >
            <Icon name="edit" /> Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="user-avatar">{initials}</div>
          <div>
            <strong>{company.manager}</strong>
            <small>{company.type}</small>
          </div>
          <button aria-label="Sign out" onClick={handleLogout}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <main className="dashboard">
        <div
          className={bannerImage ? 'page-banner has-image' : 'page-banner'}
          style={
            bannerImage
              ? ({
                  '--banner-text-color': bannerTextColor === 'black' ? '#1a1310' : '#fff',
                } as React.CSSProperties)
              : undefined
          }
        >
          {bannerImage && (
            <img className="page-banner-image" src={api.resolveImageUrl(bannerImage)} alt="" />
          )}
          <header>
            {showHeaderText && (
              <div>
                <span className="eyebrow">{company.name.toUpperCase()} · INVENTORY HUB</span>
                <h1>
                  {page === 'dashboard'
                    ? `Good morning, ${company.manager.split(' ')[0]}.`
                    : page === 'inventory'
                      ? 'Inventory'
                      : page === 'low'
                        ? 'Low-stock alerts'
                        : 'Customize your workspace'}
                </h1>
                <p>
                  {page === 'settings'
                    ? 'Adapt Inventory Hub to match any business or brand.'
                    : `Manage inventory for your ${company.type.toLowerCase()}.`}
                </p>
              </div>
            )}
            {page !== 'settings' && (
              <button
                type="button"
                className="banner-button"
                onClick={() => setShowBannerModal(true)}
              >
                <Icon name="edit" /> Customize
              </button>
            )}
          </header>
        </div>
        {loadError && (
          <div className="alert-banner">
            <span>
              <Icon name="alert" />
            </span>
            <div>
              <strong>Something went wrong</strong>
              <p>{loadError}</p>
            </div>
            <button onClick={() => setLoadError('')}>Dismiss</button>
          </div>
        )}
        {page === 'dashboard' && (
          <>
            <div className="alert-banner">
              <span>
                <Icon name="alert" />
              </span>
              <div>
                <strong>{lowItems.length} items need your attention</strong>
                <p>Stock is at or below the reorder level.</p>
              </div>
              <button onClick={() => setPage('low')}>View low stock →</button>
            </div>
            <section className="stats">
              <article>
                <span className="stat-icon brown">
                  <Icon name="box" />
                </span>
                <div>
                  <p>Total items</p>
                  <strong>{items.length}</strong>
                  <small>
                    Across {new Set(items.map((item) => item.category)).size} categories
                  </small>
                </div>
              </article>
              <article>
                <span className="stat-icon amber">
                  <Icon name="alert" />
                </span>
                <div>
                  <p>Low stock</p>
                  <strong>{lowItems.length}</strong>
                  <small>Needs attention</small>
                </div>
              </article>
              <article>
                <span className="stat-icon green">
                  <Icon name="grid" />
                </span>
                <div>
                  <p>Units in stock</p>
                  <strong>{items.reduce((total, item) => total + item.quantity, 0)}</strong>
                  <small>Current total</small>
                </div>
              </article>
            </section>
          </>
        )}
        {page !== 'settings' ? (
          inventoryPanel
        ) : (
          <section className="settings-grid">
            <form className="settings-card" onSubmit={saveCategorySettings}>
              <div className="settings-title">
                <span className="settings-symbol">
                  <Icon name="edit" />
                </span>
                <div>
                  <h2>Company details</h2>
                  <p>These details appear throughout the dashboard.</p>
                </div>
              </div>
              <label>
                Company name
                <input
                  value={company.name}
                  onChange={(event) => setCompany({ ...company, name: event.target.value })}
                  required
                />
              </label>
              <label>
                Business type
                <input
                  value={company.type}
                  onChange={(event) => setCompany({ ...company, type: event.target.value })}
                  placeholder="Retail store, salon, clinic..."
                  required
                />
              </label>
              <label>
                Manager name
                <input
                  value={company.manager}
                  onChange={(event) => setCompany({ ...company, manager: event.target.value })}
                  required
                />
              </label>
              <label>
                Inventory categories
                <input
                  value={categoryInput}
                  onChange={(event) => setCategoryInput(event.target.value)}
                  placeholder="Supplies, Products, Equipment"
                  required
                />
                <small className="field-help">Separate categories with commas.</small>
              </label>
              <div className="settings-actions">
                <span className={saved ? 'save-message show' : 'save-message'}>
                  ✓ Changes saved
                </span>
                <button className="primary" type="submit">
                  Save customization
                </button>
              </div>
            </form>
            <div className="settings-card">
              <div className="settings-title">
                <span className="settings-symbol">
                  <Icon name="grid" />
                </span>
                <div>
                  <h2>Brand color</h2>
                  <p>Choose an accent color for buttons and highlights.</p>
                </div>
              </div>
              <div className="color-row">
                <input
                  aria-label="Brand color"
                  type="color"
                  value={company.accent}
                  onChange={(event) => setCompany({ ...company, accent: event.target.value })}
                />
                <div>
                  <strong>{company.accent.toUpperCase()}</strong>
                  <small>Custom brand accent</small>
                </div>
              </div>
              <div className="preview-brand">
                <span className="brand-mark">
                  <Icon name="box" />
                </span>
                <div>
                  <strong>Inventory Hub</strong>
                  <small>{company.name}</small>
                </div>
              </div>
              <button
                className="secondary full-button"
                onClick={() => {
                  setCompany({
                    name: 'Coffee Hour',
                    type: 'Coffee shop',
                    accent: '#a9642e',
                    manager: 'Alex Morgan',
                  })
                  setCategoryInput(businessCategories.join(', '))
                }}
              >
                Restore demo branding
              </button>
            </div>
            <div className="settings-card danger-zone">
              <div className="settings-title">
                <span className="settings-symbol">
                  <Icon name="trash" />
                </span>
                <div>
                  <h2>Danger zone</h2>
                  <p>Permanently delete your account and all of its data.</p>
                </div>
              </div>
              <p className="field-help">
                This removes your account, every item, every category, and any uploaded photos. This
                action cannot be undone.
              </p>
              <button
                type="button"
                className="danger full-button"
                onClick={() => setShowDeleteAccountModal(true)}
              >
                Delete account
              </button>
            </div>
          </section>
        )}
      </main>
      {(modal === 'add' || modal === 'edit') && (
        <div className="modal-backdrop" onMouseDown={closeModal}>
          <form
            className="modal"
            onSubmit={saveItem}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">INVENTORY ITEM</span>
                <h2>{modal === 'add' ? 'Add a new item' : 'Edit item'}</h2>
              </div>
              <button type="button" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="photo-field">
              <div className="photo-preview">
                {pendingPhotoPreview || draft.image ? (
                  <img
                    src={pendingPhotoPreview ?? api.resolveImageUrl(draft.image)}
                    alt="Item preview"
                  />
                ) : (
                  <>
                    <Icon name="box" />
                    <span>No photo</span>
                  </>
                )}
              </div>
              <div>
                <strong>Item photo</strong>
                <p>Upload an image or take a photo on your phone.</p>
                {isNativePlatform ? (
                  <div className="photo-source-buttons">
                    <button
                      type="button"
                      className="photo-button"
                      disabled={submitting}
                      onClick={takeNativePhoto}
                    >
                      <Icon name="camera" /> Camera
                    </button>
                    <button
                      type="button"
                      className="photo-button"
                      disabled={submitting}
                      onClick={chooseFromGalleryNative}
                    >
                      <Icon name="gallery" /> Gallery
                    </button>
                  </div>
                ) : (
                  <label className="photo-button" aria-disabled={submitting}>
                    <span className="desktop-only">Choose photo</span>
                    <span className="mobile-only">Choose or take photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={submitting}
                      onChange={(event) => choosePhoto(event.target.files?.[0])}
                    />
                  </label>
                )}
                {(pendingPhotoPreview || draft.image) && (
                  <button
                    type="button"
                    className="remove-photo"
                    onClick={() => {
                      setPendingPhoto(null)
                      setDraft({ ...draft, image: '' })
                    }}
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
            <div className="form-grid">
              <label className="wide">
                Item name
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  required
                />
              </label>
              <label>
                SKU
                <div className="sku-field-row">
                  <input
                    value={draft.sku}
                    onChange={(event) => setDraft({ ...draft, sku: event.target.value })}
                    required
                  />
                  {isNativePlatform && (
                    <button
                      type="button"
                      className="scan-button"
                      aria-label="Scan barcode"
                      onClick={scanBarcode}
                    >
                      <Icon name="scan" />
                    </button>
                  )}
                </div>
              </label>
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                >
                  {businessCategories.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="0"
                  value={draft.quantity}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      quantity: event.target.value === '' ? '' : +event.target.value,
                    })
                  }
                  required
                />
              </label>
              <label>
                Unit
                <input
                  value={draft.unit}
                  onChange={(event) => setDraft({ ...draft, unit: event.target.value })}
                  required
                />
              </label>
              <label className="wide">
                Low-stock alert level
                <input
                  type="number"
                  min="0"
                  value={draft.min}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      min: event.target.value === '' ? '' : +event.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : modal === 'add' ? 'Add item' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}
      {modal === 'delete' && (
        <div className="modal-backdrop">
          <div className="modal delete-modal">
            <span className="delete-icon">
              <Icon name="trash" />
            </span>
            <h2>Delete this item?</h2>
            <p>
              This will remove <strong>{items.find((item) => item.id === selectedId)?.name}</strong>{' '}
              from your inventory.
            </p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="danger" onClick={confirmDelete}>
                Delete item
              </button>
            </div>
          </div>
        </div>
      )}
      {showBannerModal && (
        <div className="modal-backdrop" onMouseDown={() => setShowBannerModal(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">PAGE BANNER</span>
                <h2>Customize banner</h2>
              </div>
              <button type="button" onClick={() => setShowBannerModal(false)}>
                ×
              </button>
            </div>
            <div className="photo-field">
              <div className="photo-preview">
                {bannerImage ? (
                  <img src={api.resolveImageUrl(bannerImage)} alt="Banner preview" />
                ) : (
                  <>
                    <Icon name="box" />
                    <span>No banner</span>
                  </>
                )}
              </div>
              <div>
                <strong>Banner image</strong>
                <p>Shown behind the page heading.</p>
                <label className="photo-button" aria-disabled={uploadingBanner}>
                  {uploadingBanner ? 'Uploading…' : 'Choose photo'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingBanner}
                    onChange={(event) => changeBanner(event.target.files?.[0])}
                  />
                </label>
                {bannerImage && (
                  <button
                    type="button"
                    className="remove-photo"
                    disabled={uploadingBanner}
                    onClick={removeBanner}
                  >
                    Remove banner
                  </button>
                )}
              </div>
            </div>
            <div className="settings-toggle-row">
              <div>
                <strong>Header text</strong>
                <p>Show the page heading and subtitle over the banner.</p>
              </div>
              <button
                type="button"
                className={showHeaderText ? 'toggle-switch on' : 'toggle-switch'}
                role="switch"
                aria-checked={showHeaderText}
                aria-label="Toggle header text"
                onClick={() => setShowHeaderText((current) => !current)}
              >
                <span />
              </button>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setShowBannerModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {showDeleteAccountModal && (
        <div className="modal-backdrop">
          <div className="modal delete-modal">
            <span className="delete-icon">
              <Icon name="trash" />
            </span>
            <h2>Delete your account?</h2>
            <p>
              This permanently removes your account, every inventory item, every category, and any
              uploaded photos. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="secondary"
                disabled={deletingAccount}
                onClick={() => setShowDeleteAccountModal(false)}
              >
                Cancel
              </button>
              <button className="danger" disabled={deletingAccount} onClick={handleDeleteAccount}>
                {deletingAccount ? 'Deleting…' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
