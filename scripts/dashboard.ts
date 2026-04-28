import "dotenv/config"
import express from "express"
import { prisma } from "../src/lib/prisma"

const app = express()
const port = process.env.PORT || 3000

app.use(express.static(process.cwd() + "/public"))

app.use(express.urlencoded({ extended: true }))

function extractSuggestedReply(description: string) {
  const marker = "--- RÉPONSE SUGGÉRÉE ---"

  if (!description.includes(marker)) {
    return ""
  }

  return description.split(marker)[1].trim()
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

      table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border-radius: 12px;
        overflow: hidden;
      }

      th, td {
        padding: 14px;
        border-bottom: 1px solid #eee;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #111827;
        color: white;
      }

      .priority-HIGH {
        color: #b91c1c;
        font-weight: bold;
      }

      .priority-MEDIUM {
        color: #b45309;
        font-weight: bold;
      }

      .priority-LOW {
        color: #047857;
        font-weight: bold;
      }

      .status {
        font-weight: bold;
      }

      .empty {
        background: white;
        padding: 20px;
        border-radius: 12px;
      }

      button {
        background: #111827;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: bold;
      }

      button:hover {
        background: #374151;
      }

      .no-reply {
        color: #999;
        font-size: 13px;
      }

      .reply-preview {
  max-width: 300px;
  color: #444;
  font-size: 13px;
  white-space: pre-wrap;
}

.mascot {
  width: 120px;
  display: block;
  margin: 20px auto;
  filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2));
}
    </style>
  </head>
  <body>
    <h1>Ferme d’Agents IA — Dashboard</h1>
    <img src="/miniRiddle.png" alt="miniRiddle" class="mascot" />
    <div class="subtitle">Dernières tâches générées par les agents</div>

    ${
      tasks.length === 0
        ? `<div class="empty">Aucune tâche pour le moment.</div>`
        : `
          <table>
            <thead>
              <tr>
                <th>Priorité</th>
                <th>Type</th>
                <th>Titre</th>
                <th>Client</th>
                <th>Status</th>
                <th>Échéance</th>
                <th>Réponse</th>
                <th>Créée le</th>
              </tr>
            </thead>
            <tbody>
              ${tasks
                .map((task) => {
                  const suggestedReply = extractSuggestedReply(task.description)

                  return `
                    <tr>
                      <td class="priority-${task.priority}">${task.priority}</td>
                      <td>${task.taskType}</td>
                      <td>${task.title}</td>
                      <td>${task.customer.email}</td>
                      <td class="status">
  ${task.status}
  ${
    task.status !== "DONE"
      ? `
        <form method="POST" action="/tasks/${task.id}/done" style="margin-top:8px;">
          <button type="submit">Traité</button>
        </form>
      `
      : ""
  }
</td>
                      <td>${task.dueAt ? task.dueAt.toLocaleDateString("fr-CH") : "-"}</td>
                      <td>
                        ${
                          suggestedReply
                            ? `
                              <button onclick="copyReply(this)">Copier</button>
                              <div class="reply-preview" style="display:none;">${suggestedReply}</div>
                            `
                            : `<span class="no-reply">Aucune réponse</span>`
                        }
                      </td>
                      <td>${task.createdAt.toLocaleString("fr-CH")}</td>
                    </tr>
                  `
                })
                .join("")}
            </tbody>
          </table>
        `
    }

    <script>
      async function copyReply(button) {
        const reply = button.nextElementSibling.innerText

        try {
          await navigator.clipboard.writeText(reply)
          button.innerText = "Copié ✅"

          setTimeout(() => {
            button.innerText = "Copier"
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