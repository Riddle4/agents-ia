import "dotenv/config"
import { google } from "googleapis"
import http from "http"

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
const port = Number(process.env.GOOGLE_TOKEN_PORT || 3000)
const redirectUri = `http://localhost:${port}`

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  redirectUri
)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
})

console.log("\nOuvre cette URL dans ton navigateur :\n")
console.log(authUrl)

// petit serveur local pour récupérer le code
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, redirectUri)
  const code = url.searchParams.get("code")

  if (code) {
    const { tokens } = await oauth2Client.getToken(code)

    console.log("\nAjoute ceci dans ton .env :\n")
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`)

    res.end("OK, tu peux fermer cette page.")
    server.close()
  }
})

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\nLe port ${port} est déjà utilisé.`)
    console.error("Ferme le serveur qui utilise ce port ou relance avec un autre port, par exemple :")
    console.error("\nGOOGLE_TOKEN_PORT=3002 npx tsx scripts/generate-google-token.ts\n")
    process.exit(1)
  }

  throw error
})

server.listen(port, () => {
  console.log("\nEn attente de l'autorisation Google...\n")
})
