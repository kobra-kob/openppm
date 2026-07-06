/**
 * Slug d'organisation : minuscules, sans accents, séparateur `-`,
 * 60 caractères max (colonne organizations.slug).
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length > 0 ? slug : "organisation";
}
