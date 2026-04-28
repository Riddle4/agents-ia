import "dotenv/config"
import { Orchestrator } from "../src/orchestrator/orchestrator"

async function main() {
  const orchestrator = new Orchestrator()

  const result = await orchestrator.run({
    type: "EMAIL",
    payload: {
  fromEmail: "test-reponse-AI-Laurent@example.com",
  firstName: "Marc",
  lastName: "Test",
  subject: "Anniversaire magique",
  body: "Bonjour, j’aimerais recevoir un devis pour un anniversaire magique.",
},
  })

  console.log("")
  console.log("=== RÉSULTAT ORCHESTRATOR ===")
  console.log(`Succès           : ${result.success}`)
  console.log(`Input            : ${result.inputType}`)
  console.log(`Agent utilisé    : ${result.agent}`)

  if (result.result) {
    console.log(`Client           : ${result.result.customerAction}`)
    console.log(`Message créé     : ${result.result.messageId}`)
    console.log(`Tâche            : ${result.result.taskAction}`)
    console.log(`Tâche id         : ${result.result.taskId ?? "Aucune tâche"}`)
  }

  if (result.error) {
    console.log(`Erreur           : ${result.error}`)
  }
}

main()
  .catch((error) => {
    console.error("Erreur dans le test orchestrator:", error)
  })