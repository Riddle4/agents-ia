export type RequestType =
  | "ANNIVERSAIRE"
  | "COURS_COLLECTIF"
  | "STAGE"
  | "ESCAPE_GAME"
  | "BOUTIQUE"
  | "ECOLE_PRIVEE"
  | "ANIMATION_EXTERNE"
  | "TEAM_BUILDING"
  | "SOIREE_MAGIQUE_PRIVEE"
  | "ANIMATION_DOMICILE_SIMPLE"
  | "QUESTION_SIMPLE"
  | "UNKNOWN"

export function classifyRequest(subject: string, body: string): RequestType {
  const text = `${subject} ${body}`.toLowerCase()

  if (
    text.includes("anniversaire") ||
    text.includes("birthday")
     ) {
    return "ANNIVERSAIRE"
  }

  if (
    text.includes("team building") ||
    text.includes("entreprise") ||
    text.includes("collègue") ||
    text.includes("séminaire")
  ) {
    return "TEAM_BUILDING"
  }

  if (
    text.includes("stage") ||
    text.includes("camp") ||
    text.includes("vacances") ||
    text.includes("pâques") ||
    text.includes("été") ||
    text.includes("automne") ||
    text.includes("halloween")
  ) {
    return "STAGE"
  }

  if (
    text.includes("cours de magie") ||
    text.includes("cours collectif") ||
    text.includes("année scolaire")
  ) {
    return "COURS_COLLECTIF"
  }

  if (
    text.includes("escape game") ||
    text.includes("école des sorciers") ||
    text.includes("pierre philosophale")
  ) {
    return "ESCAPE_GAME"
  }

  if (
    text.includes("soirée magique") ||
    text.includes("privatis") ||
    text.includes("apéritif")
  ) {
    return "SOIREE_MAGIQUE_PRIVEE"
  }

if (
  text.includes("domicile") &&
  text.includes("magicien") &&
  (text.includes("tarif") || text.includes("prix"))
) {
  return "ANIMATION_DOMICILE_SIMPLE"
}

  if (
    text.includes("spectacle") ||
    text.includes("close-up") ||
    text.includes("close up") ||
    text.includes("animation") ||
    text.includes("atelier") ||
    text.includes("événement")
  ) {
    return "ANIMATION_EXTERNE"
  }

  if (
    text.includes("boutique") ||
    text.includes("acheter") ||
    text.includes("accessoire") ||
    text.includes("magasin")
  ) {
    return "BOUTIQUE"
  }

  return "UNKNOWN"
}