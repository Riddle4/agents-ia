import "dotenv/config"
import express from "express"
import { prisma } from "../src/lib/prisma"

const app = express()
const port = process.env.PORT || 3000

app.use(express.urlencoded({ extended: true }))

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
  <title>Ferme d’Agents IA — Dashboard</title>

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
      grid-template-columns: 270px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      padding: 28px 22px;
      background: rgba(255,255,255,0.035);
      border-right: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(20px);
      position: sticky;
      top: 0;
      height: 100vh;
    }

    .brand {
      margin-bottom: 34px;
    }

    .brand-name {
      font-size: 25px;
      font-weight: 900;
      letter-spacing: -0.05em;
    }

    .brand-sub {
      margin-top: 4px;
      color: #7f91ad;
      font-size: 13px;
    }

    .nav-item {
      padding: 13px 15px;
      border-radius: 15px;
      color: #aab6ca;
      margin-bottom: 8px;
      font-weight: 700;
      font-size: 14px;
    }

    .nav-item.active {
      background: rgba(0, 153, 255, 0.14);
      color: white;
      border: 1px solid rgba(0,153,255,0.25);
      box-shadow: 0 0 30px rgba(0, 153, 255, 0.08);
    }

    .sidebar-footer {
      position: absolute;
      bottom: 24px;
      left: 22px;
      right: 22px;
      padding: 16px;
      border-radius: 18px;
      background: rgba(0,0,0,0.24);
      border: 1px solid rgba(255,255,255,0.08);
      color: #9aa9c0;
      font-size: 13px;
      line-height: 1.4;
    }

    .main {
      padding: 34px;
    }

    .topbar {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 28px;
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
        display: none;
      }

      .hero {
        grid-template-columns: 1fr;
        text-align: center;
      }

      .echo-img {
        margin: 0 auto;
      }

      .kpi-grid,
      .task-meta {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 700px) {
      .main {
        padding: 20px;
      }

      h1 {
        font-size: 30px;
      }

      .topbar,
      .task-top {
        flex-direction: column;
      }

      .badges {
        justify-content: flex-start;
      }

      .kpi-grid,
      .task-meta {
        grid-template-columns: 1fr;
      }

      .hero {
        padding: 24px;
      }

      .echo-img {
        width: 155px;
        height: 155px;
      }
    }
  </style>
</head>

<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-name">COSMO</div>
        <div class="brand-sub">L’intelligence orchestrée</div>
      </div>

      <div class="nav-item active">Dashboard</div>
      <div class="nav-item">Agents</div>
      <div class="nav-item">Emails</div>
      <div class="nav-item">Tâches</div>
      <div class="nav-item">Orchestrator</div>
      <div class="nav-item">Paramètres</div>

      <div class="sidebar-footer">
        <strong>Echo</strong><br />
        Agent email actif. Surveillance continue des communications entrantes.
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div>
          <h1>Ferme d’Agents IA</h1>
          <div class="subtitle">Pilotage intelligent des communications entrantes</div>
        </div>
        <div class="status-pill">● Orchestrator actif</div>
      </div>

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
    </main>
  </div>

  <script>
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