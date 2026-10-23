# Event Guest List

A searchable, filterable page of people at leading AI companies, used to pick guests for Together Fund events.
It is a static site that runs on GitHub Pages. There is no server and no build step.

## How it works

- **Backend:** `data/guest-list.xlsx`. The page reads all four tabs straight from this file:
  - `Master People List` → the **Guests** tab
  - `Results by Category` → the **Companies** tab
  - `No Matches Found` → the **No matches found** tab
  - `Coverage Summary` → the **Coverage & method** tab
- **Cleanup rules:** `normalize.js` merges college spellings (for example "IIT Delhi" and "Indian Institute of Technology, Delhi"), groups locations (US / India / rest of world, then cities), and works out seniority and function from titles.
- **Search:** `search.js` handles short forms (IITB, KGP, BLR, SF, CXO…), typos, best-match ranking and the suggestions under the search bar. To add a short form, add a line to `ALIASES` (or `PLACE_ALIASES` for places).
- **Page:** `index.html` + `app.js`, styled in Together colours.

## Updating the list

1. Replace `data/guest-list.xlsx` with the new version. Keep the same tab names and column headers. Column order can change.
2. Commit and push. GitHub Pages republishes in about a minute.

## Fixing a college that is grouped wrong

Open `normalize.js` and find `COLLEGE_RULES`. Each line is `[pattern, name, group]`, and the first pattern that matches wins.
To merge a new spelling, add it to the pattern of the right college. To add a college, add a new line above the general ones.

## Publishing on GitHub Pages

1. Create a GitHub repository and push this folder to it.
2. In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, then save.
3. The site appears at `https://<your-org>.github.io/<repo-name>/`.

Anyone with the link can see a GitHub Pages site, even when the repository is private. The page tells search engines not to index it, but it has no password.

## Running it locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly from disk will not work, because the browser blocks it from reading the spreadsheet.

## Features

- Search across names, titles, companies, colleges and locations. Press `/` to jump to the search box.
  - Understands short forms: “IITB founders”, “KGP”, “BLR ML”, “Delhi NCR”, “SF researchers”.
  - Tolerates typos (“Bengluru”, “Cartesa”) and shows the best matches first.
  - Suggestions appear as you type; pick a college, company or city to filter by it.
- Quick picks for common lists, such as founders and CXOs, IIT alumni in Bengaluru, or senior engineers in the Bay Area.
- Filters: location (region → city or metro), AI company category, company, title (seniority, function, or "title contains"), role type, college (one college or a whole group such as all IITs), education level, and LinkedIn URL.
- Click any company, city or college tag in the table to filter by it.
- Shortlist: star people (☆), then click **Shortlist** to see only them. The shortlist is saved in your own browser.
- **Export CSV** downloads the people currently shown, or your shortlist.
- **Copy link** shares the exact filtered view. Filters are stored in the URL.
