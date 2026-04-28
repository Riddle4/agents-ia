import "dotenv/config"
import { Orchestrator } from "../src/orchestrator/orchestrator"

async function main() {
  const orchestrator = new Orchestrator()

  const result = await orchestrator.run({
    type: "FORM",
    payload: {
      fromEmail: "parent-formulaire@example.com",
      firstName: "Sophie",
      lastName: "Martin",
      phone: "+41 79 123 45 67",
      formType: "ANNIVERSAIRE_MAGIQUE",
      subject: "Demande anniversaire magique à domicile",
      message:
        "Bonjour, j’aimerais organiser un anniversaire magique pour mon fils de 8 ans. Pouvez-vous me contacter pour les disponibilités ?",
    },
  })

  console.log("")
  console.log("=== RÉSULTAT FORM AGENT ===")
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
    console.error("Erreur dans le test FormAgent:", error)
  })