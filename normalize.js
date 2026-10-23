/*
 * Normalization rules for the Event Guest List.
 *
 * The backend spreadsheet stores raw, LinkedIn-style text. These rules turn it
 * into clean filter values:
 *   - colleges():  "IIT Delhi", "Indian Institute of Technology, Delhi" -> "IIT Delhi"
 *   - location():  "Bangalore Urban, Karnataka, India" -> India / Bengaluru
 *   - titleTags(): "Sr. Staff ML Engineer" -> seniority + function
 *
 * To fix a mis-grouped college, add or edit a rule in COLLEGE_RULES below.
 * Rules are checked top to bottom; the first match wins.
 * Works in the browser (window.Normalize) and in Node (require) for testing.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- colleges

  const IIT_CAMPUS = [
    [/banaras|\bbhu\b|varanasi/, "IIT (BHU) Varanasi"],
    [/dhanbad|\bism\b|school of mines/, "IIT (ISM) Dhanbad"],
    [/bombay|mumbai|powai/, "IIT Bombay"],
    [/delhi/, "IIT Delhi"],
    [/madras|chennai/, "IIT Madras"],
    [/kanpur/, "IIT Kanpur"],
    [/kharagpur|\bkgp\b/, "IIT Kharagpur"],
    [/roorkee/, "IIT Roorkee"],
    [/guwahati/, "IIT Guwahati"],
    [/hyderabad/, "IIT Hyderabad"],
    [/gandhinagar/, "IIT Gandhinagar"],
    [/indore/, "IIT Indore"],
    [/mandi/, "IIT Mandi"],
    [/patna/, "IIT Patna"],
    [/bhubaneswar/, "IIT Bhubaneswar"],
    [/jodhpur/, "IIT Jodhpur"],
    [/ropar|rupnagar/, "IIT Ropar"],
    [/tirupati/, "IIT Tirupati"],
    [/palakkad/, "IIT Palakkad"],
    [/\bgoa\b/, "IIT Goa"],
    [/jammu/, "IIT Jammu"],
    [/bhilai/, "IIT Bhilai"],
    [/dharwad/, "IIT Dharwad"],
  ];

  const NIT_CAMPUS = [
    [/tiruchirappalli|trichy|tiruchirapalli/, "NIT Trichy"],
    [/karnataka|surathkal/, "NIT Karnataka (Surathkal)"],
    [/warangal/, "NIT Warangal"],
    [/calicut|kozhikode/, "NIT Calicut"],
    [/rourkela/, "NIT Rourkela"],
    [/raipur/, "NIT Raipur"],
    [/kurukshetra/, "NIT Kurukshetra"],
    [/silchar/, "NIT Silchar"],
    [/jamshedpur/, "NIT Jamshedpur"],
    [/uttarakhand/, "NIT Uttarakhand"],
    [/surat/, "SVNIT Surat"],
    [/durgapur/, "NIT Durgapur"],
    [/hamirpur/, "NIT Hamirpur"],
    [/patna/, "NIT Patna"],
    [/jalandhar/, "NIT Jalandhar"],
    [/srinagar/, "NIT Srinagar"],
    [/agartala/, "NIT Agartala"],
    [/goa/, "NIT Goa"],
  ];

  const IIIT_CAMPUS = [
    [/hyderabad|iiith/, "IIIT Hyderabad"],
    [/bangalore|bengaluru|iiitb/, "IIIT Bangalore"],
    [/delhi|iiitd/, "IIIT Delhi"],
    [/allahabad/, "IIIT Allahabad"],
    [/nagpur/, "IIIT Nagpur"],
    [/kerala|tech & mgt/, "IIITM Kerala"],
    [/gwalior/, "IIITM Gwalior"],
    [/pune/, "IIIT Pune"],
    [/jabalpur/, "IIITDM Jabalpur"],
    [/kancheepuram/, "IIITDM Kancheepuram"],
  ];

  const IIM_CAMPUS = [
    [/ahmedabad/, "IIM Ahmedabad"],
    [/bangalore|bengaluru/, "IIM Bangalore"],
    [/calcutta|kolkata/, "IIM Calcutta"],
    [/lucknow/, "IIM Lucknow"],
    [/kozhikode/, "IIM Kozhikode"],
    [/indore/, "IIM Indore"],
    [/sambalpur/, "IIM Sambalpur"],
    [/udaipur/, "IIM Udaipur"],
    [/shillong/, "IIM Shillong"],
    [/raipur/, "IIM Raipur"],
    [/trichy|tiruchirappalli/, "IIM Trichy"],
    [/rohtak/, "IIM Rohtak"],
    [/mumbai/, "IIM Mumbai"],
  ];

  const pickCampus = (s, table, fallback) => {
    for (const [re, name] of table) if (re.test(s)) return name;
    return fallback;
  };

  // Each rule: [test, canonical name | function(s) -> name, group, extra names]
  // "extra" adds parent memberships, e.g. a DU college also counts as University of Delhi.
  const DU = "University of Delhi";
  const COLLEGE_RULES = [
    // Institutions the source sheet matched by mistake (none of them are in India).
    // Never drop anyone: every entry becomes a filter value so no person goes missing.
    [/susquehanna/, "Susquehanna University (USA)", "No Indian institution listed"],
    [/university of the punjab|hailey college/, "University of the Punjab (Pakistan)", "No Indian institution listed"],
    [/university of central punjab/, "University of Central Punjab (Pakistan)", "No Indian institution listed"],
    [/punjab college of information technology/, "Punjab College of IT (Pakistan)", "No Indian institution listed"],
    [/cincinnati/, "St. Xavier High School, Cincinnati (USA)", "No Indian institution listed"],
    [/iit institute of design|illinois institute/, "Illinois Institute of Technology, Chicago (USA)", "No Indian institution listed"],
    [/st\.? stephen'?s episcopal/, "St. Stephen's Episcopal School (USA)", "No Indian institution listed"],
    [/^no education on record$/, "No education on record", "No Indian institution listed"],
    [/^early career at/, null],

    // IIT family
    [/indian institute of technology|\biit\b/, (s) => pickCampus(s, IIT_CAMPUS, "IIT (campus not specified)"), "IIT"],
    // IIIT family
    [/international institute of information tech|indian institute of information tech|\biiit/, (s) => pickCampus(s, IIIT_CAMPUS, "IIIT (campus not specified)"), "IIIT"],
    // IIM family
    [/indian institute of management|\biim\b/, (s) => pickCampus(s, IIM_CAMPUS, "IIM (campus not specified)"), "IIM"],
    // NIT family (named NITs first)
    [/motilal nehru national institute|\bmnnit\b/, "NIT Allahabad (MNNIT)", "NIT"],
    [/visvesvaraya national institute|\bvnit\b/, "VNIT Nagpur", "NIT"],
    [/maulana azad national institute|\bmanit\b/, "MANIT Bhopal", "NIT"],
    [/malaviya national institute|\bmnit\b/, "MNIT Jaipur", "NIT"],
    [/sardar vallabhbhai national institute|\bsvnit\b/, "SVNIT Surat", "NIT"],
    [/ambedkar national institute/, "NIT Jalandhar", "NIT"],
    [/national institute of technology|\bnit\b/, (s) => pickCampus(s, NIT_CAMPUS, "NIT (campus not specified)"), "NIT"],

    // BITS and BIT
    [/bitsom|bits school of management/, "BITS School of Management (BITSoM)", "Top institutes"],
    [/birla institute of technology and science|\bbits\b/, "BITS Pilani (all campuses)", "Top institutes"],
    [/birla vishvakarma|birla vishwakarma|\bbvm\b/, "Birla Vishvakarma Mahavidyalaya (BVM)", "Other colleges & universities"],
    [/b\. ?k\. birla institute/, "B. K. Birla Institute of Engineering & Technology, Pilani", "Other colleges & universities"],
    [/birla institute of technology/, "BIT Mesra", "Top institutes"],

    // Science, design, law, business
    [/iiser|indian institute of science education/, "IISER", "Top institutes"],
    [/indian institute of science\b|\biisc\b/, "IISc Bangalore", "Top institutes"],
    [/indian school of business|\bisb\b/, "Indian School of Business (ISB)", "Top institutes"],
    [/national institute of design/, "National Institute of Design (NID)", "Top institutes"],
    [/national institute of fashion technology|\bnift\b/, "NIFT", "Other colleges & universities"],
    [/national law school of india/, "NLSIU Bangalore", "Top institutes"],
    [/juridical sciences/, "NUJS Kolkata", "Top institutes"],
    [/all india institute of medical/, "AIIMS", "Top institutes"],
    [/chartered accountants of india|^icai$/, "ICAI (Chartered Accountant)", "Other colleges & universities"],
    [/management development institute/, "MDI Gurgaon", "Other colleges & universities"],
    [/xlri|xavier school of management/, "XLRI", "Top institutes"],
    [/sp jain/, "SP Jain", "Other colleges & universities"],

    // Delhi
    [/delhi technological university|delhi college of engineering|\bdce\b|\bdtu\b/, "DTU (formerly DCE)", "Other colleges & universities"],
    [/netaji subhas|\bnsit\b|\bnsut\b/, "NSUT (formerly NSIT)", "Other colleges & universities"],
    [/st\.? stephen'?s college/, "St. Stephen's College", "Other colleges & universities", [DU]],
    [/hansraj college/, "Hansraj College", "Other colleges & universities", [DU]],
    [/lady shri ram/, "Lady Shri Ram College", "Other colleges & universities", [DU]],
    [/shri ram college of commerce|\bsrcc\b/, "SRCC", "Other colleges & universities", [DU]],
    [/kirori mal/, "Kirori Mal College", "Other colleges & universities", [DU]],
    [/sri venkateswara college,? (delhi|university of delhi)/, "Sri Venkateswara College (DU)", "Other colleges & universities", [DU]],
    [/hindu college/, "Hindu College", "Other colleges & universities", [DU]],
    [/university of delhi|delhi university/, DU, "Other colleges & universities"],
    [/indraprastha university|\bggsipu\b/, "GGSIP University", "Other colleges & universities"],
    [/banaras hindu university/, "Banaras Hindu University (BHU)", "Other colleges & universities"],
    [/jawaharlal nehru university/, "JNU", "Other colleges & universities"],
    [/jamia millia/, "Jamia Millia Islamia", "Other colleges & universities"],
    [/ashoka university/, "Ashoka University", "Other colleges & universities"],
    [/shiv nadar/, "Shiv Nadar University", "Other colleges & universities"],
    [/amity/, "Amity University", "Other colleges & universities"],

    // Mumbai
    [/institute of chemical technology|department of chemical technology|\budct\b/, "ICT Mumbai (UDCT)", "Other colleges & universities"],
    [/veermata|\bvjti\b/, "VJTI Mumbai", "Other colleges & universities"],
    [/sardar patel institute of technology|\bspit\b/, "SPIT Mumbai", "Other colleges & universities"],
    [/sardar patel college of engineering/, "SPCE Mumbai", "Other colleges & universities"],
    [/somaiya/, "K. J. Somaiya", "Other colleges & universities"],
    [/narsee monjee|\bnmims\b/, "NMIMS", "Other colleges & universities"],
    [/mithibai/, "Mithibai College", "Other colleges & universities", ["University of Mumbai"]],
    [/ruia college/, "Ramnarain Ruia College", "Other colleges & universities", ["University of Mumbai"]],
    [/conceicao rodrigues/, "Fr. Conceicao Rodrigues College of Engineering", "Other colleges & universities", ["University of Mumbai"]],
    [/st\.? francis institute of technology/, "St. Francis Institute of Technology", "Other colleges & universities", ["University of Mumbai"]],
    [/simsree/, "SIMSREE", "Other colleges & universities", ["University of Mumbai"]],
    [/university of mumbai|mumbai university/, "University of Mumbai", "Other colleges & universities"],

    // Pune
    [/college of engineering,? pune|\bcoep\b/, "COEP Pune", "Other colleges & universities"],
    [/pune institute of computer technology|\bpict\b/, "PICT Pune", "Other colleges & universities"],
    [/vishwakarma institute/, "Vishwakarma Institute of Technology (VIT Pune)", "Other colleges & universities"],
    [/vishwakarma university/, "Vishwakarma University", "Other colleges & universities"],
    [/symbiosis school -? ?pune/, "Symbiosis School, Pune", "Schools"],
    [/symbiosis/, "Symbiosis (all institutes)", "Other colleges & universities"],
    [/fergusson/, "Fergusson College", "Other colleges & universities", ["Savitribai Phule Pune University"]],
    [/marathwada mitra mandal/, "MMCOE Pune", "Other colleges & universities", ["Savitribai Phule Pune University"]],
    [/university of pune|pune university|savitribai phule/, "Savitribai Phule Pune University", "Other colleges & universities"],
    [/maharashtra institute of technology aurangabad/, "MIT Aurangabad", "Other colleges & universities"],
    [/maharashtra institute of technology/, "Maharashtra Institute of Technology (MIT Pune)", "Other colleges & universities"],

    // South
    [/vellore institute|\bvit\b|vit_|vit university/, "VIT Vellore", "Other colleges & universities"],
    [/manipal institute of technology/, "Manipal Institute of Technology", "Other colleges & universities", ["Manipal Academy of Higher Education"]],
    [/manipal university jaipur/, "Manipal University Jaipur", "Other colleges & universities"],
    [/sikkim manipal/, "Sikkim Manipal University", "Other colleges & universities"],
    [/manipal/, "Manipal Academy of Higher Education", "Other colleges & universities"],
    [/\bsrm\b|sri ramaswamy/, "SRM Institute of Science & Technology", "Other colleges & universities"],
    [/college of engineering,? guindy/, "College of Engineering Guindy", "Other colleges & universities", ["Anna University"]],
    [/\banna university/, "Anna University", "Other colleges & universities"],
    [/university of madras/, "University of Madras", "Other colleges & universities"],
    [/visvesvaraya technological|\bvtu\b/, "VTU", "Other colleges & universities"],
    [/r\.? ?v\.? college of engineering|\brvce\b/, "RV College of Engineering", "Other colleges & universities"],
    [/\bpes\b|p e s institute|\bpesit\b/, "PES University", "Other colleges & universities"],
    [/b\.? ?m\.? ?s\.? college of engineering|\bbmsce\b/, "BMS College of Engineering", "Other colleges & universities"],
    [/ramaiah/, "M. S. Ramaiah Institute of Technology", "Other colleges & universities"],
    [/national institute of engineering|^nie\b/, "NIE Mysore", "Other colleges & universities"],
    [/jayachamarajendra|\bsjce\b/, "SJCE Mysore", "Other colleges & universities"],
    [/bangalore institute of technology/, "Bangalore Institute of Technology", "Other colleges & universities"],
    [/bangalore university/, "Bangalore University", "Other colleges & universities"],
    [/christ university/, "Christ University", "Other colleges & universities"],
    [/mount carmel college/, "Mount Carmel College", "Other colleges & universities"],
    [/amrita/, "Amrita Vishwa Vidyapeetham", "Other colleges & universities"],
    [/\bpsg\b/, "PSG College of Technology", "Other colleges & universities"],
    [/coimbatore institute of technology/, "Coimbatore Institute of Technology", "Other colleges & universities"],
    [/karunya/, "Karunya Institute of Technology", "Other colleges & universities"],
    [/sathyabama/, "Sathyabama Institute", "Other colleges & universities"],
    [/hindustan university/, "Hindustan University", "Other colleges & universities"],
    [/sri venkateswara college of engineering/, "Sri Venkateswara College of Engineering", "Other colleges & universities"],
    [/cochin university|\bcusat\b/, "CUSAT", "Other colleges & universities"],
    [/jawaharlal nehru technological|\bjntu/, "JNTU", "Other colleges & universities"],
    [/osmania/, "Osmania University", "Other colleges & universities"],
    [/chaitanya bharathi/, "CBIT Hyderabad", "Other colleges & universities"],
    [/andhra university/, "Andhra University", "Other colleges & universities"],

    // East
    [/jadavpur/, "Jadavpur University", "Other colleges & universities"],
    [/university of calcutta|calcutta university/, "University of Calcutta", "Other colleges & universities"],
    [/st\.? xavier'?s college/, "St. Xavier's College", "Other colleges & universities"],
    [/west bengal university of technology/, "WBUT (MAKAUT)", "Other colleges & universities"],

    // West / Central
    [/dhirubhai ambani institute of information|dhirubhai ambani university|\bda-?iict\b/, "DA-IICT Gandhinagar", "Other colleges & universities"],
    [/institute for excellence in higher education|\biehe\b/, "IEHE Bhopal", "Other colleges & universities"],
    [/rashtriya raksha/, "Rashtriya Raksha University", "Other colleges & universities"],
    [/pondicherry/, "Pondicherry University / Engineering College", "Other colleges & universities"],
    [/\bkiit\b(?!.*school)/, "KIIT University", "Other colleges & universities"],
    [/\bnirma\b/, "Nirma University", "Other colleges & universities"],
    [/ahmedabad university/, "Ahmedabad University", "Other colleges & universities"],
    [/gujarat technological/, "Gujarat Technological University", "Other colleges & universities"],
    [/gujarat university/, "Gujarat University", "Other colleges & universities"],
    [/rajiv gandhi prodyogiki|\brgpv\b/, "RGPV Bhopal", "Other colleges & universities"],
    [/medi-?caps/, "Medi-Caps Indore", "Other colleges & universities"],
    [/ips academy/, "IPS Academy Indore", "Other colleges & universities"],

    // North
    [/punjab engineering college/, "Punjab Engineering College (PEC)", "Other colleges & universities"],
    [/thapar/, "Thapar Institute", "Other colleges & universities"],
    [/panjab university/, "Panjab University", "Other colleges & universities"],
    [/chandigarh university/, "Chandigarh University", "Other colleges & universities"],
    [/chandigarh group of colleges/, "Chandigarh Group of Colleges", "Other colleges & universities"],
    [/lovely professional/, "Lovely Professional University", "Other colleges & universities"],
    [/punjab technical university/, "Punjab Technical University", "Other colleges & universities"],
    [/guru nanak dev university/, "Guru Nanak Dev University", "Other colleges & universities"],
    [/aligarh muslim/, "Aligarh Muslim University", "Other colleges & universities"],

    // Schools (multi-branch chains grouped together)
    [/delhi public school|\bdps\b/, "Delhi Public School (all branches)", "Schools"],
    [/kendriya vidyalaya/, "Kendriya Vidyalaya", "Schools"],
    [/sri chaitanya/, "Sri Chaitanya", "Schools"],
    [/narayana/, "Narayana Junior College", "Schools"],
    [/dhirubhai ambani international school/, "Dhirubhai Ambani International School", "Schools"],
    [/la martiniere/, "La Martiniere", "Schools"],
    [/modern school/, "Modern School", "Schools"],
    [/podar/, "R. N. Podar School", "Schools"],
    [/cathedral and john connon/, "Cathedral & John Connon School", "Schools"],
  ];

  const SCHOOL_HINT = /\bschool\b(?! of (business|management|economics|law|engineering))|\bvidyalaya\b|vidyashram|junior college|junior kalasala|high school|convent|\bboard\b|\(icse|ssc\b/;

  // Strip a trailing "(degree, year)" group, including nested parentheses.
  function stripDegree(s) {
    s = s.trim();
    if (!s.endsWith(")")) return s;
    let depth = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === ")") depth++;
      else if (s[i] === "(" && --depth === 0) return s.slice(0, i).trim();
    }
    return s;
  }

  function tidyName(s) {
    s = s.replace(/\s+/g, " ").replace(/[\s,\-–]+$/, "").trim();
    const letters = s.replace(/[^A-Za-z]/g, "");
    if (letters && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) {
      s = s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
    }
    return s;
  }

  // Split on ";" that are not inside parentheses.
  function splitEntries(text) {
    const out = [];
    let depth = 0, cur = "";
    for (const ch of text) {
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (ch === ";" && depth === 0) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }

  const RAW_NAMES = new Map();

  /** Returns [{name, group}] — unique canonical colleges for one person. */
  function colleges(text) {
    const found = new Map();
    const add = (name, group) => { if (name && !found.has(name)) found.set(name, group); };
    for (const entry of splitEntries(String(text || ""))) {
      const raw = stripDegree(entry);
      const s = raw.toLowerCase().replace(/\s+/g, " ");
      if (!s) continue;
      let matched = false;
      for (const [re, name, group, extra] of COLLEGE_RULES) {
        if (!re.test(s)) continue;
        matched = true;
        const n = typeof name === "function" ? name(s) : name;
        if (n) {
          add(n, group);
          (extra || []).forEach((e) => add(e, "Other colleges & universities"));
        }
        break;
      }
      if (!matched) {
        // Unlisted names: merge spellings that differ only in case or punctuation.
        const key = s.replace(/[^a-z0-9]+/g, " ").trim();
        if (!RAW_NAMES.has(key)) RAW_NAMES.set(key, tidyName(raw));
        add(RAW_NAMES.get(key), SCHOOL_HINT.test(s) ? "Schools" : "Other colleges & universities");
      }
    }
    return [...found].map(([name, group]) => ({ name, group }));
  }

  // ---------------------------------------------------------------- location

  const INDIA_CITIES = [
    [/bengaluru|bangalore|banglore|bengalore|bangaluru/, "Bengaluru"],
    [/mumbai|navi mumbai|thane/, "Mumbai"],
    [/hyderabad|secunderabad/, "Hyderabad"],
    [/chennai/, "Chennai"],
    [/gurugram|gurgaon/, "Gurugram"],
    [/noida/, "Noida"],
    [/delhi/, "Delhi"],
    [/pune/, "Pune"],
    [/ahmedabad/, "Ahmedabad"],
    [/chandigarh/, "Chandigarh"],
    [/indore/, "Indore"],
    [/dehradun/, "Dehradun"],
    [/kolkata|calcutta/, "Kolkata"],
    [/\bgoa\b/, "Goa"],
    [/\bgaya\b/, "Gaya"],
    [/paramathivelur/, "Paramathi Velur (Tamil Nadu)"],
    [/jaipur/, "Jaipur"],
    [/kochi|cochin/, "Kochi"],
  ];

  const US_METROS = [
    [/san francisco|\bsf\b|bay area|palo alto|mountain view|san mateo|redwood city|san jose|sunnyvale|santa clara|menlo park|oakland|berkeley|fremont|cupertino|los altos|stanford|hayward|pleasanton|san leandro|walnut creek|sausalito|livermore/, "SF Bay Area"],
    [/new york|\bnyc\b|brooklyn|manhattan|jersey city|\bny\b/, "New York Area"],
    [/seattle|bellevue|redmond|sammamish/, "Seattle Area"],
    [/los angeles|\bla\b|santa monica|irvine|covina|mission viejo|lake forest|orange county/, "Los Angeles / SoCal"],
    [/san diego|ramona/, "San Diego"],
    [/boston|cambridge, massachusetts|watertown|lowell/, "Boston Area"],
    [/pittsburgh/, "Pittsburgh"],
    [/chapel hill|raleigh|durham|charlotte|north carolina/, "North Carolina"],
    [/austin|dallas|plano|mckinney|texas|, tx/, "Texas"],
    [/washington d\.?c|arlington, virginia|germantown/, "Washington DC Area"],
  ];

  const US_HINT = /united states|estados unidos|\bus\b|\busa\b|california|, ca\b|, wa\b|, ma\b|, md\b|, ut\b|, oh\b|, az\b|, ny\b|, tx\b|, nj\b|new jersey|florida|georgia|minnesota|michigan|oregon|utah|arizona|massachusetts|pennsylvania|virginia|tennessee|connecticut|hartford|nashville|phoenix|portland|salt lake|cincinnati|orlando|miami|atlanta|minneapolis|elk grove|ann arbor/;

  const COUNTRIES = [
    [/united kingdom|london|england|worthing|\buk\b/, "United Kingdom"],
    [/germany|berlin|munich|stuttgart|freiburg|köln|koln|bonn|vaihingen/, "Germany"],
    [/canada|toronto|vancouver|waterloo|calgary|ontario/, "Canada"],
    [/france|paris|mougins/, "France"],
    [/united arab emirates|dubai|abu dhabi/, "UAE"],
    [/switzerland|zurich/, "Switzerland"],
    [/singapore/, "Singapore"],
    [/ireland|dublin, dublin/, "Ireland"],
    [/denmark|copenhagen/, "Denmark"],
    [/sweden|stockholm/, "Sweden"],
    [/netherlands|amsterdam/, "Netherlands"],
    [/ghent|belgium/, "Belgium"],
    [/barcelona|spain|madrid/, "Spain"],
    [/tel aviv|israel/, "Israel"],
    [/pakistan|lahore|islamabad|islāmābād/, "Pakistan"],
    [/saudi|riyadh/, "Saudi Arabia"],
    [/korea|seoul/, "South Korea"],
    [/australia|sydney|melbourne/, "Australia"],
  ];

  const INDIA_HINT = /india|karnataka|maharashtra|telangana|tamil nadu|haryana|uttar pradesh|gujarat|bihar|uttarakhand|madhya pradesh/;

  function placeOf(part) {
    const s = part.toLowerCase().trim();
    if (!s) return null;
    for (const [re, city] of INDIA_CITIES) if (re.test(s)) return { region: "India", place: city };
    if (INDIA_HINT.test(s)) return { region: "India", place: "India – city not listed" };
    // Countries checked before US so "Dublin, Dublin, Ireland" or "London" do not leak into the US.
    // "Dublin, OH" is handled by the US hint first.
    if (/, oh\b/.test(s)) return { region: "US", place: "Other US" };
    for (const [re, country] of COUNTRIES) if (re.test(s)) return { region: "Rest of world", place: country };
    for (const [re, metro] of US_METROS) if (re.test(s)) return { region: "US", place: metro };
    if (US_HINT.test(s)) return { region: "US", place: "Other US" };
    if (/north america/.test(s)) return { region: "US", place: "Other US" };
    return null;
  }

  /** Returns [{region, place}] — a person listing two cities gets both. */
  function location(text) {
    const raw = String(text || "").replace(/·.*$/, "").trim();
    if (!raw) return [{ region: "Unknown", place: "Not listed" }];
    const parts = raw.split(/\s*[|/]\s*|\s+and\s+/i);
    const seen = new Map();
    for (const p of parts) {
      const hit = placeOf(p);
      if (hit) seen.set(hit.region + "|" + hit.place, hit);
    }
    if (!seen.size) return [{ region: "Unknown", place: /remote/i.test(raw) ? "Remote" : raw }];
    return [...seen.values()];
  }

  // ---------------------------------------------------------------- titles

  function seniority(title, roleType) {
    const t = String(title || "").toLowerCase();
    if (/investor|advisor|board/i.test(roleType || "")) return "Investor / Advisor / Board";
    if (roleType === "Founder/CXO" || /founder|\bchief\b|\bc[etofp]o\b|\bceo\b|\bpresident\b/.test(t)) return "Founder / CXO";
    if (/\bvp\b|vice president|\bhead\b|director|general manager|\bgm\b|\bpartner\b/.test(t)) return "VP / Director / Head";
    if (/principal|staff|distinguished|fellow|architect/.test(t)) return "Principal / Staff";
    if (/manager|\blead\b|team lead|\btl\b/.test(t)) return "Manager / Lead";
    if (/intern|apprentice|trainee/.test(t)) return "Intern";
    if (/senior|\bsr\.?\b|\biii\b|\bii\b/.test(t)) return "Senior";
    return "Individual contributor";
  }

  const FUNCTIONS = [
    [/research|scientist|\bphd\b|postdoc/, "Research & Science"],
    [/machine learning|artificial intelligence|\bml\b|\bmle\b|\bai\b|reinforcement|deep learning|computer vision|\bnlp\b|\bllm/, "AI / ML Engineering"],
    [/data|analytics|analyst/, "Data & Analytics"],
    [/security|detection/, "Security"],
    [/engineer|developer|software|swe|\bsde|tpm|technical program|technical lead|tester|technologist|architect|technical artist|platform|technical staff|\bmts\b|programmer|devops|sre|infrastructure|firmware|hardware|robotics|mechanical|electrical/, "Engineering"],
    [/product/, "Product"],
    [/design|ux|ui\b|creative/, "Design"],
    [/sales|account executive|business development|\bbd\b|partnership|revenue|account manager|gtm|go-to-market/, "Sales & BD"],
    [/clay|instantly|certified|expert|creator|ambassador|evangelist|writer/, "Community & Ecosystem"],
    [/marketing|growth|brand|content|community|communications/, "Marketing & Growth"],
    [/solution|deployment strategist|consultant|success|support|forward deployed|implementation|technical account/, "Customer & Solutions"],
    [/finance|accounting|controller|\bcfo\b/, "Finance"],
    [/legal|counsel|compliance|attorney/, "Legal"],
    [/recruit|talent|people|\bhr\b|human resources/, "People & Talent"],
    [/operations|\bops\b|chief of staff|program manager|strategy|strategic|supply|sourcing|inventory|buyer|\bnpi\b/, "Operations & Strategy"],
    [/founder|founding|ceo|cto|coo|chief|president|general manager|country manager|head of|leading/, "Leadership"],
    [/investor|advisor|board|partner/, "Investing & Advisory"],
  ];

  function functionOf(title) {
    const t = String(title || "").toLowerCase();
    for (const [re, f] of FUNCTIONS) if (re.test(t)) return f;
    return "Other";
  }

  const api = { colleges, location, seniority, functionOf, stripDegree, splitEntries };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Normalize = api;
})(typeof window !== "undefined" ? window : globalThis);
