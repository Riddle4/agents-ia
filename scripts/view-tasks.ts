import "dotenv/config"
import { prisma } from "../src/lib/prisma"

async function main() {
  const tasks = await prisma.task.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: {
      customer: true,
    },
  })

  console.log("\n=== DERNIÈRES TÂCHES ===\n")

  for (const task of tasks) {
    console.log(`🧩 ${task.title}`)
    console.log(`ID          : ${task.id}`)
    console.log(`Type        : ${task.taskType}`)
    console.log(`Priorité    : ${task.priority}`)
    console.log(`Client      : ${task.customer.email}`)
    console.log(`Status      : ${task.status}`)
    console.log(`Créée le    : ${task.createdAt.toISOString()}`)

    if (task.dueAt) {
      console.log(`À faire pour: ${task.dueAt.toISOString()}`)
    }

    console.log(`Description :`)
    console.log(task.description)

    console.log("--------------------------------------------------\n")
  }
}

main()
  .catch((error) => {
    console.error("Erreur:", error)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })