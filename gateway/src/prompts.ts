import { z } from "zod";

/** Filter values the page knows about, sent with each /interpret call. */
export const FacetsSchema = z.object({
  categories: z.array(z.string()),
  seniority: z.array(z.string()),
  functions: z.array(z.string()),
  roleTypes: z.array(z.string()),
  regions: z.array(z.string()),
  places: z.array(z.string()), // "India|Bengaluru", "US|SF Bay Area", ...
  collegeGroups: z.array(z.string()), // "g:IIT", "g:NIT", ...
  colleges: z.array(z.string()), // "c:IIT Bombay", ...
  companies: z.array(z.string()),
  education: z.array(z.string()),
});
export type Facets = z.infer<typeof FacetsSchema>;

/** What Claude returns for /interpret. Every value must come from the lists in the system prompt. */
export const InterpretOutput = z.object({
  loc: z.array(z.string()).describe("Region or place keys, e.g. 'India' or 'India|Bengaluru'"),
  cat: z.array(z.string()).describe("AI company categories"),
  company: z.array(z.string()).describe("Company names"),
  sen: z.array(z.string()).describe("Seniority levels"),
  fn: z.array(z.string()).describe("Job functions"),
  role: z.array(z.string()).describe("Role types"),
  col: z.array(z.string()).describe("College keys: 'g:IIT' for a whole group, 'c:IIT Bombay' for one college"),
  edu: z.array(z.string()).describe("Education levels"),
  title_contains: z.string().nullable().describe("A word that must appear in the job title, or null"),
  keyword: z.string().nullable().describe("Leftover free text to search (a person's name, a product), or null"),
  understood: z.string().describe("One short sentence saying how the request was read"),
});
export type Interpretation = z.infer<typeof InterpretOutput>;

const list = (label: string, items: string[]) => (items.length ? `${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "");

export function interpretSystem(f: Facets): string {
  return [
    "You turn a short request about a guest list into filters for a web page. The list has people who work at leading AI companies and studied in India.",
    "Rules:",
    "- Use only values from the lists below, copied exactly. Leave a filter empty when the request does not mention it.",
    "- Each filter is OR within itself and AND across filters. 'IIT or BITS' -> col: ['g:IIT','c:BITS Pilani (all campuses)'].",
    "- 'IIT' with no campus means the group 'g:IIT'; same for NIT, IIIT and IIM. A named campus is a single college.",
    "- Bangalore = Bengaluru; Bombay = Mumbai; Delhi NCR = Delhi, Gurugram and Noida; Bay Area / SF / Silicon Valley = 'US|SF Bay Area'; NYC = 'US|New York Area'.",
    "- 'founders' or 'CXOs' -> sen: ['Founder / CXO']. 'senior people' -> the three levels Founder / CXO, VP / Director / Head and Principal / Staff. 'leaders' -> Founder / CXO and VP / Director / Head.",
    "- 'ML people', 'researchers', 'engineers', 'PMs', 'sales' map to functions. 'investors' or 'VCs' -> role: ['Investor/Advisor/Board'].",
    "- A proper name that is not a place, college or company is probably a person: put it in keyword.",
    "- Do not invent people or counts. Do not answer the request; only set filters.",
    "",
    list("Regions", f.regions),
    list("Places (region|place)", f.places),
    list("AI company categories", f.categories),
    list("Seniority", f.seniority),
    list("Functions", f.functions),
    list("Role types", f.roleTypes),
    list("Education levels", f.education),
    list("College groups", f.collegeGroups),
    list("Colleges", f.colleges),
    list("Companies", f.companies),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** What Claude returns for /ask. */
export const AskOutput = z.object({
  summary: z.string().describe("Two or three sentences on how the picks were chosen"),
  picks: z.array(
    z.object({
      id: z.number().int().describe("The person's row number from the roster"),
      reason: z.string().describe("One line, under 25 words, on why this person fits"),
    }),
  ),
});
export type Picks = z.infer<typeof AskOutput>;

export const ASK_SYSTEM = [
  "You help a venture fund choose guests for its events from a roster of people at leading AI companies who studied in India.",
  "The roster is below, one person per line: id | name | title | company | category | role type | location | colleges.",
  "When asked for a shortlist, pick people from the roster only, using their row ids. Never invent a person.",
  "Prefer a mix of companies unless told otherwise, respect any count the user gives (default 15), and respect location constraints strictly.",
  "Reasons must come from the roster fields (title, company, college, city); do not guess facts that are not there.",
  "If the request cannot be met from the roster, say so in the summary and return the closest matches.",
].join("\n");
