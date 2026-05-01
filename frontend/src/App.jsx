import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { io } from 'socket.io-client'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000').replace(/\/$/, '')
const MAHDIA_CENTER = { lat: 35.5047, lng: 11.0622 }

const CATEGORY_LABELS = {
  BAKERY: 'Boulangerie',
  COOKED_MEALS: 'Plats cuisinés',
  FRUITS_VEGETABLES: 'Fruits et légumes',
  DAIRY: 'Produits laitiers',
  PASTRY: 'Pâtisseries',
  GROCERY: 'Épicerie',
}

const CATEGORY_ICONS = {
  BAKERY: 'B',
  COOKED_MEALS: 'P',
  FRUITS_VEGETABLES: 'F',
  DAIRY: 'L',
  PASTRY: 'T',
  GROCERY: 'E',
}

const PICKUP_MODE_LABELS = {
  ON_SITE: 'Retrait sur place',
  DELIVERY: 'Livraison solidaire',
  BOTH: 'Sur place ou livraison',
}

const RESERVATION_STATUS_LABELS = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  COLLECTED: 'Collectée',
  CANCELLED: 'Annulée',
}

const DELIVERY_STATUS_LABELS = {
  WAITING: 'En attente bénévole',
  ACCEPTED: 'Bénévole assigné',
  IN_PROGRESS: 'En cours',
  DELIVERED: 'Livrée',
}

const LISTING_TYPE_LABELS = {
  DONATION: 'Don gratuit',
  REDUCED_PRICE: 'Prix réduit',
  BOTH: 'Don ou prix réduit',
}

const ROLE_LABELS = {
  DONOR: 'Commerçant',
  RECEIVER: 'Bénéficiaire',
  VOLUNTEER: 'Bénévole',
}

const DEMO_ACCOUNTS = [
  {
    role: 'DONOR',
    label: 'Commerçant',
    email: 'boulangerie.elamel@foodrescue.tn',
    password: 'FoodRescue123!',
    hint: 'Publier un surplus et suivre les réservations',
  },
  {
    role: 'RECEIVER',
    label: 'Bénéficiaire',
    email: 'association.alamal@foodrescue.tn',
    password: 'FoodRescue123!',
    hint: 'Réserver vite et demander une livraison',
  },
  {
    role: 'VOLUNTEER',
    label: 'Bénévole',
    email: 'volunteer.hatem@foodrescue.tn',
    password: 'FoodRescue123!',
    hint: 'Accepter une mission et marquer la livraison',
  },
]

const socket = io(SOCKET_URL, { autoConnect: true })

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

async function apiRequest(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const details = Array.isArray(errorData.errors)
      ? errorData.errors
          .map((issue) => {
            const pathLabel = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')} : ` : ''
            return `${pathLabel}${issue.message}`
          })
          .join(' | ')
      : ''
    const message = errorData.message || 'Erreur API.'
    throw new Error(details ? `${message} ${details}` : message)
  }

  if (response.status === 204) return null
  return response.json()
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function getRoleLabel(role) {
  return ROLE_LABELS[role] || role
}

function sanitizePhone(value) {
  return value.replace(/[^\d+\s]/g, '').replace(/(?!^)\+/g, '').trim()
}

function isValidPhone(value) {
  const normalized = value.replace(/\s+/g, '')
  return normalized.length >= 8 && /^\+?\d+$/.test(normalized)
}

function isFiniteCoordinate(value) {
  return Number.isFinite(Number(value))
}

function isFutureDateValue(value) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) && timestamp > Date.now() + 5 * 60 * 1000
}

function isValidOptionalHttpUrl(value) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('foodRescueUser') || 'null')
  } catch {
    return null
  }
}

function getToken() {
  return localStorage.getItem('foodRescueToken') || ''
}

