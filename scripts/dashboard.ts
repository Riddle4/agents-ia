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

  const html = `
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Ferme d’Agents IA — Dashboard</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f4f4f5;
        margin: 0;
        padding: 40px;
        color: #111827;
      }

      .container {
        max-width: 1100px;
        margin: 0 auto;
      }

      h1 {
        margin-bottom: 10px;
        text-align: center;
      }

      .subtitle {
        color: #666;
        margin-bottom: 30px;
        text-align: center;
      }

      .mascot {
        width: 120px;
        display: block;
        margin: 20px auto;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
      }

      .empty {
        background: white;
        padding: 20px;
        border-radius: 12px;
      }

      .task-card {
        background: white;
        border-radius: 18px;
        padding: 24px;
        margin-bottom: 24px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.08);
      }

      .task-top {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .client-name {
        font-size: 22px;
        font-weight: bold;
        margin-bottom: 4px;
      }

      .client-email {
        color: #666;
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
        padding: 6px 10px;
        font-size: 13px;
        font-weight: bold;
        white-space: nowrap;
      }

      .priority-HIGH {
        background: #fee2e2;
        color: #b91c1c;
      }

      .priority-MEDIUM {
        background: #fef3c7;
        color: #b45309;
      }

      .priority-LOW {
        background: #d1fae5;
        color: #047857;
      }

      .status-badge {
        background: #e5e7eb;
        color: #374151;
      }

      .task-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-bottom: 16px;
        font-size: 14px;
      }

      .meta-box {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px;
      }

      .details-box {
        border: 1px solid #ddd;
        border-radius: 12px;
        margin-top: 12px;
        background: #fafafa;
        overflow: hidden;
      }

      .details-box summary {
        cursor: pointer;
        padding: 14px 16px;
        font-weight: bold;
      }

      .message-box {
        padding: 16px;
        border-top: 1px solid #ddd;
        line-height: 1.5;
        white-space: pre-wrap;
        font-size: 14px;
        color: #333;
      }

      .ai-reply {
        width: calc(100% - 32px);
        min-height: 260px;
        margin: 0 16px 16px;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid #ccc;
        font-size: 15px;
        line-height: 1.5;
        resize: vertical;
        box-sizing: border-box;
        white-space: pre-wrap;
      }

      .actions {
        display: flex;
        gap: 10px;
        margin-top: 18px;
        flex-wrap: wrap;
      }

      button {
        background: #111827;
        color: white;
        border: none;
        padding: 10px 14px;
        border-radius: 10px;
        cursor: pointer;
        font-weight: bold;
      }

      button:hover {
        background: #374151;
      }

      .copy-button {
        background: #2563eb;
      }

      .copy-button:hover {
        background: #1d4ed8;
      }

      .no-reply {
        color: #999;
        font-size: 14px;
        padding: 16px;
        display: block;
      }

      @media (max-width: 800px) {
        body {
          padding: 20px;
        }

        .task-top {
          flex-direction: column;
        }

        .badges {
          justify-content: flex-start;
        }

        .task-meta {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>

  <body>
    <div class="container">
      <h1>Ferme d’Agents IA — Dashboard</h1>
      <img src="/miniRiddle.png" alt="miniRiddle" class="mascot" />
      <div class="subtitle">Dernières tâches générées par les agents</div>

      ${
        tasks.length === 0
          ? `<div class="empty">Aucune tâche pour le moment.</div>`
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
                        <span class="badge priority-${task.priority}">${escapeHtml(task.priority)}</span>
                        <span class="badge status-badge">${escapeHtml(task.status)}</span>
                      </div>
                    </div>

                    <div class="task-meta">
                      <div class="meta-box">
                        <strong>Type :</strong><br />
                        ${escapeHtml(task.taskType)}
                      </div>

                      <div class="meta-box">
                        <strong>Échéance :</strong><br />
                        ${task.dueAt ? task.dueAt.toLocaleDateString("fr-CH") : "-"}
                      </div>

                      <div class="meta-box">
                        <strong>Titre :</strong><br />
                        ${escapeHtml(task.title)}
                      </div>

                      <div class="meta-box">
                        <strong>Créée le :</strong><br />
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
                          ? `
                            <textarea class="ai-reply" readonly>${escapeHtml(suggestedReply)}</textarea>
                          `
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
                        <button type="submit">Marquer comme traité</button>
                      </form>
                    </div>
                  </div>
                `
              })
              .join("")
      }
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
console.log(`Dashboard disponible sur http://localhost:${port}`)
})