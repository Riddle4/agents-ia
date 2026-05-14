import "dotenv/config"
import express from "express"
import multer from "multer"
import { prisma } from "../src/lib/prisma"
import {
  addIgnoredSender,
  listIgnoredSenders,
  removeIgnoredSender,
} from "../src/services/ignored-sender.service"
import { generateReplyForTaskWithHumanInfo } from "../src/services/task.service"
import {
  addBirthdayReservationToCalendar,
  analyzeBirthdayReservation,
  type UploadedReservationFile,
} from "../src/services/birthday-reservation.service"
import {
  isMarketDomain,
  loadMarketDomainResults,
  loadMarketDashboardSnapshot,
  runMarketAnalysis,
  type MarketDomain,
} from "../src/services/market-analysis.service"
import {
  PHOENIX_FIELDS,
  PHOENIX_IMPORT_TYPES,
  commitImport,
  createImportPreview,
  createManualOrganization,
  createManualPerson,
  ensurePhoenixServices,
  ensurePhoenixOperationalData,
  generateOpportunities,
  generateOpportunityMessage,
  loadPhoenixDashboard,
  updateOpportunityStatus,
} from "../src/services/phoenix-crm.service"

const app = express()
const port = process.env.PORT || 3000
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
})

app.use(express.urlencoded({ extended: true }))
app.use(express.json({ limit: "35mb" }))

function requireDashboardAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization

  if (!auth || !auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard Agents IA"')
    return res.status(401).send("Authentification requise")
  }

  const base64Credentials = auth.split(" ")[1]
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8")
  const [username, password] = credentials.split(":")

  const expectedUser = process.env.DASHBOARD_USER
  const expectedPassword = process.env.DASHBOARD_PASSWORD

  if (username !== expectedUser || password !== expectedPassword) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Dashboard Agents IA"')
    return res.status(401).send("Accès refusé")
  }

  next()
}

app.use(requireDashboardAuth)
app.use(express.static(process.cwd() + "/public"))

function escapeHtml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function extractSuggestedReply(description: string) {
  const marker = "--- RÉPONSE SUGGÉRÉE ---"

  if (!description.includes(marker)) {
    return ""
  }

  return description.split(marker)[1].trim()
}

function extractInternalInfoRequest(description: string) {
  const internalMarker = "--- INFORMATION INTERNE REQUISE ---"
  const messageMarker = "--- MESSAGE CLIENT ---"

  if (!description.includes(internalMarker)) {
    return ""
  }

  const afterInternalMarker = description.split(internalMarker)[1]

  if (afterInternalMarker.includes(messageMarker)) {
    return afterInternalMarker.split(messageMarker)[0].trim()
  }

  return afterInternalMarker.trim()
}

function extractClientMessage(description: string) {
  const messageMarker = "--- MESSAGE CLIENT ---"
  const replyMarker = "--- RÉPONSE SUGGÉRÉE ---"

  if (!description.includes(messageMarker)) {
    return description.trim()
  }

  const afterMessageMarker = description.split(messageMarker)[1]

  if (afterMessageMarker.includes(replyMarker)) {
    return afterMessageMarker.split(replyMarker)[0].trim()
  }

  return afterMessageMarker.trim()
}

const marketDomainLabels: Record<MarketDomain, string> = {
  ANNIVERSAIRE: "Anniversaires",
  STAGE: "Stages",
  COURS: "Cours de magie",
}

const marketDomainViews: Record<MarketDomain, string> = {
  ANNIVERSAIRE: "market-anniversaires",
  STAGE: "market-stages",
  COURS: "market-cours",
}

function formatMarketPrice(price: number | null, currency: string | null) {
  if (price === null || Number.isNaN(Number(price))) {
    return "Prix non détecté"
  }

  return `${currency || "CHF"} ${Number(price).toLocaleString("fr-CH")}`
}

function renderMarketSourceLink(url: string | null) {
  if (!url) {
    return `<span class="no-reply">Source non détectée</span>`
  }

  const safeUrl = escapeHtml(url)

  return `<a class="link-button market-source-link" href="${safeUrl}" data-source-url="${safeUrl}" target="_blank" rel="noopener noreferrer">Voir la source</a>`
}

function formatCurrency(value: number | null | undefined) {
  return `CHF ${Number(value || 0).toLocaleString("fr-CH")}`
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Non renseigné"
  return new Date(value).toLocaleDateString("fr-CH")
}

function formatDateInput(value: Date | string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(0, 10)
}

function parseDashboardDate(value: unknown) {
  const text = String(value || "").trim()
  return text ? new Date(text) : null
}

function normalizeDashboardEmail(value: unknown) {
  return String(value || "").trim().toLowerCase() || null
}

function normalizeDashboardPhone(value: unknown) {
  return String(value || "").trim().replace(/[^0-9+]/g, "") || null
}

function redirectBack(res: express.Response, fallback: string, req?: express.Request) {
  res.redirect(req?.headers.referer || fallback)
}

function phoenixNav(active: string) {
  const items = [
    ["/phoenix", "Dashboard"],
    ["/phoenix/clients", "Clients privés"],
    ["/phoenix/organizations", "Organisations"],
    ["/phoenix/opportunities", "Opportunités"],
    ["/phoenix/settings", "Paramètres"],
  ]

  return items
    .map(([href, label]) => `<a class="side-link ${active === href ? "is-active" : ""}" href="${href}">${label}</a>`)
    .join("")
}