function roleToDashboard(role) {
  if (role === 'DONOR') return '/dashboard/merchant'
  if (role === 'VOLUNTEER') return '/dashboard/volunteer'
  return '/dashboard/beneficiary'
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatTimeLeft(value) {
  const target = new Date(value).getTime()
  const diff = target - Date.now()
  if (Number.isNaN(target)) return '-'
  if (diff <= 0) return 'Expire'

  const hours = Math.floor(diff / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))

  if (hours >= 24) {
    const days = Math.ceil(hours / 24)
    return `${days} j restants`
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${Math.max(minutes, 1)} min`
}

function isUrgentListing(item) {
  return new Date(item.expiresAt).getTime() - Date.now() < 2 * 60 * 60 * 1000
}

function supportsDeliveryMode(pickupMode) {
  return pickupMode === 'DELIVERY' || pickupMode === 'BOTH'
}

function listingPrimaryActionLabel(item) {
  return item.pickupMode === 'DELIVERY' ? 'Demander livraison' : 'Réserver'
}

function SummaryCard({ label, value, tone = 'default', help }) {
  return (
    <article className={classNames('summary-card', tone !== 'default' && `summary-card-${tone}`)}>
      <p className="summary-label">{label}</p>
      <p className="summary-value">{value}</p>
      {help ? <p className="summary-help">{help}</p> : null}
    </article>
  )
}

function StatusPill({ label, tone = 'neutral' }) {
  return <span className={classNames('status-pill', `status-${tone}`)}>{label}</span>
}

function FeedbackBanner({ message, tone = 'info' }) {
  if (!message) return null
  return <p className={classNames('feedback-banner', `feedback-${tone}`)}>{message}</p>
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <section className="page-header">
      <div>
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </section>
  )
}

function TopNav() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const user = getStoredUser()
  const dashboardLink = user ? roleToDashboard(user.role) : '/login'
  const roleLabel = user ? getRoleLabel(user.role) : ''

  const links = [
    { label: 'Accueil', to: '/' },
    { label: 'Dashboard', to: dashboardLink },
    { label: 'Carte', to: '/map' },
    { label: 'Impact', to: '/impact' },
  ]

  const isActiveLink = (to) => location.pathname === to || (to !== '/' && location.pathname.startsWith(to))

  return (
    <header className={classNames('app-nav', mobileMenuOpen && 'app-nav-open')}>
      <Link className="brand-lockup" onClick={() => setMobileMenuOpen(false)} to="/">
        <img src="/logo.png" alt="Food Rescue logo" className="brand-logo" />
        <span>
          <strong>Food Rescue</strong>
       
        </span>
      </Link>

      <nav className="nav-links" aria-label="Navigation principale">
        {links.map((link) => (
          <Link
            className={classNames(
              'nav-link',
              isActiveLink(link.to) ? 'nav-link-active' : '',
            )}
            key={link.to}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="nav-side">
        {user ? <span className="session-chip">{user.name} - {roleLabel}</span> : null}
        <Link className="button button-primary button-small" onClick={() => setMobileMenuOpen(false)} to={user ? dashboardLink : '/login'}>
          {user ? 'Mon espace' : 'Connexion'}
        </Link>
      </div>

      <button
        aria-controls="mobile-navigation"
        aria-expanded={mobileMenuOpen}
        aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        className="mobile-menu-button"
        onClick={() => setMobileMenuOpen((current) => !current)}
        type="button"
      >
        <span />
        <span />
        <span />
      </button>

      <nav
        className={classNames('mobile-nav-panel', mobileMenuOpen && 'mobile-nav-panel-open')}
        id="mobile-navigation"
        aria-label="Navigation mobile"
      >
        {user ? <p className="mobile-session-chip">{user.name} - {roleLabel}</p> : null}
        {links.map((link) => (
          <Link
            className={classNames('mobile-nav-link', isActiveLink(link.to) && 'mobile-nav-link-active')}
            key={link.to}
            onClick={() => setMobileMenuOpen(false)}
            to={link.to}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

function LandingPage() {
  const heroStats = [
    { value: '12', label: 'offres actives ' },
    { value: '3', label: 'parcours clairs par rôle' },
    { value: '24h', label: 'lecture rapide des urgences' },
  ]

  const rolePanels = [
    {
      eyebrow: 'Publier',
      title: 'Espace commerçant',
      description: 'Publiez un surplus, suivez les réservations et gardez une vue nette sur ce qui reste disponible.',
      to: '/register?role=DONOR',
      action: 'Entrer comme commerçant',
      tone: 'dark',
    },
    {
      eyebrow: 'Recevoir',
      title: 'Espace bénéficiaire',
      description: 'Repérez un don proche, confirmez la demande et activez une livraison si le déplacement est difficile.',
      to: '/register?role=RECEIVER',
      action: 'Entrer comme bénéficiaire',
      tone: 'default',
    },
    {
      eyebrow: 'Livrer',
      title: 'Espace bénévole',
      description: 'Prenez une mission, voyez les coordonnées utiles et clôturez la course sans perdre le fil.',
      to: '/register?role=VOLUNTEER',
      action: 'Entrer comme bénévole',
      tone: 'accent',
    },
  ]

  const steps = [
    {
      value: '01',
      title: 'Publier',
      description: 'Le commerçant rend un surplus visible avec heure, quantité et mode de retrait.',
    },
    {
      value: '02',
      title: 'Réserver',
      description: 'Le bénéficiaire confirme la demande ou active la livraison solidaire.',
    },
    {
      value: '03',
      title: 'Livrer',
      description: 'Le bénévole prend la mission et la clôture une fois la course terminée.',
    },
  ]

  const highlights = [
    {
      title: 'Comprendre en quelques secondes',
      description: 'La page montre tout de suite ce que fait la plateforme et où entrer selon son rôle.',
    },
    {
      title: 'Passer à l\'action sans chercher',
      description: 'Chaque espace commence par le bon prochain geste : publier, réserver ou livrer.',
    },
    {
      title: 'Donner une impression solide',
      description: 'Le design reste propre, lisible et assez fort pour marquer des visiteurs dès la première minute.',
    },
  ]

  return (
    <main className="app-page landing-page">
      <TopNav />

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="eyebrow-pill">Injaz Tunisie - prototype Food Rescue </div>
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            Rien ne se perd, tout se partage.
          </motion.h1>
          <p className="hero-text">
            Food Rescue relie commerçants, bénéficiaires et bénévoles dans un parcours unique et fluide qui reste facile à comprendre déjà la première visite.
          </p>
          <div className="landing-hero-actions">
            <Link className="button button-primary" to="/register?role=RECEIVER">Inscrivez-vous</Link>
            <Link className="button button-secondary" to="/login">Démarrer maintenant</Link>
          </div>
          <div className="landing-stat-row">
            {heroStats.map((item) => (
              <div className="landing-stat-card" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

    <div className="landing-hero-media">
  <img 
    alt="Aperçu Food Rescue" 
    className="landing-hero-image" 
    src="/logo.png" 
  />

          <div className="landing-floating-card landing-floating-card-top">
            <span className="page-eyebrow">Carte active</span>
            <strong>Collecte, réservation et impact visibles sans bruit inutile</strong>
          </div>
          <div className="landing-floating-card landing-floating-card-bottom">
            <span className="page-eyebrow">Coordination simple</span>
            <strong>Trois rôles, trois entrées, une lecture immédiate</strong>
          </div>
        </div>
      </section>

      <section className="content-band landing-role-band">
        <div className="band-heading landing-band-heading">
          <p className="page-eyebrow">Entrer vite</p>
          <h2>Choisissez votre espace sans hésiter</h2>
          <p className="page-description">Chaque rôle ouvre une interface dédiée avec son prochain geste visible dès l\'arrivée.</p>
        </div>
        <div className="role-grid">
          {rolePanels.map((panel) => (
            <article className={classNames('role-card', panel.tone === 'dark' && 'role-card-dark', panel.tone === 'accent' && 'role-card-accent')} key={panel.title}>
              <p className="page-eyebrow">{panel.eyebrow}</p>
              <h3>{panel.title}</h3>
              <p>{panel.description}</p>
              <Link className="button button-primary" to={panel.to}>{panel.action}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band landing-highlights-band">
        <div className="landing-highlights-grid">
          {highlights.map((item) => (
            <article className="surface landing-highlight-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band landing-flow-band">
        <div className="band-heading landing-band-heading">
          <p className="page-eyebrow">Comment ça marche</p>
          <h2>Trois étapes, une lecture immédiate</h2>
        </div>
        <div className="steps-grid">
          {steps.map((step) => (
            <article className="step-card landing-step-card" key={step.title}>
              <span className="step-index">{step.value}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function RegisterPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const defaultRole = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const role = params.get('role') || 'RECEIVER'
    return ['DONOR', 'RECEIVER', 'VOLUNTEER'].includes(role) ? role : 'RECEIVER'
  }, [location.search])

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+216',
    password: '',
    role: defaultRole,
    commerceName: '',
    commerceType: '',
    commerceAddress: '',
    commerceLat: '35.5047',
    commerceLng: '11.0622',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const roleCards = [
    { value: 'DONOR', title: 'Commerçant', description: 'Publier et suivre les surplus du commerce.' },
    { value: 'RECEIVER', title: 'Bénéficiaire', description: 'Réserver vite et demander une livraison si besoin.' },
    { value: 'VOLUNTEER', title: 'Bénévole', description: 'Prendre une mission et confirmer la livraison.' },
  ]

  const onChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: name === 'phone' ? sanitizePhone(value) : value }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const cleanedPhone = sanitizePhone(formData.phone)
      if (!formData.name.trim()) throw new Error('Ajoutez un nom pour creer le compte.')
      if (!isValidPhone(cleanedPhone)) throw new Error('Ajoutez un téléphone valide pour que les contacts terrain soient clairs.')
      if (formData.password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caracteres.')
      if (formData.role === 'DONOR') {
        if (!formData.commerceName.trim() || !formData.commerceType.trim() || !formData.commerceAddress.trim()) {
          throw new Error('Completez les informations du commerce avant de continuer.')
        }
        if (!isFiniteCoordinate(formData.commerceLat) || !isFiniteCoordinate(formData.commerceLng)) {
          throw new Error('Latitude et longitude doivent etre des nombres valides.')
        }
      }

      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: cleanedPhone,
        password: formData.password,
        role: formData.role,
      }

      if (formData.role === 'DONOR') {
        payload.commerce = {
          name: formData.commerceName.trim(),
          type: formData.commerceType.trim(),
          address: formData.commerceAddress.trim(),
          lat: Number(formData.commerceLat),
          lng: Number(formData.commerceLng),
        }
      }

      const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      localStorage.setItem('foodRescueToken', data.token)
      localStorage.setItem('foodRescueUser', JSON.stringify(data.user))
      navigate(roleToDashboard(data.user.role))
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-page auth-page">
      <TopNav />
      <section className="auth-shell">
        <PageHeader
          eyebrow="Demarrage"
          title="Creer un compte demo"
          description="Le prototype gère déjà trois rôles : commerçant, bénéficiaire et bénévole."
        />

        <form className="surface auth-card" onSubmit={onSubmit}>
          <div className="role-grid role-grid-compact">
            {roleCards.map((roleCard) => (
              <button
                className={classNames('role-card', 'role-selector-card', formData.role === roleCard.value && 'role-selector-card-active')}
                key={roleCard.value}
                onClick={() => setFormData((prev) => ({ ...prev, role: roleCard.value }))}
                type="button"
              >
                <p className="page-eyebrow">{roleCard.title}</p>
                <h3>{roleCard.title}</h3>
                <p>{roleCard.description}</p>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <label className="field-group">
              <span>Nom</span>
              <input className="field" name="name" onChange={onChange} placeholder="Nom complet" required value={formData.name} />
            </label>
            <label className="field-group">
              <span>Email</span>
              <input className="field" name="email" onChange={onChange} placeholder="nom@foodrescue.tn" required type="email" value={formData.email} />
            </label>
            <label className="field-group">
              <span>Telephone</span>
              <input className="field" name="phone" onChange={onChange} placeholder="+216 22 123 456" type="tel" value={formData.phone} />
              <small className="field-note">Le numéro aide les retraits et les livraisons à aller plus vite.</small>
            </label>
            <label className="field-group">
              <span>Mot de passe</span>
              <input className="field" minLength={8} name="password" onChange={onChange} placeholder="8 caracteres minimum" required type="password" value={formData.password} />
            </label>
            <label className="field-group field-span-full">
              <span>Role</span>
              <select className="field" name="role" onChange={onChange} value={formData.role}>
                <option value="DONOR">Commerçant / Donneur</option>
                <option value="RECEIVER">Bénéficiaire / Association</option>
                <option value="VOLUNTEER">Bénévole</option>
              </select>
            </label>
          </div>

          {formData.role === 'DONOR' ? (
            <div className="subsurface">
              <div className="band-heading compact">
                <p className="page-eyebrow">Commerce</p>
                <h2>Informations de publication</h2>
              </div>
              <div className="form-grid">
                <label className="field-group field-span-full">
                  <span>Nom du commerce</span>
                  <input className="field" name="commerceName" onChange={onChange} placeholder="Boulangerie, hotel, resto..." required value={formData.commerceName} />
                </label>
                <label className="field-group">
                  <span>Type</span>
                  <input className="field" name="commerceType" onChange={onChange} placeholder="Boulangerie" required value={formData.commerceType} />
                </label>
                <label className="field-group">
                  <span>Adresse</span>
                  <input className="field" name="commerceAddress" onChange={onChange} placeholder="Mahdia" required value={formData.commerceAddress} />
                </label>
                <label className="field-group">
                  <span>Latitude</span>
                  <input className="field" name="commerceLat" onChange={onChange} required step="0.0001" type="number" value={formData.commerceLat} />
                </label>
                <label className="field-group">
                  <span>Longitude</span>
                  <input className="field" name="commerceLng" onChange={onChange} required step="0.0001" type="number" value={formData.commerceLng} />
                </label>
              </div>
            </div>
          ) : null}

          <FeedbackBanner message={error} tone="error" />

          <div className="button-row">
            <button className="button button-primary" disabled={loading} type="submit">
              {loading ? 'Creation...' : 'Creer mon compte'}
            </button>
            <Link className="button button-secondary" to="/login">J\'ai déjà un compte</Link>
          </div>
        </form>
      </section>
    </main>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('association.alamal@foodrescue.tn')
  const [password, setPassword] = useState('FoodRescue123!')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const applyDemoAccount = (account) => {
    setEmail(account.email)
    setPassword(account.password)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      localStorage.setItem('foodRescueToken', data.token)
      localStorage.setItem('foodRescueUser', JSON.stringify(data.user))
      navigate(roleToDashboard(data.user.role))
    } catch (loginError) {
      setError(loginError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-page auth-page">
      <TopNav />
      <section className="auth-shell auth-shell-narrow">
        <PageHeader
          eyebrow="Connexion"
          title="Bienvenue sur Food Rescue"
          description="Les champs sont déjà pré-remplis avec un compte de test pour aller plus vite."
        />

        <form className="surface auth-card" onSubmit={onSubmit}>
          <div className="account-picker">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                className={classNames('account-chip', email === account.email && 'account-chip-active')}
                key={account.role}
                onClick={() => applyDemoAccount(account)}
                type="button"
              >
                <strong>{account.label}</strong>
                <span>{account.hint}</span>
              </button>
            ))}
          </div>

          <label className="field-group">
            <span>Email</span>
            <input className="field" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="field-group">
            <span>Mot de passe</span>
            <input className="field" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>

          <div className="demo-credentials">
            <span>Donnée de Test</span>
            <small>
              Commerçant: boulangerie.elamel@foodrescue.tn
              <br />
              Bénéficiaire: association.alamal@foodrescue.tn
              <br />
              Bénévole: volunteer.hatem@foodrescue.tn
            </small>
          </div>

          <FeedbackBanner message={error} tone="error" />

          <button className="button button-primary button-block" disabled={loading} type="submit">
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </section>
    </main>
  )
}

function MerchantDashboardPage() {
  const navigate = useNavigate()
  const token = getToken()
  const user = getStoredUser()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [listings, setListings] = useState([])
  const [formData, setFormData] = useState({
    title: '',
    category: 'BAKERY',
    quantity: '1',
    unit: 'kg',
    expiresAt: '',
    pickupMode: 'BOTH',
    type: 'DONATION',
    description: '',
    imageUrl: '',
    lat: String(user?.commerce?.lat || MAHDIA_CENTER.lat),
    lng: String(user?.commerce?.lng || MAHDIA_CENTER.lng),
  })

  const loadListings = async () => {
    if (!token || user?.role !== 'DONOR') return
    try {
      const data = await apiRequest('/listings?status=ALL')
      setListings(data.filter((item) => item.userId === user.id))
    } catch (loadError) {
      setError(loadError.message)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadListings()
    }, 0)
    const onReservation = () => loadListings()
    const onListingRefresh = () => loadListings()
    socket.on('new_reservation', onReservation)
    socket.on('new_listing', onListingRefresh)
    return () => {
      window.clearTimeout(timeoutId)
      socket.off('new_reservation', onReservation)
      socket.off('new_listing', onListingRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const summary = useMemo(() => ({
    active: listings.filter((item) => item.status === 'ACTIVE').length,
    reserved: listings.filter((item) => item.status === 'RESERVED').length,
    urgent: listings.filter((item) => item.status === 'ACTIVE' && isUrgentListing(item)).length,
    delivery: listings.filter((item) => supportsDeliveryMode(item.pickupMode)).length,
  }), [listings])

  if (!token || user?.role !== 'DONOR') {
    return <Navigate replace to="/login" />
  }

  const onChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    try {
      if (!formData.title.trim()) throw new Error('Ajoutez un titre clair pour la publication.')
      if (!Number.isFinite(Number(formData.quantity)) || Number(formData.quantity) <= 0) {
        throw new Error('La quantité doit être un nombre positif.')
      }
      if (!isFutureDateValue(formData.expiresAt)) {
        throw new Error('Choisissez une heure d\'expiration dans le futur.')
      }
      if (!isFiniteCoordinate(formData.lat) || !isFiniteCoordinate(formData.lng)) {
        throw new Error('Latitude et longitude doivent etre valides.')
      }
      if (!isValidOptionalHttpUrl(formData.imageUrl)) {
        throw new Error('Le lien image doit commencer par http:// ou https://.')
      }

      await apiRequest('/listings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...formData,
          expiresAt: new Date(formData.expiresAt).toISOString(),
          lat: Number(formData.lat),
          lng: Number(formData.lng),
          imageUrl: formData.imageUrl || undefined,
        }),
      })

      setMessage('Surplus publié. Il apparaît maintenant côté bénéficiaire et sur la carte.')
      setFormData((prev) => ({
        ...prev,
        title: '',
        quantity: '1',
        expiresAt: '',
        description: '',
        imageUrl: '',
      }))
      await loadListings()
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteListing = async (listingId) => {
    setDeletingId(listingId)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/listings/${listingId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMessage('Publication retiree du prototype.')
      await loadListings()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <main className="app-page dashboard-page">
      <TopNav />

      <section className="dashboard-hero dashboard-hero-dark">
        <PageHeader
          eyebrow="Espace commerçant"
          title={user.commerce?.name || 'Dashboard commerçant'}
          description="Publie rapidement un surplus, surveille les réservations, puis retire une annonce quand elle n\'est plus utile."
          actions={(
            <div className="button-row">
              <button className="button button-secondary" onClick={() => loadListings()} type="button">
                Actualiser
              </button>
              <button className="button button-secondary" onClick={() => { localStorage.clear(); navigate('/login') }} type="button">
                Se deconnecter
              </button>
            </div>
          )}
        />

        <div className="summary-grid">
          <SummaryCard help="encore visibles" label="Actifs" tone="inverse" value={summary.active} />
          <SummaryCard help="pris par un bénéficiaire" label="Réservées" tone="inverse" value={summary.reserved} />
          <SummaryCard help="moins de 2h" label="Urgents" tone="inverse" value={summary.urgent} />
          <SummaryCard help="retirable à distance" label="Livraison possible" tone="inverse" value={summary.delivery} />
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="stack">
          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Nouvelle publication</p>
              <h2>Publier un surplus</h2>
            </div>

            <form className="form-grid" onSubmit={onSubmit}>
              <label className="field-group field-span-full">
                <span>Nom du produit</span>
                <input className="field" name="title" onChange={onChange} placeholder="Pain, tajine, panier légumes..." required value={formData.title} />
              </label>
              <label className="field-group">
                <span>Categorie</span>
                <select className="field" name="category" onChange={onChange} value={formData.category}>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field-group">
                <span>Quantité</span>
                <input className="field" inputMode="decimal" min="0.1" name="quantity" onChange={onChange} required step="0.1" type="number" value={formData.quantity} />
              </label>
              <label className="field-group">
                <span>Unite</span>
                <input className="field" name="unit" onChange={onChange} required value={formData.unit} />
              </label>
              <label className="field-group">
                <span>Type</span>
                <select className="field" name="type" onChange={onChange} value={formData.type}>
                  <option value="DONATION">Don gratuit</option>
                  <option value="REDUCED_PRICE">Prix reduit</option>
                  <option value="BOTH">Les deux</option>
                </select>
              </label>
              <label className="field-group">
                <span>Expiration</span>
                <input className="field" name="expiresAt" onChange={onChange} required type="datetime-local" value={formData.expiresAt} />
              </label>
              <label className="field-group">
                <span>Mode de retrait</span>
                <select className="field" name="pickupMode" onChange={onChange} value={formData.pickupMode}>
                  <option value="ON_SITE">Sur place</option>
                  <option value="DELIVERY">Livraison</option>
                  <option value="BOTH">Les deux</option>
                </select>
              </label>
              <label className="field-group field-span-full">
                <span>Image (optionnel)</span>
                <input className="field" name="imageUrl" onChange={onChange} placeholder="https://..." type="url" value={formData.imageUrl} />
              </label>
              <label className="field-group field-span-full">
                <span>Description</span>
                <textarea className="field textarea" name="description" onChange={onChange} placeholder="Conservation, détails pratiques, conditionnement..." value={formData.description} />
              </label>
              <label className="field-group">
                <span>Latitude</span>
                <input className="field" name="lat" onChange={onChange} required step="0.0001" type="number" value={formData.lat} />
              </label>
              <label className="field-group">
                <span>Longitude</span>
                <input className="field" name="lng" onChange={onChange} required step="0.0001" type="number" value={formData.lng} />
              </label>

              <div className="field-span-full">
                <FeedbackBanner message={message} tone="success" />
                <FeedbackBanner message={error} tone="error" />
              </div>

              <div className="button-row field-span-full">
                <button className="button button-primary" disabled={loading} type="submit">
                  {loading ? 'Publication...' : 'Publier maintenant'}
                </button>
                <button className="button button-secondary" onClick={() => navigate('/map')} type="button">
                  Voir la carte
                </button>
              </div>
            </form>
          </article>
        </div>

        <div className="stack">
          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Suivi</p>
              <h2>Mes publications</h2>
            </div>

            {listings.length === 0 ? <p className="empty-state">Aucun surplus publie pour le moment.</p> : null}

            <div className="card-list">
              {listings.map((item) => (
                <article className="listing-card" key={item.id}>
                  <div className="listing-card-top">
                    <div className="listing-badge">{CATEGORY_LABELS[item.category] || item.category}</div>
                    <StatusPill
                      label={item.status}
                      tone={item.status === 'ACTIVE' ? 'success' : item.status === 'RESERVED' ? 'warning' : 'neutral'}
                    />
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.quantity} {item.unit} - {PICKUP_MODE_LABELS[item.pickupMode]}</p>
                  <p>Expire le {formatDateTime(item.expiresAt)}</p>
                  <div className="micro-row">
                    <span>{LISTING_TYPE_LABELS[item.type]}</span>
                    <span>{item._count?.reservations || 0} réservation(s)</span>
                  </div>
                  <div className="button-row">
                    <button className="button button-secondary button-small" onClick={() => navigate('/map')} type="button">
                      Carte
                    </button>
                    <button
                      className="button button-ghost button-small"
                      disabled={deletingId === item.id}
                      onClick={() => deleteListing(item.id)}
                      type="button"
                    >
                      {deletingId === item.id ? 'Retrait...' : 'Retirer'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Repère rapide</p>
              <h2>Que faire ici</h2>
            </div>
            <ul className="guide-list">
              <li>Publiez un surplus avec une heure d\'expiration précise.</li>
              <li>Surveillez les offres reservees pour savoir quoi preparer.</li>
              <li>Retirez une annonce quand le stock n est plus disponible.</li>
            </ul>
          </article>
        </div>
      </section>
    </main>
  )
}

function BeneficiaryDashboardPage() {
  const navigate = useNavigate()
  const token = getToken()
  const user = getStoredUser()
  const [listings, setListings] = useState([])
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [deliveryOnly, setDeliveryOnly] = useState(false)
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [reservationIntent, setReservationIntent] = useState(null)
  const [submittingReservationId, setSubmittingReservationId] = useState('')

  const loadDashboardData = async () => {
    if (!token || user?.role !== 'RECEIVER') return
    setLoading(true)
    setError('')
    try {
      const [activeListings, myReservations] = await Promise.all([
        apiRequest('/listings'),
        apiRequest('/reservations/mine', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      setListings(activeListings)
      setReservations(myReservations)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboardData()
    }, 0)
    const refresh = () => loadDashboardData()
    const onDeliveryAccepted = () => {
      setMessage('Un bénévole a accepté une demande de livraison.')
      loadDashboardData()
    }
    socket.on('new_listing', refresh)
    socket.on('new_reservation', refresh)
    socket.on('delivery_accepted', onDeliveryAccepted)
    return () => {
      window.clearTimeout(timeoutId)
      socket.off('new_listing', refresh)
      socket.off('new_reservation', refresh)
      socket.off('delivery_accepted', onDeliveryAccepted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!token || user?.role !== 'RECEIVER') {
    return <Navigate replace to="/login" />
  }

  const openReservationIntent = (listing, askDelivery) => {
    setMessage('')
    setError('')

    if (!listing?.id) {
      setError('Impossible de préparer cette demande. Rechargez la page puis réessayez.')
      return
    }

    const needsDelivery = listing.pickupMode === 'DELIVERY' || askDelivery

    if (askDelivery && !supportsDeliveryMode(listing.pickupMode)) {
      setError('Ce surplus doit etre recupere sur place. Aucune livraison n est disponible pour celui-ci.')
      return
    }

    setReservationIntent({
      listing,
      listingId: listing.id,
      needsDelivery,
    })
  }

  const reserveListing = async (listing, askDelivery) => {
    setMessage('')
    setError('')

    if (!listing?.id) {
      setError('Impossible d\'envoyer cette demande car l\'offre est incomplète. Rechargez la page puis réessayez.')
      return
    }

    const needsDelivery = listing.pickupMode === 'DELIVERY' || askDelivery
    setSubmittingReservationId(listing.id)

    try {
      await apiRequest('/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listingId: listing.id,
          needsDelivery,
          deliveryMode: needsDelivery ? 'VOLUNTEER' : undefined,
        }),
      })

      setMessage(
        needsDelivery
          ? 'Demande enregistrée. Elle apparaît maintenant dans votre suivi avec livraison solidaire.'
          : 'Réservation confirmée. Vous pouvez maintenant suivre cette demande dans votre espace.',
      )
      setReservationIntent(null)
      await loadDashboardData()
    } catch (reserveError) {
      setError(reserveError.message)
    } finally {
      setSubmittingReservationId('')
    }
  }

  const markCollected = async (reservationId) => {
    setMessage('')
    setError('')
    try {
      await apiRequest(`/reservations/${reservationId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMessage('Demande marquée comme collectée.')
      await loadDashboardData()
    } catch (collectError) {
      setError(collectError.message)
    }
  }

  const filteredListings = listings
    .filter((item) => {
      const term = search.toLowerCase()
      const bySearch = item.title.toLowerCase().includes(term) || item.commerce?.name?.toLowerCase().includes(term)
      const byCategory = category === 'ALL' || item.category === category
      const byUrgency = !urgentOnly || isUrgentListing(item)
      const byDelivery = !deliveryOnly || supportsDeliveryMode(item.pickupMode)
      return bySearch && byCategory && byUrgency && byDelivery
    })
    .sort((left, right) => new Date(left.expiresAt).getTime() - new Date(right.expiresAt).getTime())

  const activeReservations = reservations.filter((item) => item.status !== 'COLLECTED' && item.status !== 'CANCELLED')
  const deliveredReservations = reservations.filter((item) => item.status === 'COLLECTED')

  return (
    <main className="app-page dashboard-page">
      <TopNav />

      <section className="dashboard-hero beneficiary-hero">
        <PageHeader
          eyebrow="Espace bénéficiaire"
          title="Surplus disponibles pres de vous"
          description={`Mahdia - ${filteredListings.length} offre(s) visibles - ${activeReservations.length} demande(s) en cours`}
          actions={(
            <div className="button-row">
              <button className="button button-secondary" onClick={() => loadDashboardData()} type="button">
                Actualiser
              </button>
              <button className="button button-secondary" onClick={() => { localStorage.clear(); navigate('/login') }} type="button">
                Se deconnecter
              </button>
            </div>
          )}
        />

        <div className="summary-grid">
          <SummaryCard help="actives maintenant" label="Offres" value={filteredListings.length} />
          <SummaryCard help="reliables à un bénévole" label="Livraison possible" value={filteredListings.filter((item) => supportsDeliveryMode(item.pickupMode)).length} />
          <SummaryCard help="à traiter vite" label="Urgentes" tone="warning" value={filteredListings.filter((item) => isUrgentListing(item)).length} />
          <SummaryCard help="déjà réservées" label="Mes demandes" tone="success" value={activeReservations.length} />
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <div className="stack">
          <article className="surface surface-tight">
            <div className="beneficiary-guide">
              <div>
                <strong>1. Filtrer</strong>
                <span>Choisissez catégorie, urgence ou livraison.</span>
              </div>
              <div>
                <strong>2. Confirmer</strong>
                <span>Le bouton ouvre une confirmation avant envoi.</span>
              </div>
              <div>
                <strong>3. Suivre</strong>
                <span>Retrouvez la demande juste à droite dans votre suivi.</span>
              </div>
            </div>

          </article>

          <article className="surface surface-tight">
            <div className="search-row">
              <input className="field" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un produit ou un commerce..." value={search} />
              <button className="button button-secondary button-small" onClick={() => navigate('/map')} type="button">
                Ouvrir la carte
              </button>
            </div>

            <div className="chip-row">
              <button className={classNames('chip', category === 'ALL' && 'chip-active')} onClick={() => setCategory('ALL')} type="button">Tout</button>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <button
                  className={classNames('chip', category === value && 'chip-active')}
                  key={value}
                  onClick={() => setCategory(value)}
                  type="button"
                >
                  {label}
                </button>
              ))}
              <button className={classNames('chip', urgentOnly && 'chip-active')} onClick={() => setUrgentOnly((current) => !current)} type="button">
                Urgent
              </button>
              <button className={classNames('chip', deliveryOnly && 'chip-active')} onClick={() => setDeliveryOnly((current) => !current)} type="button">
                Livraison
              </button>
            </div>
          </article>

          <FeedbackBanner message={message} tone="success" />
          <FeedbackBanner message={error} tone="error" />

          <section className="offer-grid">
            {loading ? <p className="empty-state">Chargement des offres...</p> : null}
            {!loading && filteredListings.length === 0 ? <p className="empty-state">Aucune offre ne correspond à vos filtres.</p> : null}

            {filteredListings.map((item) => {
              const urgent = isUrgentListing(item)
              const onSiteOnly = item.pickupMode === 'ON_SITE'
              const isSubmitting = submittingReservationId === item.id

              return (
                <article className="offer-card" key={item.id}>
                  <div className="offer-visual">
                    {item.imageUrl ? (
                      <img alt={item.title} src={item.imageUrl} onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400' }} />
                    ) : (
                      <div className="offer-fallback">{CATEGORY_ICONS[item.category] || 'S'}</div>
                    )}
                    <div className="offer-badges">
                      <StatusPill label={urgent ? 'Urgent' : 'Actif'} tone={urgent ? 'warning' : 'success'} />
                      <StatusPill label={LISTING_TYPE_LABELS[item.type]} tone="neutral" />
                    </div>
                  </div>

                  <div className="offer-body">
                    <div className="offer-header">
                      <div>
                        <p className="offer-category">{CATEGORY_LABELS[item.category] || item.category}</p>
                        <h3>{item.title}</h3>
                      </div>
                      <div className="offer-icon">{CATEGORY_ICONS[item.category] || 'S'}</div>
                    </div>
                    <p className="offer-meta">{item.commerce?.name} - {item.quantity} {item.unit}</p>
                    <p className="offer-meta">{item.commerce?.address || 'Adresse à confirmer'} - {formatTimeLeft(item.expiresAt)}</p>
                    <p className="offer-description">{item.description || 'Aucune description supplementaire fournie pour ce surplus.'}</p>

                    <div className="offer-footer">
                      <span>{PICKUP_MODE_LABELS[item.pickupMode]}</span>
                      <span>Expire le {formatDateTime(item.expiresAt)}</span>
                    </div>

                    <div className="button-row">
                      <button
                        className="button button-primary button-small"
                        disabled={isSubmitting}
                        onClick={() => openReservationIntent(item, false)}
                        type="button"
                      >
                        {listingPrimaryActionLabel(item)}
                      </button>
                      {item.pickupMode !== 'DELIVERY' ? (
                        <button
                          className="button button-secondary button-small"
                          disabled={onSiteOnly || isSubmitting}
                          onClick={() => openReservationIntent(item, true)}
                          type="button"
                        >
                          Je ne peux pas me deplacer
                        </button>
                      ) : null}
                    </div>

                    <p className="offer-helper">
                      {onSiteOnly
                        ? 'Retrait sur place uniquement pour cette offre.'
                        : 'La livraison solidaire peut être déclenchée si nécessaire.'}
                    </p>
                  </div>
                </article>
              )
            })}
          </section>
        </div>

        <div className="stack">
          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Suivi</p>
              <h2>Mes demandes</h2>
            </div>

            {activeReservations.length === 0 ? <p className="empty-state">Aucune demande active pour le moment.</p> : null}

            <div className="card-list">
              {activeReservations.map((reservation) => {
                const canMarkCollected = !reservation.needsDelivery || reservation.delivery?.status === 'DELIVERED' || reservation.status === 'CONFIRMED'
                return (
                  <article className="reservation-card" key={reservation.id}>
                    <div className="listing-card-top">
                      <h3>{reservation.listing.title}</h3>
                      <StatusPill
                        label={RESERVATION_STATUS_LABELS[reservation.status] || reservation.status}
                        tone={reservation.status === 'CONFIRMED' ? 'success' : 'warning'}
                      />
                    </div>
                    <p>{reservation.listing.commerce?.name} - {reservation.listing.commerce?.address}</p>
                    <p>Retrait : {PICKUP_MODE_LABELS[reservation.listing.pickupMode]}</p>
                    <p>Livraison: {reservation.needsDelivery ? DELIVERY_STATUS_LABELS[reservation.delivery?.status] || 'En attente' : 'Non demandée'}</p>
                    {reservation.delivery?.volunteer ? (
                      <p>Bénévole: {reservation.delivery.volunteer.name} - {reservation.delivery.volunteer.phone}</p>
                    ) : null}

                    <div className="button-row">
                      {canMarkCollected ? (
                        <button className="button button-primary button-small" onClick={() => markCollected(reservation.id)} type="button">
                          Marquer collecte
                        </button>
                      ) : null}
                      <button className="button button-secondary button-small" onClick={() => navigate('/map')} type="button">
                        Voir la carte
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </article>

          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Historique</p>
              <h2>Demandes terminées</h2>
            </div>

            {deliveredReservations.length === 0 ? <p className="empty-state">Rien de collecté pour l\'instant.</p> : null}
            <div className="mini-list">
              {deliveredReservations.map((reservation) => (
                <div className="mini-list-row" key={reservation.id}>
                  <span>{reservation.listing.title}</span>
                  <StatusPill label="Collectee" tone="success" />
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      {reservationIntent ? (
        <div
          aria-hidden={submittingReservationId ? 'true' : 'false'}
          className="modal-backdrop"
          onClick={() => {
            if (!submittingReservationId) setReservationIntent(null)
          }}
          role="presentation"
        >
          <div
            aria-labelledby="reservation-modal-title"
            aria-modal="true"
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <p className="page-eyebrow">Confirmation</p>
            <h2 className="modal-title" id="reservation-modal-title">
              {reservationIntent.needsDelivery ? 'Confirmer la livraison solidaire' : 'Confirmer la réservation'}
            </h2>
            <p className="modal-copy">
              <strong>{reservationIntent.listing.title}</strong>
              <br />
              {reservationIntent.listing.commerce?.name} - {reservationIntent.listing.quantity} {reservationIntent.listing.unit}
            </p>
            <p className="modal-copy">
              {reservationIntent.needsDelivery
                ? 'La demande sera envoyée puis visible par les bénévoles disponibles.'
                : 'Cette offre sera ajoutée immédiatement à votre suivi.'}
            </p>
            <div className="button-row">
              <button
                className="button button-primary"
                disabled={submittingReservationId === reservationIntent.listingId}
                onClick={() => reserveListing(reservationIntent.listing, reservationIntent.needsDelivery)}
                type="button"
              >
                {submittingReservationId === reservationIntent.listingId
                  ? 'Envoi...'
                  : reservationIntent.needsDelivery
                    ? 'Confirmer la livraison'
                    : 'Confirmer'}
              </button>
              <button
                className="button button-secondary"
                disabled={submittingReservationId === reservationIntent.listingId}
                onClick={() => setReservationIntent(null)}
                type="button"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}
      
    </main>
  )
}

function VolunteerDashboardPage() {
  const navigate = useNavigate()
  const token = getToken()
  const user = getStoredUser()
  const [availableDeliveries, setAvailableDeliveries] = useState([])
  const [myDeliveries, setMyDeliveries] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const loadDeliveries = async () => {
    if (!token || user?.role !== 'VOLUNTEER') return
    setError('')
    setLoading(true)
    try {
      const [available, mine] = await Promise.all([
        apiRequest('/deliveries/available', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiRequest('/deliveries/mine', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      setAvailableDeliveries(available)
      setMyDeliveries(mine)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDeliveries()
    }, 0)
    const refresh = () => loadDeliveries()
    socket.on('delivery_request', refresh)
    socket.on('delivery_accepted', refresh)
    return () => {
      window.clearTimeout(timeoutId)
      socket.off('delivery_request', refresh)
      socket.off('delivery_accepted', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!token || user?.role !== 'VOLUNTEER') {
    return <Navigate replace to="/login" />
  }

  const acceptDelivery = async (deliveryId) => {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/deliveries/${deliveryId}/accept`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMessage('Livraison acceptee. Elle est maintenant dans vos missions.')
      await loadDeliveries()
    } catch (acceptError) {
      setError(acceptError.message)
    }
  }

  const markDone = async (deliveryId) => {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/deliveries/${deliveryId}/done`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      setMessage('Livraison marquee comme livree.')
      await loadDeliveries()
    } catch (doneError) {
      setError(doneError.message)
    }
  }

  const activeMissions = myDeliveries.filter((delivery) => delivery.status !== 'DELIVERED')
  const completedMissions = myDeliveries.filter((delivery) => delivery.status === 'DELIVERED')
  const highlightedMission = activeMissions[0] || availableDeliveries[0] || null

  return (
    <main className="app-page dashboard-page">
      <TopNav />

      <section className="dashboard-hero volunteer-hero">
        <PageHeader
          eyebrow="Espace benevole"
          title={`Missions de ${user.name}`}
          description="Tout ce qu il faut pour comprendre quoi prendre, qui livrer et quand cloturer une mission."
          actions={(
            <div className="button-row">
              <button className="button button-secondary" onClick={() => loadDeliveries()} type="button">
                {loading ? 'Actualisation...' : 'Actualiser'}
              </button>
              <button className="button button-secondary" onClick={() => { localStorage.clear(); navigate('/login') }} type="button">
                Se deconnecter
              </button>
            </div>
          )}
        />

        <div className="summary-grid">
          <SummaryCard help="à prendre" label="Disponibles" value={availableDeliveries.length} />
          <SummaryCard help="en cours pour vous" label="Mes missions" tone="success" value={activeMissions.length} />
          <SummaryCard help="terminées" label="Livrées" value={completedMissions.length} />
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="stack">
          <FeedbackBanner message={message} tone="success" />
          <FeedbackBanner message={error} tone="error" />

          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Mode d emploi</p>
              <h2>Le parcours bénévole en 3 étapes</h2>
            </div>
            <ul className="guide-list">
              <li>Repérez une course disponible dans la colonne de gauche.</li>
              <li>Acceptez la mission pour la faire passer dans votre suivi personnel.</li>
              <li>Une fois la course terminée, marquez la livraison comme livrée.</li>
            </ul>
          </article>

          {highlightedMission ? (
            <article className="surface mission-spotlight">
              <div className="band-heading compact">
                <p className="page-eyebrow">Priorite visible</p>
                <h2>{activeMissions[0] ? 'Mission en cours' : 'Prochaine course à prendre'}</h2>
              </div>
              <div className="mission-grid">
                <div>
                  <h3>{highlightedMission.reservation.listing.title}</h3>
                  <p>{highlightedMission.reservation.listing.commerce?.name} - {highlightedMission.reservation.listing.commerce?.address || 'Adresse à confirmer'}</p>
                  <p>Bénéficiaire: {highlightedMission.reservation.user?.name} - {highlightedMission.reservation.user?.phone}</p>
                </div>
                <div className="mission-actions">
                  <StatusPill
                    label={DELIVERY_STATUS_LABELS[highlightedMission.status] || highlightedMission.status}
                    tone={highlightedMission.status === 'DELIVERED' ? 'success' : 'warning'}
                  />
                  {activeMissions[0] ? (
                    <button className="button button-primary" onClick={() => markDone(highlightedMission.id)} type="button">
                      Marquer livree
                    </button>
                  ) : (
                    <button className="button button-primary" onClick={() => acceptDelivery(highlightedMission.id)} type="button">
                      Accepter cette mission
                    </button>
                  )}
                </div>
              </div>
            </article>
          ) : null}

          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Demandes ouvertes</p>
              <h2>Courses disponibles</h2>
            </div>

            {loading ? <p className="empty-state">Chargement des demandes bénévoles...</p> : null}
            {!loading && availableDeliveries.length === 0 ? <p className="empty-state">Aucune demande disponible actuellement.</p> : null}

            <div className="card-list">
              {availableDeliveries.map((delivery) => (
                <article className="reservation-card mission-card" key={delivery.id}>
                  <div className="listing-card-top">
                    <h3>{delivery.reservation.listing.title}</h3>
                    <StatusPill label="Disponible" tone="success" />
                  </div>
                  <p>Collecte: {delivery.reservation.listing.commerce?.name}</p>
                  <p>Adresse: {delivery.reservation.listing.commerce?.address || 'Non renseignee'}</p>
                  <p>Beneficiaire: {delivery.reservation.user?.name} - {delivery.reservation.user?.phone}</p>
                  <div className="button-row">
                    <button className="button button-primary button-small" onClick={() => acceptDelivery(delivery.id)} type="button">
                      Accepter la mission
                    </button>
                    <button className="button button-secondary button-small" onClick={() => navigate('/map')} type="button">
                      Voir la carte
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>

        <div className="stack">
          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Suivi perso</p>
              <h2>Mes missions actives</h2>
            </div>

            {activeMissions.length === 0 ? <p className="empty-state">Vous n'avez pas encore pris de mission.</p> : null}

            <div className="card-list">
              {activeMissions.map((delivery) => (
                <article className="reservation-card mission-card" key={delivery.id}>
                  <div className="listing-card-top">
                    <h3>{delivery.reservation.listing.title}</h3>
                    <StatusPill
                      label={DELIVERY_STATUS_LABELS[delivery.status] || delivery.status}
                      tone="warning"
                    />
                  </div>
                  <p>Commerce: {delivery.reservation.listing.commerce?.name}</p>
                  <p>Beneficiaire: {delivery.reservation.user?.name} - {delivery.reservation.user?.phone}</p>
                  <p>Adresse: {delivery.reservation.listing.commerce?.address}</p>
                  <div className="button-row">
                    <button className="button button-primary button-small" onClick={() => markDone(delivery.id)} type="button">
                      Marquer livree
                    </button>
                    <button className="button button-secondary button-small" onClick={() => navigate('/map')} type="button">
                      Revoir la carte
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </article>

          <article className="surface">
            <div className="band-heading compact">
              <p className="page-eyebrow">Historique</p>
              <h2>Missions terminées</h2>
            </div>

            {completedMissions.length === 0 ? <p className="empty-state">Aucune mission livree pour le moment.</p> : null}
            <div className="mini-list">
              {completedMissions.map((delivery) => (
                <div className="mini-list-row" key={delivery.id}>
                  <span>{delivery.reservation.listing.title}</span>
                  <StatusPill label="Livree" tone="success" />
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

function ImpactPage() {
  const [stats, setStats] = useState(null)
  const [ranking, setRanking] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadImpact = async () => {
      try {
        const [data, topCommerces] = await Promise.all([
          apiRequest('/impact/global'),
          apiRequest('/commerce/ranking/global'),
        ])
        setStats(data)
        setRanking(topCommerces)
      } catch (impactError) {
        setError(impactError.message)
      }
    }
    loadImpact()
  }, [])

  const cards = stats
    ? [
        ['Kg sauves', Number(stats.kgSaved).toFixed(1)],
        ['Repas redistribues', stats.meals],
        ['Kg CO2 evites', Number(stats.co2Avoided).toFixed(1)],
        ['Commerçants', stats.donors],
        ['Bénéficiaires', stats.receivers],
        ['Bénévoles', stats.volunteers],
      ]
    : []

  return (
    <main className="app-page dashboard-page">
      <TopNav />
      <section className="content-band">
        <PageHeader
          eyebrow="Impact"
          title="Impact public de la plateforme"
          description="Une lecture simple des volumes redistribues et des commerces les plus actifs."
        />

        <FeedbackBanner message={error} tone="error" />

        <div className="summary-grid">
          {cards.map(([label, value]) => (
            <SummaryCard key={label} label={label} value={value} />
          ))}
        </div>

        <article className="surface">
          <div className="band-heading compact">
            <p className="page-eyebrow">Classement</p>
            <h2>Top commerçants</h2>
          </div>

          {ranking.length === 0 ? <p className="empty-state">Aucun classement disponible.</p> : null}

          <div className="mini-list">
            {ranking.map((commerce, index) => (
              <div className="mini-list-row" key={commerce.id}>
                <span>{index + 1}. {commerce.name}</span>
                <strong>{commerce.score.toFixed(1)}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  )
}

function MapFocus({ lat, lng }) {
  const map = useMap()

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 15)
    }
  }, [lat, lng, map])

  return null
}

function MapPage() {
  const user = getStoredUser()
  const [points, setPoints] = useState([])
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const loadMapData = async () => {
    try {
      const data = await apiRequest('/impact/map')
      setPoints(data)
      setSelected((current) => current || data[0]?.id || null)
    } catch (mapError) {
      setError(mapError.message)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadMapData()
    }, 0)
    const refresh = () => loadMapData()
    socket.on('new_listing', refresh)
    socket.on('new_reservation', refresh)
    return () => {
      window.clearTimeout(timeoutId)
      socket.off('new_listing', refresh)
      socket.off('new_reservation', refresh)
    }
  }, [])

  const filtered = points.filter((point) => {
    const term = search.toLowerCase()
    return point.title.toLowerCase().includes(term) || point.commerce?.name?.toLowerCase().includes(term)
  })
  const focused = filtered.find((point) => point.id === selected) || filtered[0] || null

  return (
    <main className="map-page-shell">
      <TopNav />

      <aside className="map-sidebar">
        <div className="map-sidebar-section">
          <p className="page-eyebrow">Carte terrain</p>
          <h1 className="map-title">Carte des surplus à Mahdia</h1>
          <p className="map-copy">Cliquez une offre pour recentrer la carte et retrouver rapidement le point de collecte.</p>
          <input className="field" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un surplus..." value={search} />
          <FeedbackBanner message={error} tone="error" />
        </div>

        {focused ? (
          <div className="map-sidebar-section surface-lite">
            <div className="listing-card-top">
              <div>
                <p className="offer-category">{CATEGORY_LABELS[focused.category] || focused.category}</p>
                <h2 className="map-focus-title">{focused.title}</h2>
              </div>
              <StatusPill label={focused.urgency === 'URGENT' ? 'Urgent' : 'Actif'} tone={focused.urgency === 'URGENT' ? 'warning' : 'success'} />
            </div>
            <p>{focused.commerce?.name}</p>
            <p>{focused.commerce?.address}</p>
            <p>Expire le {formatDateTime(focused.expiresAt)}</p>
            <div className="button-row">
              <Link className="button button-primary button-small" to={user?.role === 'RECEIVER' ? '/dashboard/beneficiary' : '/login'}>
                {user?.role === 'RECEIVER' ? 'Réserver depuis le dashboard' : 'Se connecter'}
              </Link>
            </div>
          </div>
        ) : null}

        <div className="map-list">
          {filtered.map((point) => (
            <button
              className={classNames('map-list-item', selected === point.id && 'map-list-item-active')}
              key={point.id}
              onClick={() => setSelected(point.id)}
              type="button"
            >
              <div className="map-list-badge">{CATEGORY_ICONS[point.category] || 'S'}</div>
              <div>
                <strong>{point.title}</strong>
                <p>{point.commerce?.name}</p>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="map-canvas">
        <MapContainer center={[MAHDIA_CENTER.lat, MAHDIA_CENTER.lng]} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {focused ? <MapFocus lat={focused.lat} lng={focused.lng} /> : null}
          {filtered.map((point) => (
            <Marker key={point.id} position={[point.lat, point.lng]}>
              <Popup>
                {point.imageUrl ? (
                  <img
                    alt={point.title}
                   src={point.imageUrl} onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=400' }}
                    style={{ width: '100%', maxWidth: 220, borderRadius: 12, marginBottom: 8 }}
                  />
                ) : null}
                <p><strong>{point.title}</strong></p>
                <p>{point.commerce?.name}</p>
                <p>{point.urgency === 'URGENT' ? 'Urgent' : 'Actif'}</p>
                <Link to={user?.role === 'RECEIVER' ? '/dashboard/beneficiary' : '/login'}>Ouvrir le parcours</Link>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </section>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<LandingPage />} path="/" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<MerchantDashboardPage />} path="/dashboard/merchant" />
      <Route element={<BeneficiaryDashboardPage />} path="/dashboard/beneficiary" />
      <Route element={<VolunteerDashboardPage />} path="/dashboard/volunteer" />
      <Route element={<MapPage />} path="/map" />
      <Route element={<ImpactPage />} path="/impact" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}

export default App
