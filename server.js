const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const MLB_API = "https://statsapi.mlb.com/api/v1";

const CURRENT_SEASON = 2026;
const METS_ID = 121;
const MLB_SPORT_ID = 1;

// ============================================================
// EXPRESS CONFIGURATION
// ============================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// IMPORTANT:
// All frontend files are inside /public
const PUBLIC_DIR = path.join(__dirname, "public");

// Serve index.html, style.css, app.js, etc. from /public
app.use(express.static(PUBLIC_DIR));

// ============================================================
// GENERAL HELPERS
// ============================================================

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function round(value, decimals = 3) {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const factor = Math.pow(10, decimals);

  return Math.round(n * factor) / factor;
}

function normalizeName(name) {
  return cleanString(name)
    .toLowerCase()
    .replace(/[.'’,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDate(date) {
  const d = new Date(date);

  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateISO(date) {
  const d = safeDate(date);

  if (!d) {
    return null;
  }

  return d.toISOString().split("T")[0];
}

function todayISO() {
  return formatDateISO(new Date());
}

function dateDaysAgo(days) {
  const d = new Date();

  d.setDate(d.getDate() - days);

  return formatDateISO(d);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);

  d.setDate(d.getDate() + days);

  return formatDateISO(d);
}

// ============================================================
// MLB API CLIENT
// ============================================================

async function mlb(endpoint, params = {}) {
  const url = new URL(
    `${MLB_API}/${endpoint.replace(/^\/+/, "")}`
  );

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  console.log(`MLB API → ${url.toString()}`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mets-HQ/2.0"
    }
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `MLB API returned invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `MLB API error ${response.status}`
    );
  }

  return data;
}

// ============================================================
// PLAYER SEARCH
// ============================================================

async function searchPlayers(query) {
  const q = cleanString(query);

  if (!q) {
    return [];
  }

  const data = await mlb("people/search", {
    q
  });

  return Array.isArray(data?.people)
    ? data.people
    : [];
}

async function findPlayer(query) {
  const q = cleanString(query);

  if (!q) {
    return null;
  }

  const candidates = await searchPlayers(q);

  if (!candidates.length) {
    return null;
  }

  const normalizedQuery = normalizeName(q);

  const exact = candidates.find(
    person =>
      normalizeName(person.fullName) === normalizedQuery
  );

  if (exact) {
    return exact;
  }

  const startsWith = candidates.find(
    person =>
      normalizeName(person.fullName).startsWith(normalizedQuery)
  );

  if (startsWith) {
    return startsWith;
  }

  return candidates[0];
}

// ============================================================
// METS ROSTER
// ============================================================

async function getMetsRoster(season = CURRENT_SEASON) {
  const data = await mlb(`teams/${METS_ID}/roster`, {
    season,
    rosterType: "fullSeason"
  });

  return Array.isArray(data?.roster)
    ? data.roster
    : [];
}

async function getActiveMetsRoster() {
  const data = await mlb(`teams/${METS_ID}/roster`, {
    season: CURRENT_SEASON,
    rosterType: "active"
  });

  return Array.isArray(data?.roster)
    ? data.roster
    : [];
}

async function getActiveMetsIds() {
  const roster = await getActiveMetsRoster();

  return new Set(
    roster
      .map(player => player?.person?.id || player?.id)
      .filter(Boolean)
      .map(String)
  );
}

// ============================================================
// STANDINGS
// ============================================================

app.get("/api/mets/standings", async (req, res) => {
  try {
    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlb("standings", {
      leagueId: "104,103",
      season,
      standingsTypes: "regularSeason"
    });

    const records = [];

    for (const record of data?.records || []) {
      for (const teamRecord of record?.teamRecords || []) {
        records.push(teamRecord);
      }
    }

    const mets = records.find(
      record =>
        Number(record?.team?.id) === METS_ID
    );

    res.json({
      success: true,
      mets: mets || null,
      standings: records
    });
  } catch (error) {
    console.error("Standings error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// GAMES
// ============================================================

app.get("/api/mets/games", async (req, res) => {
  try {
    const startDate =
      req.query.startDate || dateDaysAgo(14);

    const endDate =
      req.query.endDate ||
      addDays(todayISO(), 21);

    const data = await mlb("schedule", {
      sportId: MLB_SPORT_ID,
      teamId: METS_ID,
      startDate,
      endDate,
      hydrate: "linescore,probablePitcher,team"
    });

    const games = [];

    for (const date of data?.dates || []) {
      for (const game of date?.games || []) {
        games.push(game);
      }
    }

    res.json({
      success: true,
      games
    });
  } catch (error) {
    console.error("Games error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// FULL METS ROSTER
// ============================================================

app.get("/api/mets/roster", async (req, res) => {
  try {
    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const roster = await getMetsRoster(season);

    const activeRoster =
      season === CURRENT_SEASON
        ? await getActiveMetsRoster()
        : [];

    const activeIds = new Set(
      activeRoster
        .map(p => p?.person?.id || p?.id)
        .filter(Boolean)
        .map(String)
    );

    const result = roster.map(player => {
      const id =
        player?.person?.id ||
        player?.id ||
        null;

      return {
        ...player,

        playerId: id,

        isActive:
          season === CURRENT_SEASON
            ? activeIds.has(String(id))
            : false,

        statusDescription:
          player?.status?.description ||
          player?.status?.code ||
          "Unknown"
      };
    });

    res.json({
      success: true,
      roster: result,
      activePlayerIds: [...activeIds]
    });
  } catch (error) {
    console.error("Roster error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// STATS
// ============================================================

app.get("/api/mets/stats", async (req, res) => {
  try {
    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const data = await mlb("stats", {
      stats: "season",
      group,
      season,
      teamIds: METS_ID,
      sportIds: MLB_SPORT_ID,
      hydrate: "person,team"
    });

    const splits =
      Array.isArray(data?.stats)
        ? data.stats.flatMap(groupData =>
            Array.isArray(groupData?.splits)
              ? groupData.splits
              : []
          )
        : [];

    // IMPORTANT:
    // Do NOT filter stats to only active players.
    // This allows everyone who played for the Mets
    // during the season to remain visible.
    const stats = splits.map(split => {
      const person = split?.player || {};

      return {
        ...split,

        playerId:
          person?.id ||
          split?.player?.id ||
          null,

        playerName:
          person?.fullName ||
          "Unknown Player"
      };
    });

    res.json({
      success: true,
      stats,
      group,
      season
    });
  } catch (error) {
    console.error("Stats error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PLAYER PROFILE
// ============================================================

app.get("/api/player/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const data = await mlb(
      `people/${encodeURIComponent(id)}`
    );

    const player =
      data?.people?.[0] || null;

    if (!player) {
      return res.status(404).json({
        success: false,
        error: "Player not found."
      });
    }

    res.json({
      success: true,
      player
    });
  } catch (error) {
    console.error("Player error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PLAYER SEASON STATS
// ============================================================

app.get("/api/player/:id/stats", async (req, res) => {
  try {
    const id = req.params.id;

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const data = await mlb(
      `people/${encodeURIComponent(id)}/stats`,
      {
        stats: "season",
        season,
        group
      }
    );

    const splits =
      Array.isArray(data?.stats)
        ? data.stats.flatMap(
            groupData =>
              Array.isArray(groupData?.splits)
                ? groupData.splits
                : []
          )
        : [];

    res.json({
      success: true,
      stats: splits,
      group,
      season
    });
  } catch (error) {
    console.error("Player season stats:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PLAYER GAME LOG
// ============================================================

app.get("/api/player/:id/games", async (req, res) => {
  try {
    const id = req.params.id;

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const data = await mlb(
      `people/${encodeURIComponent(id)}/stats`,
      {
        stats: "gameLog",
        season,
        group
      }
    );

    const splits =
      Array.isArray(data?.stats)
        ? data.stats.flatMap(
            groupData =>
              Array.isArray(groupData?.splits)
                ? groupData.splits
                : []
          )
        : [];

    res.json({
      success: true,
      games: splits,
      season,
      group
    });
  } catch (error) {
    console.error("Game log:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// TRANSACTIONS
// ============================================================

app.get("/api/mets/transactions", async (req, res) => {
  try {
    const startDate =
      req.query.startDate || dateDaysAgo(45);

    const endDate =
      req.query.endDate || todayISO();

    const data = await mlb("transactions", {
      teamId: METS_ID,
      startDate,
      endDate
    });

    const transactions =
      Array.isArray(data?.transactions)
        ? data.transactions
        : [];

    transactions.sort(
      (a, b) =>
        new Date(b.date) -
        new Date(a.date)
    );

    res.json({
      success: true,
      transactions
    });
  } catch (error) {
    console.error("Transactions:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// MINOR LEAGUE / PROSPECT CENTER
// ============================================================

async function getMetsMinorLeagueTeams() {
  const sports = [11, 12, 13, 14];

  const results = [];

  for (const sportId of sports) {
    try {
      const data = await mlb("teams", {
        sportId,
        season: CURRENT_SEASON
      });

      for (const team of data?.teams || []) {
        const parentId =
          Number(team?.parentOrgId);

        const parentName =
          normalizeName(team?.parentOrgName);

        if (
          parentId === METS_ID ||
          parentName.includes("new york mets") ||
          parentName === "mets"
        ) {
          results.push(team);
        }
      }
    } catch (error) {
      console.warn(
        "Minor league team lookup failed:",
        sportId,
        error.message
      );
    }
  }

  const unique = new Map();

  for (const team of results) {
    if (team?.id) {
      unique.set(String(team.id), team);
    }
  }

  return [...unique.values()];
}

async function getMinorLeagueRoster(teamId) {
  try {
    const data = await mlb(
      `teams/${teamId}/roster`,
      {
        season: CURRENT_SEASON,
        rosterType: "fullSeason"
      }
    );

    return Array.isArray(data?.roster)
      ? data.roster
      : [];
  } catch (error) {
    console.warn(
      "Minor roster error:",
      teamId,
      error.message
    );

    return [];
  }
}

app.get("/api/mets/prospects", async (req, res) => {
  try {
    const teams =
      await getMetsMinorLeagueTeams();

    const allPlayers = [];

    for (const team of teams) {
      const roster =
        await getMinorLeagueRoster(team.id);

      for (const player of roster) {
        const person =
          player?.person || {};

        if (!person.id) {
          continue;
        }

        allPlayers.push({
          id: person.id,

          name:
            person.fullName ||
            "Unknown Player",

          position:
            player?.position?.abbreviation ||
            player?.position?.name ||
            person?.primaryPosition?.abbreviation ||
            "—",

          positionName:
            player?.position?.name ||
            person?.primaryPosition?.name ||
            "Unknown",

          jerseyNumber:
            player?.jerseyNumber ||
            person?.primaryNumber ||
            "—",

          teamId: team.id,

          teamName:
            team.name,

          level:
            team.sport?.name ||
            team.sport?.abbreviation ||
            "Minor League",

          league:
            team.league?.name ||
            "Unknown",

          division:
            team.division?.name ||
            "Unknown",

          status:
            player?.status?.description ||
            player?.status?.code ||
            "Unknown",

          birthDate:
            person.birthDate ||
            null,

          birthCity:
            person.birthCity ||
            null,

          birthState:
            person.birthStateProvince ||
            null,

          birthCountry:
            person.birthCountry ||
            null,

          height:
            person.height ||
            null,

          weight:
            person.weight ||
            null,

          bats:
            person.bats?.description ||
            null,

          throws:
            person.throws?.description ||
            null,

          mlbDebutDate:
            person.mlbDebutDate ||
            null
        });
      }
    }

    const unique = new Map();

    for (const player of allPlayers) {
      unique.set(
        String(player.id),
        player
      );
    }

    res.json({
      success: true,
      teams,
      prospects: [...unique.values()]
    });
  } catch (error) {
    console.error("Prospects:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// RESEARCH ENGINE
// ============================================================

const STAT_ALIASES = {
  avg: [
    "avg",
    "average",
    "batting average"
  ],

  obp: [
    "obp",
    "on base percentage",
    "on-base percentage",
    "on base"
  ],

  slg: [
    "slg",
    "slugging percentage",
    "slugging"
  ],

  ops: [
    "ops",
    "on base plus slugging",
    "on-base plus slugging"
  ],

  hr: [
    "home runs",
    "home run",
    "homers",
    "hrs",
    "hr"
  ],

  rbi: [
    "runs batted in",
    "rbis",
    "rbi"
  ],

  hits: [
    "hits",
    "hit"
  ],

  runs: [
    "runs",
    "run"
  ],

  ab: [
    "at bats",
    "at-bats",
    "at bat",
    "ab"
  ],

  walks: [
    "walks",
    "walk",
    "base on balls",
    "bb"
  ],

  strikeouts: [
    "strikeouts",
    "strikeout",
    "strike outs",
    "strike out",
    "so"
  ],

  sb: [
    "stolen bases",
    "stolen base",
    "sb"
  ],

  era: [
    "era"
  ],

  whip: [
    "whip"
  ],

  wins: [
    "wins",
    "win"
  ],

  losses: [
    "losses",
    "loss"
  ],

  saves: [
    "saves",
    "save"
  ],

  ip: [
    "innings pitched",
    "innings",
    "ip"
  ]
};

function detectStat(query) {
  const lower =
    query.toLowerCase();

  // Longer phrases first.
  const entries =
    Object.entries(STAT_ALIASES)
      .sort(
        (a, b) =>
          Math.max(...b[1].map(x => x.length)) -
          Math.max(...a[1].map(x => x.length))
      );

  for (const [key, aliases] of entries) {
    for (const alias of aliases) {
      const pattern =
        new RegExp(
          `(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`,
          "i"
        );

      if (
        pattern.test(lower) ||
        lower.includes(alias)
      ) {
        return key;
      }
    }
  }

  return null;
}

function detectGroup(query) {
  const lower =
    query.toLowerCase();

  if (
    lower.includes("pitch") ||
    lower.includes("pitching") ||
    lower.includes("era") ||
    lower.includes("whip") ||
    lower.includes("innings pitched") ||
    lower.includes("saves") ||
    lower.includes("strikeout rate") ||
    lower.includes("k/9") ||
    lower.includes("bb/9")
  ) {
    return "pitching";
  }

  return "hitting";
}

function detectLastN(query) {
  const match =
    query.match(
      /\blast\s+(\d+)\s+(?:games?|appearances?)\b/i
    );

  if (!match) {
    return null;
  }

  const n =
    Number(match[1]);

  if (
    !Number.isFinite(n) ||
    n < 1 ||
    n > 162
  ) {
    return null;
  }

  return n;
}

function parseSinceDate(query) {
  const match =
    query.match(
      /\bsince\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{1,2}-\d{1,2})/i
    );

  if (!match) {
    return null;
  }

  let value = match[1];

  if (/^\d{4}-/.test(value)) {
    return formatDateISO(value);
  }

  if (!/\d{4}/.test(value)) {
    value += `, ${CURRENT_SEASON}`;
  }

  return formatDateISO(new Date(value));
}

function parseDateRange(query) {
  const match =
    query.match(
      /\bfrom\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?)\s+(?:to|through|-)\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?)/i
    );

  if (!match) {
    return null;
  }

  let start = match[1];
  let end = match[2];

  if (!/\d{4}/.test(start)) {
    start += `, ${CURRENT_SEASON}`;
  }

  if (!/\d{4}/.test(end)) {
    end += `, ${CURRENT_SEASON}`;
  }

  return {
    start: formatDateISO(new Date(start)),
    end: formatDateISO(new Date(end))
  };
}

// ============================================================
// FLEXIBLE PLAYER DETECTION
// ============================================================

const COMMON_MLB_NAMES = [
  "Francisco Lindor",
  "Juan Soto",
  "Brandon Nimmo",
  "Pete Alonso",
  "Mark Vientos",
  "Jeff McNeil",
  "Luis Torrens",
  "Starling Marte",
  "Brett Baty",
  "Ronny Mauricio",
  "Tyrone Taylor",
  "Cedric Mullins",
  "Carson Benge",
  "Bo Bichette",
  "Marcus Semien"
];

function parsePlayerNames(query) {
  const found = [];

  const normalizedQuery =
    normalizeName(query);

  for (const name of COMMON_MLB_NAMES) {
    if (
      normalizedQuery.includes(
        normalizeName(name)
      )
    ) {
      found.push({
        fullName: name
      });
    }
  }

  return found;
}

// ============================================================
// HITTING CALCULATIONS
// ============================================================

function calculateHittingTotals(games) {
  const totals = {
    G: 0,
    AB: 0,
    R: 0,
    H: 0,
    "2B": 0,
    "3B": 0,
    HR: 0,
    RBI: 0,
    BB: 0,
    SO: 0,
    SB: 0,
    CS: 0,
    HBP: 0,
    SF: 0
  };

  for (const split of games) {
    const stat =
      split?.stat || {};

    totals.G++;

    totals.AB +=
      numberOrNull(stat.atBats) || 0;

    totals.R +=
      numberOrNull(stat.runs) || 0;

    totals.H +=
      numberOrNull(stat.hits) || 0;

    totals["2B"] +=
      numberOrNull(stat.doubles) || 0;

    totals["3B"] +=
      numberOrNull(stat.triples) || 0;

    totals.HR +=
      numberOrNull(stat.homeRuns) || 0;

    totals.RBI +=
      numberOrNull(stat.rbi) || 0;

    totals.BB +=
      numberOrNull(stat.baseOnBalls) || 0;

    totals.SO +=
      numberOrNull(stat.strikeOuts) || 0;

    totals.SB +=
      numberOrNull(stat.stolenBases) || 0;

    totals.CS +=
      numberOrNull(stat.caughtStealing) || 0;

    totals.HBP +=
      numberOrNull(stat.hitByPitch) || 0;

    totals.SF +=
      numberOrNull(stat.sacFlies) || 0;
  }

  const AVG =
    totals.AB > 0
      ? totals.H / totals.AB
      : null;

  const OBP_DENOM =
    totals.AB +
    totals.BB +
    totals.HBP +
    totals.SF;

  const OBP =
    OBP_DENOM > 0
      ? (
          totals.H +
          totals.BB +
          totals.HBP
        ) / OBP_DENOM
      : null;

  const totalBases =
    totals.H +
    totals["2B"] +
    2 * totals["3B"] +
    3 * totals.HR;

  const SLG =
    totals.AB > 0
      ? totalBases / totals.AB
      : null;

  const OPS =
    OBP !== null &&
    SLG !== null
      ? OBP + SLG
      : null;

  return {
    ...totals,
    AVG: round(AVG, 3),
    OBP: round(OBP, 3),
    SLG: round(SLG, 3),
    OPS: round(OPS, 3)
  };
}

// ============================================================
// PITCHING CALCULATIONS
// ============================================================

function inningsToDecimal(ip) {
  if (
    ip === null ||
    ip === undefined
  ) {
    return 0;
  }

  const value =
    String(ip);

  const parts =
    value.split(".");

  const whole =
    Number(parts[0]) || 0;

  if (parts.length === 1) {
    return whole;
  }

  if (parts[1] === "1") {
    return whole + 1 / 3;
  }

  if (parts[1] === "2") {
    return whole + 2 / 3;
  }

  return whole;
}

function calculatePitchingTotals(games) {
  let innings = 0;
  let wins = 0;
  let losses = 0;
  let saves = 0;
  let earnedRuns = 0;
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let homeRuns = 0;

  for (const split of games) {
    const stat =
      split?.stat || {};

    innings +=
      inningsToDecimal(
        stat.inningsPitched
      );

    wins +=
      numberOrNull(stat.wins) || 0;

    losses +=
      numberOrNull(stat.losses) || 0;

    saves +=
      numberOrNull(stat.saves) || 0;

    earnedRuns +=
      numberOrNull(stat.earnedRuns) || 0;

    hits +=
      numberOrNull(stat.hits) || 0;

    walks +=
      numberOrNull(stat.baseOnBalls) || 0;

    strikeouts +=
      numberOrNull(stat.strikeOuts) || 0;

    homeRuns +=
      numberOrNull(stat.homeRuns) || 0;
  }

  const ERA =
    innings > 0
      ? (earnedRuns * 9) / innings
      : null;

  const WHIP =
    innings > 0
      ? (hits + walks) / innings
      : null;

  return {
    G: games.length,
    IP: round(innings, 2),
    W: wins,
    L: losses,
    SV: saves,
    ERA: round(ERA, 2),
    WHIP: round(WHIP, 2),
    SO: strikeouts,
    BB: walks,
    H: hits,
    HR: homeRuns
  };
}

// ============================================================
// STAT FORMATTING
// ============================================================

function statLabel(stat) {
  const labels = {
    avg: "AVG",
    obp: "OBP",
    slg: "SLG",
    ops: "OPS",
    hr: "HR",
    rbi: "RBI",
    hits: "Hits",
    runs: "Runs",
    ab: "AB",
    walks: "BB",
    strikeouts: "SO",
    sb: "SB",
    era: "ERA",
    whip: "WHIP",
    wins: "Wins",
    losses: "Losses",
    saves: "SV",
    ip: "IP"
  };

  return labels[stat] ||
    String(stat || "").toUpperCase();
}

function getStatValue(totals, stat) {
  const map = {
    avg: "AVG",
    obp: "OBP",
    slg: "SLG",
    ops: "OPS",
    hr: "HR",
    rbi: "RBI",
    hits: "H",
    runs: "R",
    ab: "AB",
    walks: "BB",
    strikeouts: "SO",
    sb: "SB",
    era: "ERA",
    whip: "WHIP",
    wins: "W",
    losses: "L",
    saves: "SV",
    ip: "IP"
  };

  return totals?.[map[stat]];
}

function formatResearchNumber(value, stat) {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ) {
    return "N/A";
  }

  if (
    ["avg", "obp", "slg", "ops"].includes(stat)
  ) {
    return Number(value)
      .toFixed(3)
      .replace(/^0/, "");
  }

  if (
    ["era", "whip"].includes(stat)
  ) {
    return Number(value).toFixed(2);
  }

  if (stat === "ip") {
    return Number(value).toFixed(2);
  }

  return String(
    Math.round(Number(value))
  );
}

// ============================================================
// GAME LOG RETRIEVAL
// ============================================================

async function getPlayerGameStats(
  playerId,
  group
) {
  const data = await mlb(
    `people/${playerId}/stats`,
    {
      stats: "gameLog",
      season: CURRENT_SEASON,
      group
    }
  );

  return Array.isArray(data?.stats)
    ? data.stats.flatMap(
        item =>
          Array.isArray(item?.splits)
            ? item.splits
            : []
      )
    : [];
}

function filterGamesByDate(
  games,
  startDate,
  endDate
) {
  return games.filter(split => {
    const date =
      split?.date ||
      split?.gameDate ||
      split?.game?.gameDate;

    if (!date) {
      return false;
    }

    const day =
      formatDateISO(date);

    return (
      (!startDate || day >= startDate) &&
      (!endDate || day <= endDate)
    );
  });
}

// ============================================================
// RESEARCH PLAYER
// ============================================================

async function researchPlayer(player, query) {
  const group =
    detectGroup(query);

  const stat =
    detectStat(query);

  const games =
    await getPlayerGameStats(
      player.id,
      group
    );

  games.sort(
    (a, b) =>
      new Date(
        b.date ||
          b.gameDate ||
          b.game?.gameDate
      ) -
      new Date(
        a.date ||
          a.gameDate ||
          a.game?.gameDate
      )
  );

  const lastN =
    detectLastN(query);

  const dateRange =
    parseDateRange(query);

  const sinceDate =
    parseSinceDate(query);

  let selected =
    [...games];

  let period =
    `${CURRENT_SEASON} season`;

  if (lastN) {
    selected =
      selected.slice(0, lastN);

    period =
      `last ${lastN} games`;
  } else if (dateRange) {
    selected =
      filterGamesByDate(
        selected,
        dateRange.start,
        dateRange.end
      );

    period =
      `${dateRange.start} through ${dateRange.end}`;
  } else if (sinceDate) {
    selected =
      filterGamesByDate(
        selected,
        sinceDate,
        todayISO()
      );

    period =
      `since ${sinceDate}`;
  } else if (
    query.toLowerCase().includes(
      "last game"
    )
  ) {
    selected =
      selected.slice(0, 1);

    period =
      "last game";
  }

  const totals =
    group === "pitching"
      ? calculatePitchingTotals(selected)
      : calculateHittingTotals(selected);

  const value =
    stat
      ? getStatValue(totals, stat)
      : null;

  return {
    type: "player-stat",

    player: {
      id: player.id,
      name: player.fullName,
      position:
        player.primaryPosition?.name ||
        "—"
    },

    group,
    stat,

    statLabel:
      stat
        ? statLabel(stat)
        : null,

    value,

    formattedValue:
      stat
        ? formatResearchNumber(
            value,
            stat
          )
        : null,

    period,

    gamesUsed:
      selected.length,

    totals
  };
}

// ============================================================
// LEADERBOARDS
// ============================================================

async function metsLeaders(query) {
  const group =
    detectGroup(query);

  const stat =
    detectStat(query) ||
    (
      group === "pitching"
        ? "era"
        : "hr"
    );

  const data =
    await mlb("stats", {
      stats: "season",
      group,
      season: CURRENT_SEASON,
      teamIds: METS_ID,
      sportIds: MLB_SPORT_ID,
      hydrate: "person,team"
    });

  const splits =
    data?.stats?.flatMap(
      groupData =>
        Array.isArray(groupData?.splits)
          ? groupData.splits
          : []
    ) || [];

  const mapped =
    splits.map(split => {
      const person =
        split?.player || {};

      const totals =
        group === "pitching"
          ? {
              G:
                numberOrNull(
                  split?.stat?.gamesPitched
                ),
              IP:
                split?.stat?.inningsPitched,
              W:
                numberOrNull(
                  split?.stat?.wins
                ),
              L:
                numberOrNull(
                  split?.stat?.losses
                ),
              SV:
                numberOrNull(
                  split?.stat?.saves
                ),
              ERA:
                numberOrNull(
                  split?.stat?.era
                ),
              WHIP:
                numberOrNull(
                  split?.stat?.whip
                ),
              SO:
                numberOrNull(
                  split?.stat?.strikeOuts
                ),
              BB:
                numberOrNull(
                  split?.stat?.baseOnBalls
                ),
              H:
                numberOrNull(
                  split?.stat?.hits
                ),
              HR:
                numberOrNull(
                  split?.stat?.homeRuns
                )
            }
          : {
              G:
                numberOrNull(
                  split?.stat?.gamesPlayed
                ),
              AB:
                numberOrNull(
                  split?.stat?.atBats
                ),
              R:
                numberOrNull(
                  split?.stat?.runs
                ),
              H:
                numberOrNull(
                  split?.stat?.hits
                ),
              "2B":
                numberOrNull(
                  split?.stat?.doubles
                ),
              "3B":
                numberOrNull(
                  split?.stat?.triples
                ),
              HR:
                numberOrNull(
                  split?.stat?.homeRuns
                ),
              RBI:
                numberOrNull(
                  split?.stat?.rbi
                ),
              BB:
                numberOrNull(
                  split?.stat?.baseOnBalls
                ),
              SO:
                numberOrNull(
                  split?.stat?.strikeOuts
                ),
              SB:
                numberOrNull(
                  split?.stat?.stolenBases
                ),
              AVG:
                numberOrNull(
                  split?.stat?.avg
                ),
              OBP:
                numberOrNull(
                  split?.stat?.obp
                ),
              SLG:
                numberOrNull(
                  split?.stat?.slg
                ),
              OPS:
                numberOrNull(
                  split?.stat?.ops
                )
            };

      return {
        name:
          person.fullName ||
          "Unknown",

        id:
          person.id,

        value:
          getStatValue(
            totals,
            stat
          ),

        formattedValue:
          formatResearchNumber(
            getStatValue(
              totals,
              stat
            ),
            stat
          )
      };
    });

  const filtered =
    mapped.filter(
      row =>
        row.value !== null &&
        row.value !== undefined
    );

  // ERA/WHIP are better when LOWER.
  if (
    stat === "era" ||
    stat === "whip"
  ) {
    filtered.sort(
      (a, b) =>
        (a.value ?? Infinity) -
        (b.value ?? Infinity)
    );
  } else {
    filtered.sort(
      (a, b) =>
        (b.value ?? -Infinity) -
        (a.value ?? -Infinity)
    );
  }

  return {
    type: "leaderboard",
    group,
    stat,
    statLabel: statLabel(stat),
    players: filtered.slice(0, 10)
  };
}

// ============================================================
// RESEARCH QUERY
// ============================================================

app.get("/api/mlb/query", async (req, res) => {
  const query =
    cleanString(req.query.question);

  if (!query) {
    return res.status(400).json({
      success: false,
      error: "Enter a baseball question."
    });
  }

  try {
    const lower =
      query.toLowerCase();

    // --------------------------------------------------------
    // LEADERBOARDS
    // --------------------------------------------------------

    if (
      lower.includes("leader") ||
      lower.includes("leaders") ||
      lower.includes("most home runs") ||
      lower.includes("most hr")
    ) {
      const result =
        await metsLeaders(query);

      return res.json({
        success: true,
        query,
        result
      });
    }

    // --------------------------------------------------------
    // PLAYER IDENTIFICATION
    // --------------------------------------------------------

    let players =
      parsePlayerNames(query);

    // Resolve known names into actual MLB players.
    if (players.length) {
      const resolved = [];

      for (const candidate of players) {
        const player =
          await findPlayer(
            candidate.fullName
          );

        if (player) {
          resolved.push(player);
        }
      }

      players = resolved;
    }

    // If known-name matching didn't find anything,
    // search the MLB database using cleaned query terms.
    if (!players.length) {
      const cleaned =
        query
          .replace(
            /\blast\s+\d+\s+(?:games?|appearances?)\b/gi,
            ""
          )
          .replace(
            /\bsince\s+[A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?/gi,
            ""
          )
          .replace(
            /\bfrom\s+.+?\s+(?:to|through|-)\s+.+/gi,
            ""
          )
          .replace(
            /\bwhat\s+(?:is|are)\b/gi,
            ""
          )
          .replace(
            /\bhow\s+(?:is|are|many|did)\b/gi,
            ""
          )
          .replace(
            /\bcompare\b/gi,
            ""
          )
          .replace(
            /\bstats?\b/gi,
            ""
          )
          .replace(
            /\bstatistics\b/gi,
            ""
          )
          .replace(
            /\bbaseball\b/gi,
            ""
          )
          .replace(
            /\bplayers?\b/gi,
            ""
          )
          .replace(
            /\bOPS\b/gi,
            ""
          )
          .trim();

      const searchTerms =
        cleaned
          .split(
            /\s+(?:vs\.?|versus|and)\s+/i
          )
          .map(term =>
            term
              .replace(
                /\bwho\s+has\s+more\b/gi,
                ""
              )
              .trim()
          )
          .filter(Boolean);

      for (
        const term of
        searchTerms.slice(0, 4)
      ) {
        const player =
          await findPlayer(term);

        if (
          player &&
          !players.some(
            existing =>
              String(existing.id) ===
              String(player.id)
          )
        ) {
          players.push(player);
        }
      }
    }

    // --------------------------------------------------------
    // COMPARISON
    // --------------------------------------------------------

    if (
      players.length >= 2 &&
      (
        lower.includes("compare") ||
        lower.includes(" vs ") ||
        lower.includes("versus") ||
        lower.includes("who has more") ||
        lower.includes("better")
      )
    ) {
      const stat =
        detectStat(query) ||
        "ops";

      const comparison = [];

      for (
        const player of
        players.slice(0, 4)
      ) {
        const result =
          await researchPlayer(
            player,
            query
          );

        const value =
          getStatValue(
            result.totals,
            stat
          );

        comparison.push({
          player:
            player.fullName,

          id:
            player.id,

          value,

          formattedValue:
            formatResearchNumber(
              value,
              stat
            )
        });
      }

      if (
        stat === "era" ||
        stat === "whip"
      ) {
        comparison.sort(
          (a, b) =>
            (a.value ?? Infinity) -
            (b.value ?? Infinity)
        );
      } else {
        comparison.sort(
          (a, b) =>
            (b.value ?? -Infinity) -
            (a.value ?? -Infinity)
        );
      }

      return res.json({
        success: true,
        query,

        result: {
          type: "comparison",

          stat,

          statLabel:
            statLabel(stat),

          results:
            comparison
        }
      });
    }

    // --------------------------------------------------------
    // SINGLE PLAYER
    // --------------------------------------------------------

    if (players.length) {
      const result =
        await researchPlayer(
          players[0],
          query
        );

      return res.json({
        success: true,
        query,
        result
      });
    }

    // --------------------------------------------------------
    // FALLBACK PLAYER SEARCH
    // --------------------------------------------------------

    const search =
      await searchPlayers(query);

    return res.json({
      success: true,

      query,

      result: {
        type: "search",

        message:
          search.length
            ? "I found these players."
            : "I couldn't identify a player from that question.",

        players:
          search
            .slice(0, 10)
            .map(player => ({
              id:
                player.id,

              name:
                player.fullName,

              position:
                player.primaryPosition?.name ||
                "—"
            }))
      }
    });
  } catch (error) {
    console.error(
      "Research error:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Research failed."
    });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Mets HQ",
    season: CURRENT_SEASON,
    metsId: METS_ID,
    statcast: true,
    timestamp:
      new Date().toISOString()
  });
});

// ============================================================
// SPA FALLBACK
// ============================================================
//
// IMPORTANT:
// Express 5 / path-to-regexp does NOT accept app.get("*").
//
// We therefore use app.use() for the fallback.
//
// Also notice that index.html is inside /public.
//

app.use((req, res, next) => {
  if (
    req.path.startsWith("/api/")
  ) {
    return next();
  }

  res.sendFile(
    path.join(
      PUBLIC_DIR,
      "index.html"
    )
  );
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      error:
        "Internal server error."
    });
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {
    console.log(
      `Mets HQ running on port ${PORT}`
    );

    console.log(
      `Season: ${CURRENT_SEASON}`
    );

    console.log(
      `Mets ID: ${METS_ID}`
    );

    console.log(
      `Frontend directory: ${PUBLIC_DIR}`
    );

    console.log(
      "Statcast: Baseball Savant enabled"
    );
  }
);
