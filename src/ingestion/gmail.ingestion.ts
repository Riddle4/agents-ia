import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"
import { Orchestrator } from "../orchestrator/orchestrator"

type GmailInboxConfig = {
  name: string
  user: string
  appPassword: string
}

const inboxes: GmailInboxConfig[] = [
  {
    name: "GMAIL_INFO",
    user: process.env.GMAIL_INFO_USER ?? "",
    appPassword: process.env.GMAIL_INFO_APP_PASSWORD ?? "",
  },
  {
    name: "GMAIL_MAGIELACOTE",
    user: process.env.GMAIL_MAGIELACOTE_USER ?? "",
    appPassword: process.env.GMAIL_MAGIELACOTE_APP_PASSWORD ?? "",
  },
]

export async function ingestGmailInboxes() {
  const orchestrator = new Orchestrator()

  for (const inbox of inboxes) {
    await ingestSingleInbox(inbox, orchestrator)
  }
}

async function ingestSingleInbox(
  inbox: GmailInboxConfig,
  orchestrator: Orchestrator
) {
  if (!inbox.user || !inbox.appPassword) {
    console.log(`⚠️ Configuration manquante pour ${inbox.name}`)
    return
  }

  console.log(`\n📥 Connexion à ${inbox.name} (${inbox.user})`)

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    logger: false,
    auth: {
      user: inbox.user,
      pass: inbox.appPassword,
    },
  })

  try {
    await client.connect()

    const lock = await client.getMailboxLock("INBOX")

    try {
      console.log(`✅ Connecté à ${inbox.name}`)

      const messages = await client.search({
        seen: false,
      })

      console.log(`Emails non lus trouvés : ${messages.length}`)

      for (const uid of messages.slice(0, 5)) {
        const message = await client.fetchOne(uid, {
          source: true,
          envelope: true,
          uid: true,
        })

        if (!message || !message.source) {
          continue
        }

        const parsed = await simpleParser(message.source)

        const fromEmail =
          parsed.from?.value?.[0]?.address ?? "unknown@example.com"

        const subject = parsed.subject ?? "(Sans sujet)"
        const body = parsed.text ?? parsed.html ?? ""

        if (
          fromEmail.includes("no-reply") ||
          fromEmail.includes("accounts.google.com")
        ) {
          console.log(`⏭️ Email automatique ignoré : ${fromEmail}`)

          await client.messageFlagsAdd(uid, ["\\Seen"])
          continue
        }

        console.log(`\n➡️ Email détecté : ${subject}`)
        console.log(`De : ${fromEmail}`)

        const result = await orchestrator.run({
          type: "EMAIL",
          payload: {
            fromEmail,
            subject,
            body,
            source: inbox.name,
            externalId: String(uid),
            sourceAccount: inbox.user,
            receivedAt: parsed.date ?? new Date(),
          },
        })

        if (result.success) {
          console.log("✅ Email traité par l’Orchestrator")

          await client.messageFlagsAdd(uid, ["\\Seen"])
        } else {
          console.log("❌ Erreur traitement email")
          console.log(result.error)
        }
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.log(`❌ Erreur Gmail ${inbox.name}: ${message}`)
  }
}