function renderPhoenixShell(params: { active: string; title: string; subtitle: string; body: string }) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Phoenix CRM — Cosmo IA</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(0, 153, 255, 0.22), transparent 32%),
        radial-gradient(circle at top right, rgba(122, 92, 255, 0.19), transparent 34%),
        linear-gradient(180deg, #050914 0%, #070b16 55%, #04070d 100%);
      color: #f8fbff;
    }
    a { color: inherit; text-decoration: none; }
    .layout { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
    .sidebar {
      position: sticky; top: 0; height: 100vh; padding: 26px 20px;
      background: rgba(255,255,255,0.045); border-right: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(18px); display: flex; flex-direction: column; gap: 24px;
    }
    .sidebar-brand { display: flex; align-items: center; gap: 12px; }
    .sidebar-logo {
      width: 46px; height: 46px; object-fit: contain; border-radius: 12px;
      background: rgba(255,255,255,0.96); padding: 7px; flex: 0 0 auto;
    }
    .sidebar-title { font-size: 22px; font-weight: 900; letter-spacing: -0.04em; }
    .sidebar-subtitle, .subtitle, .muted { color: #91a2bd; }
    .sidebar-subtitle { font-size: 12px; margin-top: 2px; }
    .side-nav { display: grid; gap: 8px; }
    .side-link {
      display: block;
      width: 100%; min-height: 44px; border-radius: 14px; padding: 12px 13px;
      background: transparent; border: 1px solid transparent; color: #aab8ce;
      font: inherit; font-weight: 850; text-align: left; cursor: pointer; transition: 0.16s ease;
    }
    .side-link:hover, .side-link.is-active {
      background: rgba(0, 153, 255, 0.13); border-color: rgba(0,153,255,0.24);
      color: #ffffff; box-shadow: 0 0 28px rgba(0,153,255,0.08);
    }
    .sidebar-footer { margin-top: auto; color: #73839d; font-size: 12px; line-height: 1.45; }
    .main { width: min(1380px, calc(100% - 68px)); margin: 0 auto; padding: 34px 0; min-width: 0; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
    h1 { margin: 0; font-size: 36px; letter-spacing: -0.06em; }
    h2, h3 { margin: 0; letter-spacing: -0.03em; }
    .subtitle { margin-top: 7px; font-size: 15px; max-width: 820px; line-height: 1.55; }
    .status-pill {
      padding: 10px 15px; border-radius: 999px; font-weight: 800; font-size: 13px;
      background: rgba(40, 255, 170, 0.12); border: 1px solid rgba(40, 255, 170, 0.24); color: #b8ffdc;
      white-space: nowrap;
    }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
    .kpi-card, .panel, .data-card {
      border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.055);
      border-radius: 18px; box-shadow: 0 20px 70px rgba(0,0,0,0.18);
    }
    .kpi-card { padding: 18px; }
    .kpi-label { color: #91a2bd; font-size: 12px; font-weight: 850; text-transform: uppercase; }
    .kpi-value { font-size: 30px; font-weight: 950; margin-top: 8px; letter-spacing: -0.05em; }
    .grid-2 { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(360px, 0.75fr); gap: 16px; }
    .panel { padding: 20px; margin-bottom: 16px; }
    .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
    .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .button, button {
      min-height: 40px; border-radius: 13px; padding: 10px 14px; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,153,255,0.14); color: #f8fbff; font: inherit; font-weight: 850; cursor: pointer;
    }
    .button.secondary, button.secondary { background: rgba(255,255,255,0.07); color: #d9e4f6; }
    .button.danger, button.danger { background: rgba(255, 76, 104, 0.16); border-color: rgba(255, 76, 104, 0.28); color: #ffd2da; }
    input, select, textarea {
      width: 100%; min-height: 42px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12);
      background: rgba(3,8,18,0.72); color: #f8fbff; padding: 10px 12px; font: inherit;
    }
    textarea { min-height: 90px; resize: vertical; }
    label { display: grid; gap: 7px; color: #c7d4ea; font-size: 13px; font-weight: 800; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .form-grid .full { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 10px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; vertical-align: top; }
    th { color: #91a2bd; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge { display: inline-flex; border-radius: 999px; padding: 5px 9px; background: rgba(255,255,255,0.08); color: #cfe2ff; font-size: 12px; font-weight: 850; }
    .badge.high, .badge.OPEN { background: rgba(255, 196, 87, 0.16); color: #ffe0a0; }
    .badge.WON { background: rgba(40, 255, 170, 0.12); color: #b8ffdc; }
    .badge.LOST { background: rgba(255, 76, 104, 0.16); color: #ffd2da; }
    .message-box { white-space: pre-wrap; color: #dce8fb; background: rgba(0,0,0,0.22); border-radius: 14px; padding: 13px; border: 1px solid rgba(255,255,255,0.08); }
    .dropzone { border: 1px dashed rgba(120,190,255,0.5); background: rgba(0,153,255,0.08); border-radius: 18px; padding: 26px; text-align: center; }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .sidebar { position: relative; height: auto; }
      .main { width: min(100% - 28px, 1380px); padding-top: 20px; }
      .kpi-grid, .grid-2, .form-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <img src="/cosmo-logo.svg" alt="Cosmo" class="sidebar-logo" />
        <div>
          <div class="sidebar-title">Phoenix CRM</div>
          <div class="sidebar-subtitle">Powered by Cosmo IA</div>
        </div>
      </div>
      <nav class="side-nav" aria-label="Navigation Phoenix">
        ${phoenixNav(params.active)}
        <a class="side-link" href="/">Retour Echo / Spectra</a>
      </nav>
      <div class="sidebar-footer">Archiviste, Détective, Stratège, Copywriter et Analyste travaillent sur les données importées.</div>
    </aside>
    <main class="main">
      <div class="topbar">
        <div>
          <h1>${escapeHtml(params.title)}</h1>
          <div class="subtitle">${escapeHtml(params.subtitle)}</div>
        </div>
        <div class="status-pill">Phoenix V1</div>
      </div>
      ${params.body}
    </main>
  </div>
  <script>
    async function copyPhoenixText(id, button) {
      const node = document.getElementById(id)
      if (!node) return
      await navigator.clipboard.writeText(node.innerText)
      const old = button.innerText
      button.innerText = "Copié"
      setTimeout(() => button.innerText = old, 1400)
    }
    document.querySelectorAll("[data-confirm]").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (!confirm(button.dataset.confirm)) event.preventDefault()
      })
    })
  </script>
</body>
</html>`
}

function renderPhoenixDashboardPage(snapshot: Awaited<ReturnType<typeof loadPhoenixDashboard>>) {
  const openOpportunities = snapshot.opportunities.filter((item) => item.status === "OPEN")
  return renderPhoenixShell({
    active: "/phoenix",
    title: "Phoenix CRM",
    subtitle: "CRM intelligent orienté revenus pour importer l’historique, repérer les revenus dormants et préparer les relances.",
    body: `
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Clients</div><div class="kpi-value">${snapshot.people.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Familles</div><div class="kpi-value">${snapshot.families.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Organisations</div><div class="kpi-value">${snapshot.organizations.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">Potentiel ouvert</div><div class="kpi-value">${formatCurrency(snapshot.totalPotential)}</div></div>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div><h2>Opportunités prioritaires</h2><div class="subtitle">Générées par les règles métier Phoenix.</div></div>
          <div class="actions">
            <form method="post" action="/phoenix/opportunities/generate"><button type="submit">Générer les opportunités</button></form>
            <a class="button secondary" href="/phoenix/import">Importer un Excel</a>
          </div>
        </div>
        ${renderOpportunitiesTable(openOpportunities.slice(0, 12))}
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header"><h2>Dernières prestations</h2><a class="button secondary" href="/phoenix/clients">Voir clients</a></div>
          ${renderBookingsTable(snapshot.bookings.slice(0, 10))}
        </div>
        <div class="panel">
          <div class="panel-header"><h2>Services Phoenix</h2><a class="button secondary" href="/phoenix/settings">Paramètres</a></div>
          <table><tbody>${snapshot.services.map((service) => `
            <tr><td>${escapeHtml(service.name)}</td><td><span class="badge">${escapeHtml(service.category)}</span></td><td>${formatCurrency(service.estimatedValue)}</td></tr>
          `).join("")}</tbody></table>
        </div>
      </div>
    `,
  })
}

function renderOpportunitiesTable(opportunities: Awaited<ReturnType<typeof loadPhoenixDashboard>>["opportunities"]) {
  if (!opportunities.length) return `<p class="muted">Aucune opportunité pour le moment. Lance une génération après un import.</p>`
  return `<table>
    <thead><tr><th>Opportunité</th><th>Cible</th><th>Service</th><th>Potentiel</th><th>Statut</th><th>Actions</th></tr></thead>
    <tbody>${opportunities.map((item) => {
      const target = item.organization?.name || item.family?.name || [item.person?.firstName, item.person?.lastName].filter(Boolean).join(" ") || "Client"
      const message = item.messages[0]
      const messageId = `message-${item.id}`
      return `<tr>
        <td><strong>${escapeHtml(item.title)}</strong><div class="muted">${escapeHtml(item.reason)}</div></td>
        <td>${escapeHtml(target)}</td>
        <td>${escapeHtml(item.service.name)}</td>
        <td>${formatCurrency(item.estimatedRevenue)}</td>
        <td><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td>
        <td>
          <div class="actions">
            <form method="post" action="/phoenix/opportunities/${item.id}/message"><input type="hidden" name="channel" value="email" /><button type="submit">E-mail</button></form>
            <form method="post" action="/phoenix/opportunities/${item.id}/message"><input type="hidden" name="channel" value="whatsapp" /><button class="secondary" type="submit">WhatsApp</button></form>
            <form method="post" action="/phoenix/opportunities/${item.id}/status"><input type="hidden" name="status" value="WON" /><button class="secondary" type="submit">Gagnée</button></form>
          </div>
          ${message ? `<div id="${messageId}" class="message-box">${escapeHtml(message.content)}</div><button class="secondary" type="button" onclick="copyPhoenixText('${messageId}', this)">Copier le message</button>` : ""}
        </td>
      </tr>`
    }).join("")}</tbody>
  </table>`
}

function renderBookingsTable(bookings: Awaited<ReturnType<typeof loadPhoenixDashboard>>["bookings"]) {
  if (!bookings.length) return `<p class="muted">Aucune prestation importée.</p>`
  return `<table>
    <thead><tr><th>Date</th><th>Service</th><th>Client</th><th>Montant</th></tr></thead>
    <tbody>${bookings.map((booking) => `
      <tr>
        <td>${formatDate(booking.bookingDate)}</td>
        <td>${escapeHtml(booking.service.name)}</td>
        <td>${escapeHtml(booking.organization?.name || [booking.child?.firstName, booking.child?.lastName].filter(Boolean).join(" ") || "Client")}</td>
        <td>${booking.amount ? formatCurrency(booking.amount) : "Non renseigné"}</td>
      </tr>
    `).join("")}</tbody>
  </table>`
}

function renderSessionsTable(sessions: any[], mode: "courses" | "stages" | "animations" | "agenda") {
  if (!sessions.length) return `<p class="muted">Aucune session pour le moment.</p>`
  return `<table>
    <thead><tr><th>Session</th><th>Date / horaire</th><th>Lieu / niveau</th><th>Inscriptions</th><th>Revenus</th></tr></thead>
    <tbody>${sessions.map((session) => {
      const registrations = session.registrations || []
      const payments = registrations.flatMap((registration: any) => registration.payments || [])
      const expected = payments.reduce((sum: number, payment: any) => sum + Number(payment.expectedAmount || 0), 0)
      const paid = payments.reduce((sum: number, payment: any) => sum + Number(payment.paidAmount || 0), 0)
      const sample = registrations.slice(0, mode === "agenda" ? 2 : 6).map((registration: any) => {
        return registration.organization?.name || [registration.child?.firstName, registration.child?.lastName].filter(Boolean).join(" ") || registration.family?.name || "Client"
      }).filter(Boolean)
      return `<tr>
        <td><strong>${escapeHtml(session.title)}</strong><br /><span class="muted">${escapeHtml(session.service?.name || "")}</span></td>
        <td>${formatDate(session.startAt)}<br /><span class="muted">${escapeHtml([session.dayOfWeek, session.timeLabel].filter(Boolean).join(" · "))}</span></td>
        <td>${escapeHtml([session.location, session.level, session.instructor].filter(Boolean).join(" · ") || "Non renseigné")}</td>
        <td><span class="badge">${registrations.length} inscrit(s)</span><br /><span class="muted">${escapeHtml(sample.join(", "))}</span></td>
        <td>${formatCurrency(expected)}<br /><span class="muted">Payé: ${formatCurrency(paid)}</span></td>
      </tr>`
    }).join("")}</tbody>
  </table>`
}

async function loadOperationalSessions(kind: string | string[]) {
  await ensurePhoenixOperationalData()
  const kinds = Array.isArray(kind) ? kind : [kind]
  return prisma.phoenixSession.findMany({
    where: { kind: { in: kinds } },
    orderBy: [{ startAt: "desc" }, { title: "asc" }],
    take: 160,
    include: {
      service: true,
      registrations: {
        include: {
          child: true,
          family: true,
          organization: true,
          payments: true,
        },
      },
    },
  })
}

function renderPhoenixImportPage() {
  return renderPhoenixShell({
    active: "/phoenix/import",
    title: "Import Excel",
    subtitle: "Archiviste lit le fichier, propose un mapping, nettoie les données et prépare l’import.",
    body: `
      <div class="panel">
        <form method="post" action="/phoenix/import/preview" enctype="multipart/form-data">
          <div class="form-grid">
            <label>Type d’import
              <select name="importType">${PHOENIX_IMPORT_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}</select>
            </label>
            <label>Fichier Excel
              <div class="dropzone">
                <input type="file" name="file" accept=".xlsx,.xls" required />
                <div class="muted">Glisse le fichier ici ou clique pour choisir un .xlsx/.xls.</div>
              </div>
            </label>
          </div>
          <div class="actions" style="margin-top:16px;"><button type="submit">Prévisualiser</button></div>
        </form>
      </div>
    `,
  })
}

function renderPhoenixImportPreviewPage(params: { batch: any; headers: string[]; rows: Record<string, string>[]; mapping: Record<string, string> }) {
  const fieldLabels: Record<string, string> = {
    childFirstName: "Prénom enfant",
    childLastName: "Nom enfant",
    childBirthDate: "Naissance enfant",
    parentFirstName: "Prénom parent/contact",
    parentLastName: "Nom parent/contact",
    email: "E-mail",
    phone: "Téléphone",
    address: "Adresse du client",
    magicLevel: "Niveau de magie",
    organizationName: "Organisation",
    service: "Service",
    bookingDate: "Date prestation",
    amount: "Montant",
    notes: "Notes",
  }

  return renderPhoenixShell({
    active: "/phoenix/import",
    title: "Prévisualisation import",
    subtitle: `${params.batch.filename} · ${params.batch.rowCount} lignes détectées`,
    body: `
      <div class="panel">
        <div class="panel-header"><h2>Mapping des colonnes</h2><span class="badge">${params.headers.length} colonnes détectées</span></div>
        <form method="post" action="/phoenix/import/${params.batch.id}/commit">
          <div class="form-grid">
            ${PHOENIX_FIELDS.map((field) => `
              <label>${escapeHtml(fieldLabels[field] || field)}
                <select name="${escapeHtml(field)}">
                  <option value="">Ignorer</option>
                  ${params.headers.map((header) => `<option value="${escapeHtml(header)}" ${params.mapping[field] === header ? "selected" : ""}>${escapeHtml(header)}</option>`).join("")}
                </select>
              </label>
            `).join("")}
          </div>
          <div class="actions" style="margin-top:16px;">
            <button type="submit">Importer et générer les opportunités</button>
            <a class="button secondary" href="/phoenix/import">Annuler</a>
          </div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div><h2>Aperçu des données</h2><div class="subtitle">Toutes les colonnes du fichier sont affichées. Fais défiler horizontalement si le tableau dépasse l’écran.</div></div>
          <span class="badge">${params.headers.length} colonnes</span>
        </div>
        <div style="overflow-x:auto; overflow-y:auto; max-height:560px; border:1px solid rgba(255,255,255,0.08); border-radius:14px;">
          <table style="min-width:${Math.max(params.headers.length * 150, 900)}px;">
            <thead><tr>${params.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
            <tbody>${params.rows.slice(0, 12).map((row) => `<tr>${params.headers.map((header) => `<td>${escapeHtml(row[header] || "")}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
    `,
  })
}

app.post("/tasks/:id/done", async (req, res) => {
  await prisma.task.update({
    where: {
      id: req.params.id,
    },
    data: {
      status: "DONE",
    },
  })

  res.redirect("/")
})

app.post("/tasks/:id/generate-reply", async (req, res) => {
  const humanProvidedInfo = String(req.body.humanProvidedInfo || "")

  await generateReplyForTaskWithHumanInfo(req.params.id, humanProvidedInfo)

  res.redirect("/")
})

app.post("/ignored-senders", async (req, res) => {
  const email = String(req.body.email || "")
  const reason = String(req.body.reason || "")

  await addIgnoredSender(email, reason)

  res.redirect("/")
})

app.post("/ignored-senders/:id/delete", async (req, res) => {
  await removeIgnoredSender(req.params.id)

  res.redirect("/")
})

app.post("/birthday-reservations/analyze", async (req, res) => {
  try {
    const files = Array.isArray(req.body.files)
      ? (req.body.files as UploadedReservationFile[])
      : []

    const analysis = await analyzeBirthdayReservation(files)

    res.json({
      success: true,
      analysis,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue"

    res.status(400).json({
      success: false,
      error: message,
    })
  }
})

app.post("/birthday-reservations/add-event", async (req, res) => {
  await addBirthdayReservationToCalendar({
    title: String(req.body.title || "Anniversaire magique"),
    summary: String(req.body.summary || ""),
    eventDate: String(req.body.eventDate || ""),
    startTime: String(req.body.startTime || ""),
    endTime: String(req.body.endTime || ""),
  })

  res.redirect("/#birthday-registration")
})

app.post("/market-analysis/run", async (_req, res) => {
  try {
    const requestedDomain = String(_req.body?.domain || "")
    const domain = requestedDomain ? requestedDomain.toUpperCase() : ""

    if (domain && !isMarketDomain(domain)) {
      return res.status(400).json({
        success: false,
        error: "Domaine de scan invalide",
      })
    }

    const summary = await runMarketAnalysis(domain ? domain : undefined)

    res.json({
      success: true,
      summary,
      targetView: domain ? marketDomainViews[domain] : "market-watch",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue"

    res.status(400).json({
      success: false,
      error: message,
    })
  }
})

app.get("/phoenix", async (_req, res) => {
  const snapshot = await loadPhoenixDashboard()
  res.send(renderPhoenixDashboardPage(snapshot))
})

app.get("/phoenix/courses", async (_req, res) => {
  const sessions = await loadOperationalSessions("COURSE")
  res.send(renderPhoenixShell({
    active: "/phoenix/courses",
    title: "Cours collectifs",
    subtitle: "Groupes par jour, horaire, niveau et prof, générés depuis les inscriptions et prêts pour la saisie future.",
    body: `<div class="panel"><div class="panel-header"><h2>Groupes de cours</h2><a class="button" href="/phoenix/registrations/new?kind=COURSE">Ajouter une inscription</a></div>${renderSessionsTable(sessions, "courses")}</div>`,
  }))
})

app.get("/phoenix/stages", async (_req, res) => {
  const sessions = await loadOperationalSessions(["STAGE", "ESCAPE"])
  res.send(renderPhoenixShell({
    active: "/phoenix/stages",
    title: "Stages & événements",
    subtitle: "Participants, prix, soldes et historique des stages/événements.",
    body: `<div class="panel"><div class="panel-header"><h2>Sessions stages & événements</h2><a class="button" href="/phoenix/registrations/new?kind=STAGE">Inscrire un participant</a></div>${renderSessionsTable(sessions, "stages")}</div>`,
  }))
})

app.get("/phoenix/animations", async (_req, res) => {
  const sessions = await loadOperationalSessions(["ANIMATION", "BIRTHDAY"])
  res.send(renderPhoenixShell({
    active: "/phoenix/animations",
    title: "Animations externes",
    subtitle: "Animations entreprises, institutions et anniversaires à domicile avec revenu prévu et intervenants.",
    body: `<div class="panel"><div class="panel-header"><h2>Animations</h2><a class="button" href="/phoenix/registrations/new?kind=ANIMATION">Créer une animation</a></div>${renderSessionsTable(sessions, "animations")}</div>`,
  }))
})

app.get("/phoenix/agenda", async (_req, res) => {
  await ensurePhoenixOperationalData()
  const sessions = await prisma.phoenixSession.findMany({
    orderBy: [{ startAt: "desc" }, { title: "asc" }],
    take: 220,
    include: { service: true, registrations: { include: { child: true, family: true, organization: true, payments: true } } },
  })
  res.send(renderPhoenixShell({
    active: "/phoenix/agenda",
    title: "Agenda Phoenix",
    subtitle: "Vue unique de toutes les sessions : cours, stages, anniversaires, animations et escape games.",
    body: `<div class="panel"><div class="panel-header"><h2>Agenda opérationnel</h2><a class="button" href="/phoenix/registrations/new">Nouvelle inscription</a></div>${renderSessionsTable(sessions, "agenda")}</div>`,
  }))
})

app.get("/phoenix/registrations/new", async (req, res) => {
  await ensurePhoenixOperationalData()
  const [services, sessions, children, parents, families, organizations] = await Promise.all([
    prisma.phoenixService.findMany({ orderBy: { name: "asc" } }),
    prisma.phoenixSession.findMany({ orderBy: [{ startAt: "desc" }, { title: "asc" }], take: 200 }),
    prisma.phoenixPerson.findMany({ where: { type: "CHILD" }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500 }),
    prisma.phoenixPerson.findMany({ where: { type: { in: ["PARENT", "CONTACT"] } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 500 }),
    prisma.phoenixFamily.findMany({ orderBy: { name: "asc" }, take: 500 }),
    prisma.phoenixOrganization.findMany({ orderBy: { name: "asc" }, take: 500 }),
  ])
  const requestedKind = String(req.query.kind || "COURSE")
  res.send(renderPhoenixShell({
    active: "/phoenix/registrations/new",
    title: "Nouvelle inscription",
    subtitle: "Formulaire unique pour cours, stage, anniversaire, animation externe ou escape game.",
    body: `
      <div class="grid-2">
        <div class="panel">
          <div class="panel-header"><h2>Créer une session</h2></div>
          <form method="post" action="/phoenix/sessions">
            <div class="form-grid">
              <label>Type<select name="kind">${["COURSE", "STAGE", "BIRTHDAY", "ANIMATION", "ESCAPE"].map((kind) => `<option value="${kind}" ${kind === requestedKind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>
              <label>Service<select name="serviceId">${services.map((service) => `<option value="${service.id}">${escapeHtml(service.name)}</option>`).join("")}</select></label>
              <label class="full">Titre<input name="title" required /></label>
              <label>Date<input type="date" name="startAt" /></label>
              <label>Horaire<input name="timeLabel" placeholder="17h30 - 18h30" /></label>
              <label>Lieu<input name="location" /></label>
              <label>Niveau<input name="level" /></label>
              <label>Capacité<input type="number" name="capacity" /></label>
              <label>Prix<input type="number" step="0.01" name="price" /></label>
              <label>Intervenant<input name="instructor" /></label>
              <label class="full">Notes<textarea name="notes"></textarea></label>
            </div>
            <div class="actions" style="margin-top:16px;"><button type="submit">Créer la session</button></div>
          </form>
        </div>
        <div class="panel">
          <div class="panel-header"><h2>Inscrire / réserver</h2></div>
          <form method="post" action="/phoenix/registrations">
            <div class="form-grid">
              <label class="full">Session<select name="sessionId">${sessions.map((session) => `<option value="${session.id}">${escapeHtml([formatDate(session.startAt), session.title].join(" · "))}</option>`).join("")}</select></label>
              <label>Enfant<select name="childId"><option value="">Aucun</option>${children.map((person) => `<option value="${person.id}">${escapeHtml([person.firstName, person.lastName].filter(Boolean).join(" "))}</option>`).join("")}</select></label>
              <label>Parent/contact<select name="parentId"><option value="">Aucun</option>${parents.map((person) => `<option value="${person.id}">${escapeHtml([person.firstName, person.lastName, person.email].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>
              <label>Famille<select name="familyId"><option value="">Aucune</option>${families.map((family) => `<option value="${family.id}">${escapeHtml(family.name)}</option>`).join("")}</select></label>
              <label>Organisation<select name="organizationId"><option value="">Aucune</option>${organizations.map((organization) => `<option value="${organization.id}">${escapeHtml(organization.name)}</option>`).join("")}</select></label>
              <label>Montant prévu<input type="number" step="0.01" name="expectedAmount" /></label>
              <label>Montant payé<input type="number" step="0.01" name="paidAmount" /></label>
              <label>Statut paiement<select name="paymentStatus"><option value="DUE">À payer</option><option value="PARTIAL">Partiel</option><option value="PAID">Payé</option><option value="UNKNOWN">Inconnu</option></select></label>
              <label class="full">Notes<textarea name="notes"></textarea></label>
            </div>
            <div class="actions" style="margin-top:16px;"><button type="submit">Créer l’inscription</button></div>
          </form>
        </div>
      </div>
    `,
  }))
})

app.get("/phoenix/import", (_req, res) => {
  res.send(renderPhoenixImportPage())
})

app.post("/phoenix/import/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Aucun fichier Excel reçu.")
    const preview = await createImportPreview({
      filename: req.file.originalname,
      importType: String(req.body.importType || "générique"),
      buffer: req.file.buffer,
    })
    res.send(renderPhoenixImportPreviewPage(preview))
  } catch (error) {
    res.status(400).send(renderPhoenixShell({
      active: "/phoenix/import",
      title: "Import impossible",
      subtitle: error instanceof Error ? error.message : "Erreur inconnue",
      body: `<a class="button" href="/phoenix/import">Revenir à l’import</a>`,
    }))
  }
})

app.post("/phoenix/import/:id/commit", async (req, res) => {
  const mapping = Object.fromEntries(PHOENIX_FIELDS.map((field) => [field, String(req.body[field] || "")]).filter(([, value]) => value))
  await commitImport(req.params.id, mapping)
  await ensurePhoenixOperationalData()
  res.redirect("/phoenix/opportunities")
})

app.post("/phoenix/sessions", async (req, res) => {
  const service = await prisma.phoenixService.findUnique({ where: { id: String(req.body.serviceId) } })
  if (!service) return res.redirect("/phoenix/registrations/new")
  const activity = await prisma.phoenixActivity.upsert({
    where: { serviceId_name: { serviceId: service.id, name: service.name } },
    create: { serviceId: service.id, name: service.name, type: String(req.body.kind || "COURSE"), defaultPrice: service.estimatedValue },
    update: {},
  })
  await prisma.phoenixSession.create({
    data: {
      activityId: activity.id,
      serviceId: service.id,
      title: String(req.body.title || service.name),
      kind: String(req.body.kind || "COURSE"),
      startAt: req.body.startAt ? new Date(String(req.body.startAt)) : undefined,
      timeLabel: String(req.body.timeLabel || "") || null,
      location: String(req.body.location || "") || null,
      level: String(req.body.level || "") || null,
      capacity: req.body.capacity ? Number(req.body.capacity) : null,
      price: req.body.price ? Number(req.body.price) : service.estimatedValue,
      instructor: String(req.body.instructor || "") || null,
      sourceType: "manual",
      sourceLabel: String(req.body.title || service.name),
      notes: String(req.body.notes || "") || null,
    },
  })
  res.redirect("/phoenix/agenda")
})

app.post("/phoenix/registrations", async (req, res) => {
  const expectedAmount = Number(req.body.expectedAmount || 0)
  const paidAmount = Number(req.body.paidAmount || 0)
  const registration = await prisma.phoenixRegistration.create({
    data: {
      sessionId: String(req.body.sessionId),
      childId: String(req.body.childId || "") || undefined,
      parentId: String(req.body.parentId || "") || undefined,
      familyId: String(req.body.familyId || "") || undefined,
      organizationId: String(req.body.organizationId || "") || undefined,
      sourceType: "manual",
      notes: String(req.body.notes || "") || null,
    },
  })
  await prisma.phoenixPayment.create({
    data: {
      registrationId: registration.id,
      expectedAmount,
      paidAmount,
      balanceAmount: Math.max(expectedAmount - paidAmount, 0),
      status: String(req.body.paymentStatus || (paidAmount >= expectedAmount && expectedAmount > 0 ? "PAID" : "DUE")),
      notes: String(req.body.notes || "") || null,
    },
  })
  res.redirect("/phoenix/agenda")
})

app.post("/phoenix/opportunities/generate", async (_req, res) => {
  await generateOpportunities()
  res.redirect("/phoenix/opportunities")
})

app.get("/phoenix/opportunities", async (_req, res) => {
  const snapshot = await loadPhoenixDashboard()
  res.send(renderPhoenixShell({
    active: "/phoenix/opportunities",
    title: "Opportunités commerciales",
    subtitle: "Stratège et Analyste repèrent les revenus dormants et estiment le potentiel commercial.",
    body: `<div class="panel"><div class="panel-header"><h2>Opportunités</h2><form method="post" action="/phoenix/opportunities/generate"><button type="submit">Regénérer</button></form></div>${renderOpportunitiesTable(snapshot.opportunities)}</div>`,
  }))
})

app.post("/phoenix/opportunities/:id/message", async (req, res) => {
  await generateOpportunityMessage(req.params.id, String(req.body.channel || "email"))
  redirectBack(res, "/phoenix/opportunities", req)
})

app.post("/phoenix/opportunities/:id/status", async (req, res) => {
  await updateOpportunityStatus(req.params.id, String(req.body.status || "OPEN"))
  redirectBack(res, "/phoenix/opportunities", req)
})

app.post("/phoenix/opportunities/:id/delete", async (req, res) => {
  await prisma.phoenixOpportunity.delete({ where: { id: req.params.id } })
  redirectBack(res, "/phoenix/opportunities", req)
})

app.get("/phoenix/clients", async (req, res) => {
  const search = String(req.query.q || "").trim()
  const people = await prisma.phoenixPerson.findMany({
    where: search ? {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { stageName: { contains: search, mode: "insensitive" } },
        { magicLevel: { contains: search, mode: "insensitive" } },
        { parentFirstName: { contains: search, mode: "insensitive" } },
        { parentLastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ],
    } : undefined,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { family: true, organization: true },
  })
  res.send(renderPhoenixShell({
    active: "/phoenix/clients",
    title: "Clients privés",
    subtitle: "Familles, parents, enfants et contacts privés ajoutés manuellement.",
    body: `
      <div class="panel">
        <div class="panel-header"><h2>Ajouter une personne</h2></div>
        <form method="post" action="/phoenix/people">
          <div class="form-grid">
            <label>Nom<input name="lastName" /></label>
            <label>Prénom<input name="firstName" /></label>
            <label>Nom de scène<input name="stageName" /></label>
            <label>Niveau de magie<input name="magicLevel" placeholder="Débutant, intermédiaire..." /></label>
            <label>Date d'entrée<input type="date" name="entryDate" /></label>
            <label>Date de naissance<input type="date" name="birthDate" /></label>
            <label>Nom parent<input name="parentLastName" /></label>
            <label>Prénom parent<input name="parentFirstName" /></label>
            <label class="full">Adresse<input name="address" /></label>
            <label>Téléphone<input name="phone" /></label>
            <label>E-mail<input name="email" type="email" /></label>
          </div>
          <div class="actions" style="margin-top:16px;"><button type="submit">Ajouter</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="panel-header">
          <div><h2>Liste clients privés</h2><div class="subtitle">${people.length} résultat(s)</div></div>
          <form method="get" action="/phoenix/clients" class="actions">
            <input name="q" value="${escapeHtml(search)}" placeholder="Rechercher nom, parent, email, téléphone..." />
            <button type="submit">Rechercher</button>
            <a class="button secondary" href="/phoenix/clients">Effacer</a>
          </form>
        </div>
        <div style="overflow-x:auto;">
        <table style="min-width:1500px;"><thead><tr><th>Nom</th><th>Prénom</th><th>Nom de scène</th><th>Niveau</th><th>Date d'entrée</th><th>Date naissance</th><th>Nom parent</th><th>Prénom parent</th><th>Adresse</th><th>Téléphone</th><th>E-mail</th><th>Modifier</th></tr></thead><tbody>
          ${people.map((person) => `<tr>
            <td>${escapeHtml(person.lastName || "")}</td>
            <td>${escapeHtml(person.firstName || "")}</td>
            <td>${escapeHtml(person.stageName || "")}</td>
            <td>${escapeHtml(person.magicLevel || "")}</td>
            <td>${formatDate(person.entryDate)}</td>
            <td>${formatDate(person.birthDate)}</td>
            <td>${escapeHtml(person.parentLastName || "")}</td>
            <td>${escapeHtml(person.parentFirstName || "")}</td>
            <td>${escapeHtml(person.address || "")}</td>
            <td>${escapeHtml(person.phone || "")}</td>
            <td>${escapeHtml(person.email || "")}</td>
            <td>
              <form method="post" action="/phoenix/people/${person.id}" class="form-grid">
                <input name="lastName" value="${escapeHtml(person.lastName || "")}" />
                <input name="firstName" value="${escapeHtml(person.firstName || "")}" />
                <input name="stageName" value="${escapeHtml(person.stageName || "")}" />
                <input name="magicLevel" value="${escapeHtml(person.magicLevel || "")}" />
                <input type="date" name="entryDate" value="${formatDateInput(person.entryDate)}" />
                <input type="date" name="birthDate" value="${formatDateInput(person.birthDate)}" />
                <input name="parentLastName" value="${escapeHtml(person.parentLastName || "")}" />
                <input name="parentFirstName" value="${escapeHtml(person.parentFirstName || "")}" />
                <input class="full" name="address" value="${escapeHtml(person.address || "")}" />
                <input name="phone" value="${escapeHtml(person.phone || "")}" />
                <input name="email" value="${escapeHtml(person.email || "")}" />
                <button class="full" type="submit">Enregistrer</button>
              </form>
              <form method="post" action="/phoenix/people/${person.id}/delete"><button class="danger" data-confirm="Supprimer cette personne ?" type="submit">Supprimer</button></form>
            </td>
          </tr>`).join("")}
        </tbody></table>
        </div>
      </div>
    `,
  }))
})

app.get("/phoenix/children", async (_req, res) => {
  const children = await prisma.phoenixPerson.findMany({
    where: { type: "CHILD" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { family: true, childBookings: { include: { service: true }, orderBy: { bookingDate: "desc" } } },
  })
  res.send(renderPhoenixShell({
    active: "/phoenix/children",
    title: "Enfants",
    subtitle: "Vue centrée sur le parcours idéal : cours, stages, anniversaire et escape games.",
    body: `<div class="panel"><table><thead><tr><th>Enfant</th><th>Famille</th><th>Historique</th></tr></thead><tbody>${children.map((child) => `
      <tr><td><strong>${escapeHtml([child.firstName, child.lastName].filter(Boolean).join(" ") || "Sans nom")}</strong><br /><span class="muted">${formatDate(child.birthDate)}${child.magicLevel ? " · Niveau: " + escapeHtml(child.magicLevel) : ""}</span></td><td>${escapeHtml(child.family?.name || "")}<br /><span class="muted">${escapeHtml(child.address || child.family?.address || "")}</span></td><td>${child.childBookings.map((booking) => `<span class="badge">${escapeHtml(booking.service.name)}</span>`).join(" ") || "Aucune prestation"}</td></tr>
    `).join("")}</tbody></table></div>`,
  }))
})

app.post("/phoenix/people", async (req, res) => {
  await createManualPerson({
    type: "CHILD",
    firstName: String(req.body.firstName || ""),
    lastName: String(req.body.lastName || ""),
    stageName: String(req.body.stageName || ""),
    email: String(req.body.email || ""),
    phone: String(req.body.phone || ""),
    address: String(req.body.address || ""),
    magicLevel: String(req.body.magicLevel || ""),
    entryDate: parseDashboardDate(req.body.entryDate),
    birthDate: parseDashboardDate(req.body.birthDate),
    parentFirstName: String(req.body.parentFirstName || ""),
    parentLastName: String(req.body.parentLastName || ""),
  })
  res.redirect("/phoenix/clients")
})

app.post("/phoenix/people/:id", async (req, res) => {
  await prisma.phoenixPerson.update({
    where: { id: req.params.id },
    data: {
      firstName: String(req.body.firstName || "") || null,
      lastName: String(req.body.lastName || "") || null,
      stageName: String(req.body.stageName || "") || null,
      email: normalizeDashboardEmail(req.body.email),
      phone: normalizeDashboardPhone(req.body.phone),
      address: String(req.body.address || "") || null,
      magicLevel: String(req.body.magicLevel || "") || null,
      entryDate: parseDashboardDate(req.body.entryDate),
      birthDate: parseDashboardDate(req.body.birthDate),
      parentFirstName: String(req.body.parentFirstName || "") || null,
      parentLastName: String(req.body.parentLastName || "") || null,
      normalizedEmail: normalizeDashboardEmail(req.body.email),
      normalizedPhone: normalizeDashboardPhone(req.body.phone),
    },
  })
  redirectBack(res, "/phoenix/clients", req)
})

app.post("/phoenix/people/:id/delete", async (req, res) => {
  await prisma.phoenixPerson.delete({ where: { id: req.params.id } })
  redirectBack(res, "/phoenix/clients", req)
})

app.get("/phoenix/families", async (_req, res) => {
  const families = await prisma.phoenixFamily.findMany({
    orderBy: { name: "asc" },
    include: { people: true, bookings: { include: { service: true } }, opportunities: true },
  })
  res.send(renderPhoenixShell({
    active: "/phoenix/families",
    title: "Familles",
    subtitle: "Détective regroupe les personnes par e-mail, téléphone et nom de famille.",
    body: `<div class="panel"><table><thead><tr><th>Famille</th><th>Membres</th><th>Prestations</th><th>Potentiel</th></tr></thead><tbody>${families.map((family) => `
      <tr><td><strong>${escapeHtml(family.name)}</strong><br /><span class="muted">${escapeHtml([family.email, family.phone, family.address].filter(Boolean).join(" · "))}</span></td><td>${family.people.map((person) => escapeHtml([person.firstName, person.lastName, person.magicLevel ? `(${person.magicLevel})` : ""].filter(Boolean).join(" ") || person.type)).join("<br />")}</td><td>${family.bookings.map((booking) => `<span class="badge">${escapeHtml(booking.service.name)}</span>`).join(" ")}</td><td>${formatCurrency(family.opportunities.filter((item) => item.status === "OPEN").reduce((sum, item) => sum + item.estimatedRevenue, 0))}</td></tr>
    `).join("")}</tbody></table></div>`,
  }))
})

app.get("/phoenix/organizations", async (_req, res) => {
  const organizations = await prisma.phoenixOrganization.findMany({
    orderBy: { name: "asc" },
    include: { bookings: { include: { service: true } }, opportunities: true },
  })
  res.send(renderPhoenixShell({
    active: "/phoenix/organizations",
    title: "Organisations",
    subtitle: "Institutions et entreprises à relancer pour animations, team building, Noël, spectacle ou événement annuel.",
    body: `
      <div class="panel">
        <div class="panel-header"><h2>Ajouter une organisation</h2></div>
        <form method="post" action="/phoenix/organizations">
          <div class="form-grid">
            <label>Nom<input name="name" required /></label>
            <label>Type<input name="type" placeholder="Entreprise, école, institution..." /></label>
            <label>E-mail<input name="email" type="email" /></label>
            <label>Téléphone<input name="phone" /></label>
            <label class="full">Adresse<input name="address" /></label>
            <label>Site web<input name="website" /></label>
            <label class="full">Notes<textarea name="notes"></textarea></label>
          </div>
          <div class="actions" style="margin-top:16px;"><button type="submit">Ajouter</button></div>
        </form>
      </div>
      <div class="panel"><table><thead><tr><th>Organisation</th><th>Historique</th><th>Potentiel</th><th>Modifier</th></tr></thead><tbody>${organizations.map((organization) => `
        <tr>
          <td><strong>${escapeHtml(organization.name)}</strong><br /><span class="muted">${escapeHtml([organization.type, organization.email, organization.phone, organization.address].filter(Boolean).join(" · "))}</span></td>
          <td>${organization.bookings.map((booking) => `<span class="badge">${escapeHtml(booking.service.name)}</span>`).join(" ") || "Aucun historique"}</td>
          <td>${formatCurrency(organization.opportunities.filter((item) => item.status === "OPEN").reduce((sum, item) => sum + item.estimatedRevenue, 0))}</td>
          <td>
            <form method="post" action="/phoenix/organizations/${organization.id}" class="form-grid">
              <input name="name" value="${escapeHtml(organization.name)}" />
              <input name="type" value="${escapeHtml(organization.type || "")}" />
              <input name="email" value="${escapeHtml(organization.email || "")}" />
              <input name="phone" value="${escapeHtml(organization.phone || "")}" />
              <input class="full" name="address" value="${escapeHtml(organization.address || "")}" />
              <input class="full" name="website" value="${escapeHtml(organization.website || "")}" />
              <textarea class="full" name="notes">${escapeHtml(organization.notes || "")}</textarea>
              <button class="full" type="submit">Enregistrer</button>
            </form>
            <form method="post" action="/phoenix/organizations/${organization.id}/delete"><button class="danger" data-confirm="Supprimer cette organisation ?" type="submit">Supprimer</button></form>
          </td>
        </tr>`).join("")}</tbody></table></div>
    `,
  }))
})

app.post("/phoenix/organizations", async (req, res) => {
  await createManualOrganization({
    name: String(req.body.name || ""),
    email: String(req.body.email || ""),
    phone: String(req.body.phone || ""),
    address: String(req.body.address || ""),
    website: String(req.body.website || ""),
    type: String(req.body.type || ""),
    notes: String(req.body.notes || ""),
  })
  res.redirect("/phoenix/organizations")
})

app.post("/phoenix/organizations/:id", async (req, res) => {
  await prisma.phoenixOrganization.update({
    where: { id: req.params.id },
    data: {
      name: String(req.body.name || ""),
      type: String(req.body.type || "") || null,
      email: normalizeDashboardEmail(req.body.email),
      phone: normalizeDashboardPhone(req.body.phone),
      address: String(req.body.address || "") || null,
      website: String(req.body.website || "") || null,
      notes: String(req.body.notes || "") || null,
    },
  })
  redirectBack(res, "/phoenix/organizations", req)
})

app.post("/phoenix/organizations/:id/delete", async (req, res) => {
  await prisma.phoenixOrganization.delete({ where: { id: req.params.id } })
  redirectBack(res, "/phoenix/organizations", req)
})

app.get("/phoenix/settings", async (_req, res) => {
  await ensurePhoenixServices()
  const services = await prisma.phoenixService.findMany({ orderBy: { name: "asc" } })
  res.send(renderPhoenixShell({
    active: "/phoenix/settings",
    title: "Paramètres Phoenix",
    subtitle: "Modifier les services, valeurs estimées et règles économiques de base.",
    body: `<div class="panel"><table><thead><tr><th>Service</th><th>Catégorie</th><th>Valeur estimée</th><th>Actif</th><th></th></tr></thead><tbody>${services.map((service) => `
      <tr>
        <td><form id="service-${service.id}" method="post" action="/phoenix/services/${service.id}"></form><input form="service-${service.id}" name="name" value="${escapeHtml(service.name)}" /></td>
        <td><input form="service-${service.id}" name="category" value="${escapeHtml(service.category)}" /></td>
        <td><input form="service-${service.id}" name="estimatedValue" type="number" step="1" value="${service.estimatedValue}" /></td>
        <td><select form="service-${service.id}" name="active"><option value="true" ${service.active ? "selected" : ""}>Oui</option><option value="false" ${!service.active ? "selected" : ""}>Non</option></select></td>
        <td><button form="service-${service.id}" type="submit">Enregistrer</button></td>
      </tr>
    `).join("")}</tbody></table></div>`,
  }))
})

app.post("/phoenix/services/:id", async (req, res) => {
  await prisma.phoenixService.update({
    where: { id: req.params.id },
    data: {
      name: String(req.body.name || ""),
      category: String(req.body.category || ""),
      estimatedValue: Number(req.body.estimatedValue || 0),
      active: String(req.body.active) === "true",
    },
  })
  redirectBack(res, "/phoenix/settings", req)
})

app.get("/", async (_req, res) => {
  const tasks = await prisma.task.findMany({
    where: {
      status: "TODO",
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "desc" },
    ],
    take: 50,
    include: {
      customer: true,
    },
  })
  const ignoredSenders = await listIgnoredSenders()
  const marketSnapshot = await loadMarketDashboardSnapshot()
  const marketResults = {
    ANNIVERSAIRE: await loadMarketDomainResults("ANNIVERSAIRE"),
    STAGE: await loadMarketDomainResults("STAGE"),
    COURS: await loadMarketDomainResults("COURS"),
  }

  const totalTasks = tasks.length
  const highTasks = tasks.filter((task) => task.priority === "HIGH").length
  const quoteTasks = tasks.filter((task) => task.taskType === "QUOTE_REQUEST").length
  const birthdayTasks = tasks.filter((task) => task.taskType === "BIRTHDAY_REQUEST").length

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cosmo IA — Dashboard</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(0, 153, 255, 0.22), transparent 32%),
        radial-gradient(circle at top right, rgba(90, 80, 255, 0.18), transparent 34%),
        linear-gradient(180deg, #050914 0%, #070b16 55%, #04070d 100%);
      color: #f8fbff;
    }

    .layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 26px 20px;
      background: rgba(255,255,255,0.045);
      border-right: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(18px);
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-logo {
      width: 46px;
      height: 46px;
      object-fit: contain;
      border-radius: 12px;
      background: rgba(255,255,255,0.96);
      padding: 7px;
      flex: 0 0 auto;
    }

    .sidebar-title {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    .sidebar-subtitle {
      color: #91a2bd;
      font-size: 12px;
      margin-top: 2px;
    }

    .side-nav {
      display: grid;
      gap: 8px;
    }

    .side-link {
      display: block;
      width: 100%;
      min-height: 44px;
      border-radius: 14px;
      padding: 12px 13px;
      background: transparent;
      border: 1px solid transparent;
      color: #aab8ce;
      font: inherit;
      font-weight: 850;
      text-align: left;
      cursor: pointer;
      transition: 0.16s ease;
    }

    .side-link:hover,
    .side-link.is-active {
      background: rgba(0, 153, 255, 0.13);
      border-color: rgba(0,153,255,0.24);
      color: #ffffff;
      box-shadow: 0 0 28px rgba(0,153,255,0.08);
    }

    .sidebar-footer {
      margin-top: auto;
      color: #73839d;
      font-size: 12px;
      line-height: 1.45;
    }

    .main {
      width: min(1380px, calc(100% - 68px));
      margin: 0 auto;
      padding: 34px 0;
      min-width: 0;
    }

    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 28px;
    }

    .brand-heading {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .cosmo-logo {
      width: 54px;
      height: 54px;
      object-fit: contain;
      border-radius: 14px;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(255,255,255,0.2);
      padding: 8px;
      flex: 0 0 auto;
    }

    h1 {
      margin: 0;
      font-size: 36px;
      letter-spacing: -0.06em;
    }

    .subtitle {
      color: #91a2bd;
      margin-top: 7px;
      font-size: 15px;
    }

    .status-pill {
      padding: 10px 15px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
      background: rgba(40, 255, 170, 0.12);
      color: #64ffc9;
      border: 1px solid rgba(40,255,170,0.25);
      white-space: nowrap;
      box-shadow: 0 0 28px rgba(40,255,170,0.08);
    }

    .app-section {
      display: none;
    }

    .app-section.is-active {
      display: block;
    }

    .hero {
      display: grid;
      grid-template-columns: 210px 1fr 330px;
      gap: 30px;
      align-items: center;
      padding: 30px;
      border-radius: 30px;
      background:
        linear-gradient(135deg, rgba(255,255,255,0.095), rgba(255,255,255,0.035)),
        radial-gradient(circle at left, rgba(0,153,255,0.16), transparent 38%);
      border: 1px solid rgba(255,255,255,0.11);
      box-shadow: 0 28px 90px rgba(0,0,0,0.38);
      overflow: hidden;
      position: relative;
      margin-bottom: 28px;
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(120deg, transparent, rgba(255,255,255,0.045), transparent);
      pointer-events: none;
    }

    .echo-img {
      width: 190px;
      height: 190px;
      object-fit: cover;
      border-radius: 50%;
      border: 1px solid rgba(80, 185, 255, 0.55);
      box-shadow:
        0 0 60px rgba(0, 153, 255, 0.55),
        inset 0 0 30px rgba(255,255,255,0.05);
      background: #081120;
    }

    .spectra-img {
      width: 190px;
      height: 190px;
      object-fit: contain;
      border-radius: 50%;
      border: 1px solid rgba(80, 185, 255, 0.55);
      box-shadow:
        0 0 60px rgba(0, 153, 255, 0.55),
        inset 0 0 30px rgba(255,255,255,0.05);
      background: #081120;
      padding: 18px;
    }

    .hero h2 {
      font-size: 46px;
      margin: 0;
      letter-spacing: -0.07em;
    }

    .hero-sub {
      color: #70caff;
      font-weight: 900;
      margin-top: 5px;
      text-transform: uppercase;
      font-size: 13px;
      letter-spacing: 0.18em;
    }

    .tagline {
      font-size: 23px;
      color: #e1ecff;
      margin-top: 20px;
      font-weight: 700;
    }

    .hero-text {
      color: #99a9c0;
      max-width: 620px;
      line-height: 1.55;
      margin-top: 12px;
    }

    .stats {
      display: grid;
      gap: 12px;
      position: relative;
      z-index: 1;
    }

    .stat {
      padding: 17px;
      border-radius: 20px;
      background: rgba(0,0,0,0.24);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .stat strong {
      display: block;
      font-size: 27px;
      letter-spacing: -0.04em;
    }

    .stat span {
      color: #91a2bd;
      font-size: 13px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 28px;
    }

    .kpi {
      padding: 20px;
      border-radius: 22px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 18px 50px rgba(0,0,0,0.22);
    }

    .kpi-label {
      color: #91a2bd;
      font-size: 13px;
      font-weight: 700;
    }

    .kpi-value {
      font-size: 30px;
      font-weight: 900;
      margin-top: 8px;
      letter-spacing: -0.05em;
    }

    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 8px 0 16px;
    }

    .section-title h2 {
      margin: 0;
      font-size: 21px;
      letter-spacing: -0.04em;
    }

    .section-title span {
      color: #91a2bd;
      font-size: 14px;
    }

    .settings-panel {
      padding: 20px;
      border-radius: 22px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 18px 50px rgba(0,0,0,0.22);
      margin-bottom: 28px;
    }

    .birthday-workflow {
      display: grid;
      gap: 16px;
    }

    .upload-zone {
      padding: 20px;
      border-radius: 18px;
      background: rgba(0,0,0,0.2);
      border: 1px dashed rgba(125, 204, 255, 0.45);
      cursor: pointer;
      transition: 0.16s ease;
    }

    .upload-zone:hover,
    .upload-zone.is-dragging {
      border-color: rgba(125, 204, 255, 0.9);
      background: rgba(0, 153, 255, 0.1);
      box-shadow: 0 0 26px rgba(0, 153, 255, 0.12);
    }

    .file-input {
      display: none;
    }

    .file-list {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }

    .file-pill {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 11px;
      border-radius: 12px;
      background: rgba(255,255,255,0.075);
      border: 1px solid rgba(255,255,255,0.09);
      color: #dce7f7;
      font-size: 13px;
    }

    .editable-note {
      color: #70caff;
      font-size: 13px;
      font-weight: 800;
    }

    .birthday-result {
      display: none;
      gap: 12px;
      margin-top: 10px;
    }

    .birthday-result.is-visible {
      display: grid;
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr repeat(3, minmax(120px, 170px));
      gap: 10px;
      align-items: end;
    }

    .field-label {
      display: grid;
      gap: 7px;
      color: #91a2bd;
      font-size: 13px;
      font-weight: 800;
    }

    .summary-editor {
      width: 100%;
      min-height: 220px;
      border-radius: 15px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.24);
      color: #eef5ff;
      padding: 15px;
      font: inherit;
      line-height: 1.55;
      resize: vertical;
      outline: none;
    }

    .confirmation-editor {
      min-height: 520px;
      white-space: pre-wrap;
      overflow: auto;
    }

    .field-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }

    .confirmation-assets {
      display: grid;
      grid-template-columns: minmax(0, 420px);
      gap: 12px;
      margin-top: 4px;
    }

    .confirmation-asset {
      overflow: hidden;
      border-radius: 15px;
      background: rgba(0,0,0,0.22);
      border: 1px solid rgba(255,255,255,0.09);
    }

    .confirmation-asset img {
      display: block;
      width: 100%;
      height: 132px;
      object-fit: cover;
    }

    .confirmation-asset span {
      display: block;
      padding: 9px 10px;
      color: #c4d0e4;
      font-size: 12px;
      font-weight: 800;
    }

    .warning-list {
      display: none;
      color: #ffd28a;
      background: rgba(255, 190, 70, 0.12);
      border: 1px solid rgba(255,190,70,0.22);
      border-radius: 14px;
      padding: 12px;
      white-space: pre-wrap;
      font-size: 14px;
    }

    .warning-list.is-visible {
      display: block;
    }

    .extraction-details {
      display: none;
      color: #c4d0e4;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      padding: 12px;
      white-space: pre-wrap;
      font-size: 14px;
    }

    .extraction-details.is-visible {
      display: block;
    }

    .loading-text {
      display: none;
      color: #70caff;
      font-weight: 800;
      font-size: 14px;
    }

    .loading-text.is-visible {
      display: block;
    }

    .market-status {
      display: none;
      color: #c4d0e4;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      padding: 12px;
      white-space: pre-wrap;
      font-size: 14px;
    }

    .market-status.is-visible {
      display: block;
    }

    .market-status.is-success {
      color: #7effcf;
      border-color: rgba(80,255,185,0.22);
      background: rgba(80, 255, 185, 0.1);
    }

    .market-status.is-error {
      color: #ffd28a;
      border-color: rgba(255,190,70,0.22);
      background: rgba(255, 190, 70, 0.12);
    }

    .market-scan-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
    }

    .market-scan-card {
      display: grid;
      gap: 12px;
      align-content: space-between;
      min-height: 180px;
      padding: 18px;
      border-radius: 18px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .market-scan-card h3 {
      margin: 0;
      font-size: 19px;
      letter-spacing: -0.03em;
    }

    .market-result-row {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) minmax(180px, 1.1fr) minmax(110px, 0.5fr) minmax(140px, 0.7fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border-radius: 14px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.07);
      color: #c4d0e4;
      font-size: 14px;
    }

    .market-result-title {
      color: #ffffff;
      font-weight: 850;
    }

    .market-result-source {
      overflow-wrap: anywhere;
      color: #91a2bd;
      font-size: 12px;
      margin-top: 4px;
    }

    .settings-form {
      display: grid;
      grid-template-columns: minmax(230px, 1fr) minmax(220px, 1fr) auto;
      gap: 10px;
      align-items: center;
      margin-top: 14px;
    }

    .input {
      width: 100%;
      border-radius: 13px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(0,0,0,0.24);
      color: #eef5ff;
      padding: 12px 13px;
      font: inherit;
      outline: none;
    }

    .input::placeholder {
      color: #73839d;
    }

    .ignored-list {
      display: grid;
      gap: 8px;
      margin-top: 15px;
    }

    .ignored-row {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) minmax(160px, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 11px 12px;
      border-radius: 14px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.07);
      color: #c4d0e4;
      font-size: 14px;
    }

    .ignored-email {
      color: #ffffff;
      font-weight: 800;
    }

    .danger-button {
      background: rgba(255, 80, 80, 0.16);
      color: #ffaaaa;
      border: 1px solid rgba(255,80,80,0.25);
      box-shadow: none;
    }

    .empty {
      padding: 28px;
      border-radius: 22px;
      background: rgba(255,255,255,0.055);
      border: 1px solid rgba(255,255,255,0.08);
      color: #b7c4d8;
    }

    .task-card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.085);
      border-radius: 24px;
      padding: 22px;
      margin-bottom: 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.24);
      transition: 0.2s ease;
    }

    .task-card:hover {
      transform: translateY(-2px);
      border-color: rgba(74, 180, 255, 0.38);
      box-shadow: 0 24px 78px rgba(0, 153, 255, 0.13);
    }

    .task-top {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      margin-bottom: 17px;
    }

    .client-name {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.04em;
      margin-bottom: 4px;
    }

    .client-email {
      color: #91a2bd;
      font-size: 14px;
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .badge {
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
      text-transform: uppercase;
    }

    .priority-HIGH {
      background: rgba(255, 80, 80, 0.16);
      color: #ff8a8a;
      border: 1px solid rgba(255,80,80,0.25);
    }

    .priority-MEDIUM {
      background: rgba(255, 190, 70, 0.16);
      color: #ffd28a;
      border: 1px solid rgba(255,190,70,0.25);
    }

    .priority-LOW {
      background: rgba(80, 255, 185, 0.14);
      color: #7effcf;
      border: 1px solid rgba(80,255,185,0.22);
    }

    .status-badge {
      background: rgba(255,255,255,0.09);
      color: #dce7f7;
      border: 1px solid rgba(255,255,255,0.1);
    }

    .agent-badge {
      background: rgba(0, 153, 255, 0.13);
      color: #7dccff;
      border: 1px solid rgba(0,153,255,0.22);
    }

    .task-meta {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .meta-box {
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 14px;
      color: #aab8ce;
      min-height: 74px;
    }

    .meta-box strong {
      display: block;
      color: #ffffff;
      margin-bottom: 5px;
      font-size: 13px;
    }

    .details-box {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      margin-top: 11px;
      background: rgba(0,0,0,0.2);
      overflow: hidden;
    }

    .details-box summary {
      cursor: pointer;
      padding: 15px 17px;
      font-weight: 800;
      color: #eaf3ff;
    }

    .message-box {
      padding: 17px;
      border-top: 1px solid rgba(255,255,255,0.08);
      line-height: 1.55;
      white-space: pre-wrap;
      font-size: 14px;
      color: #c4d0e4;
    }

    .ai-reply {
      width: calc(100% - 34px);
      min-height: 260px;
      margin: 0 17px 17px;
      padding: 15px;
      border-radius: 15px;
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 15px;
      line-height: 1.55;
      resize: vertical;
      box-sizing: border-box;
      white-space: pre-wrap;
      color: #eef5ff;
      background: rgba(255,255,255,0.055);
      outline: none;
    }

    .human-info-form {
      padding: 0 17px 17px;
    }

    .human-info-input {
      width: 100%;
      min-height: 170px;
      padding: 15px;
      border-radius: 15px;
      border: 1px solid rgba(255,255,255,0.12);
      font-size: 15px;
      line-height: 1.55;
      resize: vertical;
      box-sizing: border-box;
      color: #eef5ff;
      background: rgba(255,255,255,0.055);
      outline: none;
      font-family: inherit;
    }

    .human-info-actions {
      margin-top: 12px;
      display: flex;
      justify-content: flex-end;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-top: 17px;
      flex-wrap: wrap;
      align-items: center;
    }

    button {
      border: none;
      border-radius: 13px;
      padding: 11px 15px;
      font-weight: 900;
      cursor: pointer;
      color: white;
      background: rgba(255,255,255,0.1);
      transition: 0.15s ease;
    }

    button:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,0.16);
    }

    .copy-button {
      background: linear-gradient(135deg, #008cff, #005eff);
      box-shadow: 0 0 26px rgba(0,132,255,0.32);
    }

    .done-button {
      background: linear-gradient(135deg, #19c98b, #0b8f62);
      box-shadow: 0 0 26px rgba(25,201,139,0.18);
    }

    .link-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 13px;
      padding: 11px 15px;
      font-weight: 900;
      color: white;
      text-decoration: none;
      background: rgba(255,255,255,0.1);
      transition: 0.15s ease;
    }

    .link-button:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,0.16);
    }

    .no-reply {
      color: #91a2bd;
      font-size: 14px;
      padding: 16px;
      display: block;
    }

    form {
      margin: 0;
    }

    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
        height: auto;
        border-right: none;
        border-bottom: 1px solid rgba(255,255,255,0.08);
      }

      .side-nav {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .hero {
        grid-template-columns: 1fr;
        text-align: center;
      }

      .echo-img {
        margin: 0 auto;
      }

      .spectra-img {
        margin: 0 auto;
      }

      .kpi-grid,
      .task-meta {
        grid-template-columns: repeat(2, 1fr);
      }

      .market-scan-grid,
      .market-result-row {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 700px) {
      .main {
        width: calc(100% - 40px);
        padding: 20px 0;
      }

      h1 {
        font-size: 30px;
      }

      .topbar,
      .task-top {
        flex-direction: column;
      }

      .brand-heading {
        align-items: flex-start;
      }

      .cosmo-logo {
        width: 48px;
        height: 48px;
      }

      .badges {
        justify-content: flex-start;
      }

      .kpi-grid,
      .task-meta,
      .settings-form,
      .ignored-row,
      .form-grid,
      .confirmation-assets {
        grid-template-columns: 1fr;
      }

      .market-scan-grid,
      .market-result-row {
        grid-template-columns: 1fr;
      }

      .hero {
        padding: 24px;
      }

      .echo-img {
        width: 155px;
        height: 155px;
      }

      .spectra-img {
        width: 155px;
        height: 155px;
      }

      .side-nav {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>

<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <img src="/cosmo-logo.svg" alt="Cosmo" class="sidebar-logo" />
        <div>
          <div class="sidebar-title">Cosmo IA</div>
          <div class="sidebar-subtitle">Powered by Cosmo</div>
        </div>
      </div>

      <nav class="side-nav" aria-label="Navigation principale">
        <button class="side-link is-active" type="button" data-target-view="email-management">Gestion des e-mails</button>
        <button class="side-link" type="button" data-target-view="birthday-registration">Enregistrer un anniversaire</button>
        <button class="side-link" type="button" data-target-view="market-watch">Veille marché</button>
        <a class="side-link" href="/phoenix">Phoenix CRM</a>
        <button class="side-link" type="button" data-target-view="ignored-senders">Expéditeurs ignorés</button>
      </nav>

      <div class="sidebar-footer">
        Echo, Spectra et Phoenix sont séparés par espace de travail pour garder les traitements lisibles.
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="brand-heading">
          <img src="/cosmo-logo.svg" alt="Cosmo" class="cosmo-logo" />
          <div>
            <h1>Cosmo IA</h1>
            <div class="subtitle">Pilotage intelligent des communications entrantes - Powered by Cosmo</div>
          </div>
        </div>
        <div class="status-pill">● Orchestrator actif</div>
      </div>

      <section class="app-section is-active" data-view="email-management">
      <section class="hero">
        <img src="/Echo.png" alt="Echo Agent Email" class="echo-img" />

        <div>
          <h2>Echo</h2>
          <div class="hero-sub">Agent Email</div>
          <div class="tagline">Il lit. Il comprend. Il répond.</div>
          <div class="hero-text">
            Echo analyse les demandes clients, détecte l’intention, prépare les réponses commerciales
            et crée les tâches à valider avant envoi.
          </div>
        </div>

        <div class="stats">
          <div class="stat">
            <strong>Actif</strong>
            <span>Statut de l’agent</span>
          </div>
          <div class="stat">
            <strong>${totalTasks}</strong>
            <span>Tâches en attente</span>
          </div>
          <div class="stat">
            <strong>24/7</strong>
            <span>Surveillance inbox</span>
          </div>
        </div>
      </section>

      <section class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Tâches ouvertes</div>
          <div class="kpi-value">${totalTasks}</div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Priorité haute</div>
          <div class="kpi-value">${highTasks}</div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Demandes devis</div>
          <div class="kpi-value">${quoteTasks}</div>
        </div>

        <div class="kpi">
          <div class="kpi-label">Anniversaires</div>
          <div class="kpi-value">${birthdayTasks}</div>
        </div>
      </section>
      </section>

      <section class="app-section" data-view="birthday-registration">
      <div id="birthday-registration" class="section-title">
        <h2>Enregistrer un anniversaire</h2>
        <span>Upload PDF/JPG → résumé → calendrier</span>
      </div>

      <section class="settings-panel birthday-workflow">
        <div id="birthdayDropzone" class="upload-zone">
          <strong>Documents de réservation</strong>
          <div class="subtitle">Glissez-déposez les PDF/JPG ici, ou cliquez pour les sélectionner.</div>
          <input id="birthdayFiles" class="file-input" type="file" accept="application/pdf,image/jpeg,image/jpg,image/png" multiple />
          <div id="birthdayFileList" class="file-list"></div>
        </div>

        <div class="actions">
          <button id="analyzeBirthdayButton" class="copy-button" type="button">Analyser les documents</button>
          <span id="birthdayLoading" class="loading-text">Analyse en cours...</span>
        </div>

        <div id="birthdayWarnings" class="warning-list"></div>
        <div id="birthdayExtractionDetails" class="extraction-details"></div>

        <form id="birthdayResult" class="birthday-result" method="POST" action="/birthday-reservations/add-event">
          <div class="editable-note">Tous les champs ci-dessous sont modifiables avant l'ajout au calendrier.</div>

          <div class="form-grid">
            <label class="field-label">
              Titre événement
              <input id="birthdayTitle" class="input" name="title" required />
            </label>

            <label class="field-label">
              Date
              <input id="birthdayDate" class="input" type="date" name="eventDate" required />
            </label>

            <label class="field-label">
              Début
              <input id="birthdayStart" class="input" type="time" name="startTime" required />
            </label>

            <label class="field-label">
              Fin
              <input id="birthdayEnd" class="input" type="time" name="endTime" required />
            </label>
          </div>

          <label class="field-label">
            Résumé validé par l'humain
            <textarea id="birthdaySummary" class="summary-editor" name="summary" required></textarea>
          </label>

          <div class="actions">
            <button class="done-button" type="submit">Approuver et ajouter l'événement</button>
            <button class="danger-button" type="button" id="cancelBirthdayButton">Annuler la saisie</button>
          </div>

          <label class="field-label">
            <span class="field-header">
              Brouillon de confirmation à envoyer au client
              <button class="copy-button" type="button" id="copyBirthdayConfirmationButton">Copier</button>
            </span>
            <div id="birthdayConfirmationDraft" class="summary-editor confirmation-editor" contenteditable="true"></div>
          </label>

          <div class="confirmation-assets" aria-label="Image à insérer dans l'e-mail">
            <div class="confirmation-asset">
              <img src="/anniv3.jpeg" alt="Départ des invités" />
              <span>anniv3.jpeg - Départ des invités</span>
            </div>
          </div>
        </form>
      </section>
      </section>

      <section class="app-section" data-view="market-watch">
      <section class="hero">
        <img src="/Spectra.png" alt="SPECTRA Agent Marché" class="spectra-img" />

        <div>
          <h2>SPECTRA</h2>
          <div class="hero-sub">Agent de veille concurrentielle</div>
          <div class="tagline">Il observe. Il analyse. Il anticipe.</div>
          <div class="hero-text">
            SPECTRA surveille les offres concurrentes en Suisse romande, extrait les informations publiques
            et signale les nouvelles offres ou changements utiles pour ajuster les actions commerciales.
          </div>

          <div class="actions">
            <span id="marketAnalysisLoading" class="loading-text">Analyse en cours...</span>
          </div>
        </div>

        <div class="stats">
          <div class="stat">
            <strong>3</strong>
            <span>Domaines suivis</span>
          </div>
          <div class="stat">
            <strong>${marketSnapshot.unreadAlerts}</strong>
            <span>Alertes non lues</span>
          </div>
          <div class="stat">
            <strong>${marketSnapshot.totalOffers}</strong>
            <span>Offres suivies</span>
          </div>
        </div>
      </section>

      <section class="settings-panel birthday-workflow">
        <div class="section-title">
          <h2>Analyse concurrentielle</h2>
          <span>SPECTRA intégré à Cosmo IA</span>
        </div>

        <div class="subtitle">
          L’analyse tourne directement dans Cosmo IA : recherche Serper, lecture des pages publiques, analyse OpenAI et stockage dans la base Cosmo.
        </div>

        <section class="kpi-grid" style="margin: 0;">
          <div class="kpi">
            <div class="kpi-label">Anniversaires</div>
            <div class="kpi-value">Suivi</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Stages</div>
            <div class="kpi-value">Suivi</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Cours de magie</div>
            <div class="kpi-value">Suivi</div>
          </div>

          <div class="kpi">
            <div class="kpi-label">Alertes marché</div>
            <div class="kpi-value">${marketSnapshot.totalAlerts}</div>
          </div>
        </section>

        ${
          marketSnapshot.isReady
            ? ""
            : `<div class="warning-list is-visible">Les tables de veille marché ne sont pas encore présentes. Lancez la migration Prisma avant la première analyse.</div>`
        }

        <div id="marketAnalysisStatus" class="market-status"></div>
      </section>

      <section class="settings-panel birthday-workflow">
        <div class="section-title">
          <h2>Choisir un scan</h2>
          <span>Un domaine à la fois</span>
        </div>

        <div class="market-scan-grid">
          <div class="market-scan-card">
            <div>
              <h3>Scanner tous les domaines suivis</h3>
              <div class="subtitle">Anniversaires, stages et cours de magie en une seule passe.</div>
            </div>
            <div class="actions">
              <button class="done-button market-scan-button" type="button" data-market-domain="">Scanner tous les domaines</button>
            </div>
          </div>

          <div class="market-scan-card">
            <div>
              <h3>Scan Anniversaires</h3>
              <div class="subtitle">Magiciens et animations anniversaires enfants en Suisse romande.</div>
            </div>
            <div class="actions">
              <button class="copy-button market-scan-button" type="button" data-market-domain="ANNIVERSAIRE">Scanner</button>
              <button class="side-link" type="button" data-target-view="market-anniversaires">Voir résultats (${marketSnapshot.domainCounts.ANNIVERSAIRE || 0})</button>
            </div>
          </div>

          <div class="market-scan-card">
            <div>
              <h3>Scan Stages</h3>
              <div class="subtitle">Stages et ateliers magie pendant les vacances en Suisse romande.</div>
            </div>
            <div class="actions">
              <button class="copy-button market-scan-button" type="button" data-market-domain="STAGE">Scanner</button>
              <button class="side-link" type="button" data-target-view="market-stages">Voir résultats (${marketSnapshot.domainCounts.STAGE || 0})</button>
            </div>
          </div>

          <div class="market-scan-card">
            <div>
              <h3>Scan Cours de magie</h3>
              <div class="subtitle">Écoles, cours et formations de magie proposés en Suisse romande.</div>
            </div>
            <div class="actions">
              <button class="copy-button market-scan-button" type="button" data-market-domain="COURS">Scanner</button>
              <button class="side-link" type="button" data-target-view="market-cours">Voir résultats (${marketSnapshot.domainCounts.COURS || 0})</button>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-panel">
        <div class="section-title">
          <h2>Dernières alertes marché</h2>
          <span>${Math.min(marketSnapshot.alerts.length, 5)} sur ${marketSnapshot.totalAlerts}</span>
        </div>

        <div class="ignored-list">
          ${
            marketSnapshot.alerts.length === 0
              ? `<div class="empty">Aucune alerte marché pour le moment. Lancez SPECTRA pour créer le premier scan.</div>`
              : marketSnapshot.alerts
                  .slice(0, 5)
                  .map((alert) => {
                    return `
                      <div class="ignored-row">
                        <div class="ignored-email">${escapeHtml(alert.type)}</div>
                        <div>${escapeHtml(alert.message)}</div>
                        <button class="side-link" type="button" data-target-view="market-alerts">Voir détail</button>
                      </div>
                    `
                  })
                  .join("")
          }
        </div>

        ${
          marketSnapshot.alerts.length > 0
            ? `<div class="actions">
                <button class="copy-button" type="button" data-target-view="market-alerts">Voir toutes les alertes marché</button>
              </div>`
            : ""
        }
      </section>

      <section class="settings-panel">
        <div class="section-title">
          <h2>Derniers scans</h2>
          <span>${marketSnapshot.scans.length} affiché(s)</span>
        </div>

        <div class="ignored-list">
          ${
            marketSnapshot.scans.length === 0
              ? `<div class="empty">Aucun scan marché enregistré.</div>`
              : marketSnapshot.scans
                  .map((scan) => {
                    return `
                      <div class="ignored-row">
                        <div class="ignored-email">${escapeHtml(scan.domain)}</div>
                        <div>${escapeHtml(scan.status)}</div>
                        <div>${escapeHtml(scan.startedAt.toLocaleString("fr-CH"))}</div>
                      </div>
                    `
                  })
                  .join("")
          }
        </div>
      </section>
      </section>

      <section class="app-section" data-view="market-alerts">
        <div class="section-title">
          <h2>Alertes marché</h2>
          <span>${marketSnapshot.totalAlerts} alerte(s)</span>
        </div>

        <section class="settings-panel birthday-workflow">
          <div class="actions">
            <button class="side-link" type="button" data-target-view="market-watch">Retour veille marché</button>
          </div>

          ${
            marketSnapshot.alerts.length === 0
              ? `<div class="empty">Aucune alerte marché enregistrée.</div>`
              : marketSnapshot.alerts
                  .map((alert) => {
                    const domain = isMarketDomain(alert.domain) ? alert.domain : null
                    const domainView = domain ? marketDomainViews[domain] : "market-watch"
                    const domainLabel = domain ? marketDomainLabels[domain] : alert.domain

                    return `
                      <details class="details-box">
                        <summary>
                          ${escapeHtml(alert.type)} · ${escapeHtml(domainLabel)} · ${escapeHtml(alert.createdAt.toLocaleString("fr-CH"))}
                        </summary>
                        <div class="message-box">
                          <strong>Message</strong>
                          ${escapeHtml(alert.message)}

                          <strong>Domaine</strong>
                          ${escapeHtml(domainLabel)}

                          <strong>Concurrent</strong>
                          ${escapeHtml(alert.competitor || "Non renseigné")}

                          <strong>Statut</strong>
                          ${alert.isRead ? "Lue" : "Non lue"}

                          <div class="actions">
                            <button class="copy-button" type="button" data-target-view="${domainView}">Voir les résultats du domaine</button>
                          </div>
                        </div>
                      </details>
                    `
                  })
                  .join("")
          }
        </section>
      </section>

      ${
        (["ANNIVERSAIRE", "STAGE", "COURS"] as MarketDomain[])
          .map((domain) => {
            const rows = marketResults[domain]

            return `
              <section class="app-section" data-view="${marketDomainViews[domain]}">
                <div class="section-title">
                  <h2>${marketDomainLabels[domain]}</h2>
                  <span>${rows.length} concurrent(s) détecté(s)</span>
                </div>

                <section class="settings-panel birthday-workflow">
                  <div class="actions">
                    <button class="copy-button market-scan-button" type="button" data-market-domain="${domain}">Relancer le scan ${marketDomainLabels[domain]}</button>
                    <button class="side-link" type="button" data-target-view="market-watch">Retour veille marché</button>
                  </div>

                  ${
                    rows.length === 0
                      ? `<div class="empty">Aucun résultat pour ce domaine. Lancez le scan ${marketDomainLabels[domain]} pour détecter les concurrents.</div>`
                      : `<div class="ignored-list">
                          ${rows
                            .map((row) => {
                              const sourceUrl = row.sourceUrl || row.website

                              return `
                                <div class="market-result-row">
                                  <div>
                                    <div class="market-result-title">${escapeHtml(row.competitorName)}</div>
                                    <div class="market-result-source">${escapeHtml(row.website || "Site non détecté")}</div>
                                  </div>
                                  <div>
                                    <div>${escapeHtml(row.title || "Offre détectée")}</div>
                                    <div class="market-result-source">${escapeHtml(row.location || "Lieu non détecté")}${row.duration ? " · " + escapeHtml(row.duration) : ""}</div>
                                  </div>
                                  <div>${escapeHtml(formatMarketPrice(row.price, row.currency))}</div>
                                  <div>${row.confidence !== null ? `Confiance ${Math.round(row.confidence * 100)}%` : "Confiance non détectée"}</div>
                                  <div>${renderMarketSourceLink(sourceUrl)}</div>
                                </div>
                              `
                            })
                            .join("")}
                        </div>`
                  }
                </section>
              </section>
            `
          })
          .join("")
      }

      <section class="app-section" data-view="ignored-senders">
      <div class="section-title">
        <h2>Expéditeurs ignorés</h2>
        <span>${ignoredSenders.length} adresse(s)</span>
      </div>

      <section class="settings-panel">
        <div class="subtitle">Les emails provenant de ces adresses sont marqués comme lus sans réponse IA.</div>

        <form class="settings-form" method="POST" action="/ignored-senders">
          <input class="input" type="email" name="email" placeholder="ads-noreply@google.com" required />
          <input class="input" type="text" name="reason" placeholder="Raison optionnelle" />
          <button type="submit">Ajouter</button>
        </form>

        <div class="ignored-list">
          ${
            ignoredSenders.length === 0
              ? `<div class="empty">Aucun expéditeur ajouté manuellement pour le moment.</div>`
              : ignoredSenders
                  .map((sender) => {
                    return `
                      <div class="ignored-row">
                        <div class="ignored-email">${escapeHtml(sender.email)}</div>
                        <div>${escapeHtml(sender.reason || "Sans raison")}</div>
                        <form method="POST" action="/ignored-senders/${sender.id}/delete">
                          <button class="danger-button" type="submit">Supprimer</button>
                        </form>
                      </div>
                    `
                  })
                  .join("")
          }
        </div>
      </section>
      </section>

      <section class="app-section is-active" data-view="email-management">
      <div class="section-title">
        <h2>Dernières tâches générées</h2>
        <span>${totalTasks} tâche(s) à traiter</span>
      </div>

      ${
        tasks.length === 0
          ? `<div class="empty">Aucune tâche pour le moment. Echo est en veille active.</div>`
          : tasks
              .map((task) => {
                const description = task.description || ""
                const suggestedReply = extractSuggestedReply(description)
                const internalInfoRequest = extractInternalInfoRequest(description)
                const clientMessage = extractClientMessage(description)

                const customerName = [
                  task.customer?.firstName,
                  task.customer?.lastName,
                ].filter(Boolean).join(" ")

                const displayName = customerName || "Nom non détecté"
                const displayEmail = task.customer?.email || "Email inconnu"

                return `
                  <div class="task-card">
                    <div class="task-top">
                      <div>
                        <div class="client-name">${escapeHtml(displayName)}</div>
                        <div class="client-email">${escapeHtml(displayEmail)}</div>
                      </div>

                      <div class="badges">
                        <span class="badge agent-badge">Echo</span>
                        <span class="badge priority-${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
                        <span class="badge status-badge">${escapeHtml(task.status)}</span>
                      </div>
                    </div>

                    <div class="task-meta">
                      <div class="meta-box">
                        <strong>Type</strong>
                        ${escapeHtml(task.taskType)}
                      </div>

                      <div class="meta-box">
                        <strong>Échéance</strong>
                        ${task.dueAt ? task.dueAt.toLocaleDateString("fr-CH") : "-"}
                      </div>

                      <div class="meta-box">
                        <strong>Titre</strong>
                        ${escapeHtml(task.title)}
                      </div>

                      <div class="meta-box">
                        <strong>Créée le</strong>
                        ${task.createdAt.toLocaleString("fr-CH")}
                      </div>
                    </div>

                    <details class="details-box">
                      <summary>Lire le message client complet</summary>
                      <div class="message-box">${escapeHtml(clientMessage)}</div>
                    </details>

                    ${
                      internalInfoRequest
                        ? `<details class="details-box" open>
                            <summary>Information interne requise</summary>
                            <div class="message-box">${escapeHtml(internalInfoRequest)}</div>
                            <form class="human-info-form" method="POST" action="/tasks/${task.id}/generate-reply">
                              <textarea class="human-info-input" name="humanProvidedInfo" placeholder="Ajoutez ici les informations métier à utiliser pour générer la réponse client : description, tarif, durée, conditions, disponibilité, etc." required></textarea>
                              <div class="human-info-actions">
                                <button class="copy-button" type="submit">Générer la réponse IA</button>
                              </div>
                            </form>
                          </details>`
                        : ""
                    }

                    <details class="details-box">
                      <summary>Voir la réponse IA complète</summary>
                      ${
                        suggestedReply
                          ? `<textarea class="ai-reply" readonly>${escapeHtml(suggestedReply)}</textarea>`
                          : `<span class="no-reply">Aucune réponse IA disponible.</span>`
                      }
                    </details>

                    <div class="actions">
                      ${
                        suggestedReply
                          ? `<button class="copy-button" onclick="copyReply(this)">Copier la réponse IA</button>
                             <div class="reply-hidden" style="display:none;">${escapeHtml(suggestedReply)}</div>`
                          : ""
                      }

                      <form method="POST" action="/tasks/${task.id}/done">
                        <button class="done-button" type="submit">Marquer comme traité</button>
                      </form>
                    </div>
                  </div>
                `
              })
              .join("")
      }
      </section>
    </main>
  </div>

  <script>
    function setActiveView(viewName) {
      document.querySelectorAll("[data-view]").forEach((section) => {
        section.classList.toggle("is-active", section.dataset.view === viewName)
      })

      document.querySelectorAll("[data-target-view]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.targetView === viewName)
      })

      window.location.hash = viewName
    }

    function setupNavigation() {
      document.querySelectorAll("[data-target-view]").forEach((button) => {
        button.addEventListener("click", () => {
          setActiveView(button.dataset.targetView)
        })
      })

      const initialView = window.location.hash.replace("#", "") || "email-management"
      const allowedViews = Array.from(document.querySelectorAll("[data-target-view]")).map((button) => button.dataset.targetView)

      setActiveView(allowedViews.includes(initialView) ? initialView : "email-management")
    }

    let birthdaySelectedFiles = []

    function formatFileSize(size) {
      if (size < 1024) return size + " o"
      if (size < 1024 * 1024) return Math.round(size / 1024) + " Ko"
      return (size / 1024 / 1024).toFixed(1) + " Mo"
    }

    function updateBirthdayFileList() {
      const list = document.getElementById("birthdayFileList")

      if (!list) return

      if (birthdaySelectedFiles.length === 0) {
        list.innerHTML = '<div class="subtitle">Aucun fichier sélectionné.</div>'
        return
      }

      list.innerHTML = birthdaySelectedFiles
        .map((file) => {
          return '<div class="file-pill"><span>' + file.name + '</span><span>' + formatFileSize(file.size) + '</span></div>'
        })
        .join("")
    }

    function setBirthdayFiles(files) {
      const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

      birthdaySelectedFiles = Array.from(files).filter((file) => {
        return allowedTypes.includes(file.type)
      })

      updateBirthdayFileList()
    }

    function setupBirthdayDropzone() {
      const dropzone = document.getElementById("birthdayDropzone")
      const input = document.getElementById("birthdayFiles")

      if (!dropzone || !input) return

      updateBirthdayFileList()

      dropzone.addEventListener("click", () => input.click())

      input.addEventListener("change", () => {
        setBirthdayFiles(input.files || [])
      })

      ;["dragenter", "dragover"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault()
          event.stopPropagation()
          dropzone.classList.add("is-dragging")
        })
      })

      ;["dragleave", "drop"].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
          event.preventDefault()
          event.stopPropagation()
          dropzone.classList.remove("is-dragging")
        })
      })

      dropzone.addEventListener("drop", (event) => {
        setBirthdayFiles(event.dataTransfer?.files || [])
      })
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = () => {
          resolve({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            dataUrl: String(reader.result || ""),
          })
        }

        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
    }

    function setBirthdayWarnings(warnings) {
      const warningBox = document.getElementById("birthdayWarnings")

      if (!warningBox) return

      if (!warnings || warnings.length === 0) {
        warningBox.classList.remove("is-visible")
        warningBox.innerText = ""
        return
      }

      warningBox.innerText = warnings.join("\\n")
      warningBox.classList.add("is-visible")
    }

    function fillBirthdayResult(analysis) {
      const result = document.getElementById("birthdayResult")
      const title = document.getElementById("birthdayTitle")
      const date = document.getElementById("birthdayDate")
      const start = document.getElementById("birthdayStart")
      const end = document.getElementById("birthdayEnd")
      const summary = document.getElementById("birthdaySummary")
      const confirmationDraft = document.getElementById("birthdayConfirmationDraft")

      title.value = "Anniversaire " + (analysis.variantName || "magique") + (analysis.childFirstName ? " - " + analysis.childFirstName : "")
      date.value = analysis.eventDate || ""
      start.value = analysis.startTime || ""
      end.value = analysis.endTime || ""
      summary.value = analysis.summary || ""
      confirmationDraft.innerHTML = formatConfirmationDraft(analysis.confirmationDraft || "")

      setBirthdayWarnings(analysis.warnings || [])
      setBirthdayExtractionDetails(analysis.extractionDetails || null)
      result.classList.add("is-visible")
    }

    function resetBirthdayReservation() {
      const input = document.getElementById("birthdayFiles")
      const result = document.getElementById("birthdayResult")
      const extractionDetails = document.getElementById("birthdayExtractionDetails")
      const fields = [
        "birthdayTitle",
        "birthdayDate",
        "birthdayStart",
        "birthdayEnd",
        "birthdaySummary",
        "birthdayConfirmationDraft",
      ]

      birthdaySelectedFiles = []

      if (input) {
        input.value = ""
      }

      fields.forEach((fieldId) => {
        const field = document.getElementById(fieldId)

        if (field) {
          if (field.isContentEditable) {
            field.innerHTML = ""
          } else {
            field.value = ""
          }
        }
      })

      setBirthdayWarnings([])

      if (extractionDetails) {
        extractionDetails.classList.remove("is-visible")
        extractionDetails.innerText = ""
      }

      if (result) {
        result.classList.remove("is-visible")
      }

      updateBirthdayFileList()
    }

    async function copyBirthdayConfirmation() {
      const draft = document.getElementById("birthdayConfirmationDraft")
      const button = document.getElementById("copyBirthdayConfirmationButton")

      if (!draft || !button) return

      try {
        const plainText = draft.innerText
        const html = draft.innerHTML

        if (window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plainText], { type: "text/plain" }),
            }),
          ])
        } else {
          await navigator.clipboard.writeText(plainText)
        }

        button.innerText = "Copié"

        setTimeout(() => {
          button.innerText = "Copier"
        }, 1500)
      } catch (error) {
        alert("Impossible de copier le brouillon.")
      }
    }

    function escapeDraftHtml(text) {
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
    }

    function formatConfirmationDraft(text) {
      return escapeDraftHtml(text)
        .replace(/\\*\\*(.*?)\\*\\*/g, "<strong>$1</strong>")
        .replace(/\\n/g, "<br>")
    }

    function setBirthdayExtractionDetails(details) {
      const box = document.getElementById("birthdayExtractionDetails")

      if (!box || !details) return

      const lines = [
        "Contrôle extraction :",
        details.selectedVariantEvidence ? "- Variante : " + details.selectedVariantEvidence : "- Variante : preuve non fournie",
        details.childrenCountEvidence ? "- Nombre d'enfants : " + details.childrenCountEvidence : "- Nombre d'enfants : preuve non fournie",
      ]

      if (details.selectedOptionsEvidence && details.selectedOptionsEvidence.length > 0) {
        lines.push("- Options :")
        details.selectedOptionsEvidence.forEach((item) => lines.push("  • " + item))
      } else {
        lines.push("- Options : aucune preuve d'option cochée fournie")
      }

      box.innerText = lines.join("\\n")
      box.classList.add("is-visible")
    }

    async function analyzeBirthdayReservation() {
      const loading = document.getElementById("birthdayLoading")
      const button = document.getElementById("analyzeBirthdayButton")

      if (birthdaySelectedFiles.length === 0) {
        alert("Ajoutez au moins un fichier PDF ou JPG.")
        return
      }

      loading.classList.add("is-visible")
      button.disabled = true

      try {
        const files = await Promise.all(birthdaySelectedFiles.map(readFileAsDataUrl))
        const response = await fetch("/birthday-reservations/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ files }),
        })

        const payload = await response.json()

        if (!payload.success) {
          throw new Error(payload.error || "Analyse impossible")
        }

        fillBirthdayResult(payload.analysis)
      } catch (error) {
        alert(error instanceof Error ? error.message : "Analyse impossible")
      } finally {
        loading.classList.remove("is-visible")
        button.disabled = false
      }
    }

    async function runMarketAnalysis(domain, clickedButton) {
      const loading = document.getElementById("marketAnalysisLoading")
      const button = clickedButton || document.querySelector('[data-market-domain="' + domain + '"]')
      const status = document.getElementById("marketAnalysisStatus")

      if (!button) return

      if (status) {
        status.className = "market-status"
        status.innerText = ""
      }
      loading?.classList.add("is-visible")
      button.disabled = true

      try {
        const response = await fetch("/market-analysis/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ domain }),
        })

        const payload = await response.json()

        if (!payload.success) {
          throw new Error(payload.error || "Analyse impossible")
        }

        const summary = payload.summary || {}
        const lines = [
          "Analyse SPECTRA terminée dans Cosmo IA.",
          "Domaines scannés : " + (summary.scannedDomains || 0),
          "Pages analysées : " + (summary.analyzedUrls || 0),
          "Offres pertinentes : " + (summary.relevantOffers || 0),
          "Alertes créées : " + (summary.createdAlerts || 0),
        ]

        if (summary.errors && summary.errors.length > 0) {
          lines.push("Points à vérifier :")
          summary.errors.slice(0, 5).forEach((item) => lines.push("- " + item))
        }

        if (status) {
          status.innerText = lines.join("\\n") + "\\n\\nActualisation des résultats..."
          status.classList.add("is-visible", "is-success")
        }

        if (payload.targetView) {
          window.location.hash = payload.targetView
          setTimeout(() => window.location.reload(), 700)
        }
      } catch (error) {
        if (status) {
          status.innerText = error instanceof Error ? error.message : "Analyse impossible"
          status.classList.add("is-visible", "is-error")
        } else {
          alert(error instanceof Error ? error.message : "Analyse impossible")
        }
      } finally {
        loading?.classList.remove("is-visible")
        button.disabled = false
      }
    }

    setupNavigation()
    setupBirthdayDropzone()
    document.getElementById("analyzeBirthdayButton")?.addEventListener("click", analyzeBirthdayReservation)
    document.getElementById("cancelBirthdayButton")?.addEventListener("click", resetBirthdayReservation)
    document.getElementById("copyBirthdayConfirmationButton")?.addEventListener("click", copyBirthdayConfirmation)
    document.querySelectorAll(".market-scan-button").forEach((button) => {
      button.addEventListener("click", () => runMarketAnalysis(button.dataset.marketDomain, button))
    })
    document.querySelectorAll(".market-source-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        const url = link.dataset.sourceUrl || link.href

        if (!url) return

        event.preventDefault()

        const opened = window.open(url, "_blank", "noopener,noreferrer")

        if (!opened) {
          window.location.href = url
        }
      })
    })

    async function copyReply(button) {
      const reply = button.nextElementSibling.innerText

      try {
        await navigator.clipboard.writeText(reply)
        button.innerText = "Copié ✅"

        setTimeout(() => {
          button.innerText = "Copier la réponse IA"
        }, 1500)
      } catch (error) {
        alert("Impossible de copier la réponse.")
      }
    }
  </script>
</body>
</html>
`

  res.send(html)
})

app.listen(port, () => {
  console.log("Dashboard disponible sur http://localhost:" + port)
})
