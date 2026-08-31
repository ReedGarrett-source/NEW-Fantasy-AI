const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const MLB_API = "https://statsapi.mlb.com/api/v1";

const CURRENT_SEASON = 2026;
const METS_ID = 121;
const MLB_SPORT_ID = 1;

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// IMPORTANT:
// index.html, app.js and style.css are inside /public
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
// MLB API
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

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mets-HQ/1.0"
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

async function mlbSafe(endpoint, params = {}) {
  try {
    return await mlb(endpoint, params);
  } catch (error) {
    console.error(
      "MLB API error:",
      endpoint,
      error.message
    );

    throw error;
  }
}

// ============================================================
// PLAYER SEARCH
// ============================================================

async function searchPlayers(query) {
  const q = cleanString(query);

  if (!q) {
    return [];
  }

  const data = await mlbSafe("people/search", { q });

  return Array.isArray(data?.people)
    ? data.people
    : [];
}

async function findPlayer(query) {
  const q = cleanString(query);

  if (!q) {
    return null;
  }

  const exactName = normalizeName(q);

  const candidates = await searchPlayers(q);

  if (!candidates.length) {
    return null;
  }

  const exact = candidates.find(
    person =>
      normalizeName(person.fullName) === exactName
  );

  if (exact) {
    return exact;
  }

  const starts = candidates.find(
    person =>
      normalizeName(person.fullName).startsWith(exactName)
  );

  if (starts) {
    return starts;
  }

  return candidates[0];
}

// ============================================================
// METS ROSTER
// ============================================================

async function getMetsRoster(
  season = CURRENT_SEASON,
  rosterType = "active"
) {
  const data = await mlbSafe(
    `teams/${METS_ID}/roster`,
    {
      season,
      rosterType
    }
  );

  return Array.isArray(data?.roster)
    ? data.roster
    : [];
}

async function getActiveMetsIds() {
  const roster = await getMetsRoster(
    CURRENT_SEASON,
    "active"
  );

  return new Set(
    roster
      .map(player =>
        player?.person?.id ||
        player?.id
      )
      .filter(Boolean)
      .map(String)
  );
}

// ============================================================
// STATS OBJECTS
// ============================================================

function getHittingStatObject(stat = {}) {
  return {
    G: numberOrNull(stat.gamesPlayed),
    AB: numberOrNull(stat.atBats),
    R: numberOrNull(stat.runs),
    H: numberOrNull(stat.hits),
    "2B": numberOrNull(stat.doubles),
    "3B": numberOrNull(stat.triples),
    HR: numberOrNull(stat.homeRuns),
    RBI: numberOrNull(stat.rbi),
    BB: numberOrNull(stat.baseOnBalls),
    SO: numberOrNull(stat.strikeOuts),
    SB: numberOrNull(stat.stolenBases),
    CS: numberOrNull(stat.caughtStealing),
    AVG: numberOrNull(stat.avg),
    OBP: numberOrNull(stat.obp),
    SLG: numberOrNull(stat.slg),
    OPS: numberOrNull(stat.ops)
  };
}

function getPitchingStatObject(stat = {}) {
  return {
    G: numberOrNull(stat.gamesPitched),
    GS: numberOrNull(stat.gamesStarted),
    IP: stat.inningsPitched ?? null,
    W: numberOrNull(stat.wins),
    L: numberOrNull(stat.losses),
    SV: numberOrNull(stat.saves),
    ERA: numberOrNull(stat.era),
    WHIP: numberOrNull(stat.whip),
    SO: numberOrNull(stat.strikeOuts),
    BB: numberOrNull(stat.baseOnBalls),
    H: numberOrNull(stat.hits),
    HR: numberOrNull(stat.homeRuns)
  };
}

// ============================================================
// STANDINGS
// ============================================================

app.get("/api/mets/standings", async (req, res) => {
  try {
    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data = await mlbSafe("standings", {
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

      mets: mets
        ? {
            ...mets,

            wins: mets.wins,
            losses: mets.losses,
            gamesBack: mets.gamesBack,
            divisionRank: mets.divisionRank,

            lastTen:
              mets.records?.find(
                record =>
                  record?.type === "lastTen"
              ) || null,

            streak: mets.streak || null
          }
        : null,

      standings: records
    });
  } catch (error) {
    console.error("Standings:", error);

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
      req.query.startDate ||
      dateDaysAgo(14);

    const endDate =
      req.query.endDate ||
      addDays(todayISO(), 21);

    const data = await mlbSafe("schedule", {
      sportId: MLB_SPORT_ID,
      teamId: METS_ID,
      startDate,
      endDate,
      hydrate:
        "linescore,probablePitcher,person,team"
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
    console.error("Games:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// ROSTER
// ============================================================

app.get("/api/mets/roster", async (req, res) => {
  try {
    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const roster = await getMetsRoster(
      season,
      "active"
    );

    res.json({
      success: true,
      roster
    });
  } catch (error) {
    console.error("Roster:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// FULL 40-MAN / ORGANIZATIONAL ROSTER
// ============================================================

app.get("/api/mets/full-roster", async (req, res) => {
  try {
    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const types = [
      "active",
      "40Man",
      "fullRoster"
    ];

    const combined = new Map();

    for (const rosterType of types) {
      try {
        const roster = await getMetsRoster(
          season,
          rosterType
        );

        for (const player of roster) {
          const id =
            player?.person?.id ||
            player?.id;

          if (id) {
            combined.set(
              String(id),
              player
            );
          }
        }
      } catch {
        // Some MLB roster types may not be available.
      }
    }

    res.json({
      success: true,
      roster: [...combined.values()]
    });
  } catch (error) {
    console.error("Full roster:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// SEASON STATS
// ============================================================

app.get("/api/mets/stats", async (req, res) => {
  try {
    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const activeIds =
      await getActiveMetsIds();

    const data = await mlbSafe("stats", {
      stats: "season",
      group,
      season,
      teamIds: METS_ID,
      sportIds: MLB_SPORT_ID,
      hydrate: "person,team"
    });

    const splits =
      Array.isArray(data?.stats)
        ? data.stats.flatMap(
            statGroup =>
              Array.isArray(statGroup?.splits)
                ? statGroup.splits
                : []
          )
        : [];

    const stats = splits.map(split => {
      const person =
        split?.player ||
        split?.person ||
        {};

      const id =
        person?.id ||
        split?.player?.id ||
        split?.person?.id ||
        "";

      return {
        ...split,

        player: {
          ...person
        },

        isActive:
          activeIds.has(String(id)),

        active:
          activeIds.has(String(id))
      };
    });

    res.json({
      success: true,
      stats,
      activePlayerIds: [...activeIds],
      group,
      season
    });
  } catch (error) {
    console.error("Stats:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// PLAYER INFORMATION
// ============================================================

app.get("/api/player/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const data = await mlbSafe(
      `people/${encodeURIComponent(id)}`
    );

    const player =
      data?.people?.[0] ||
      null;

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
    console.error("Player:", error);

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
      Number(req.query.season) ||
      CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const data = await mlbSafe(
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
              groupData?.splits || []
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
      Number(req.query.season) ||
      CURRENT_SEASON;

    const group =
      req.query.group === "pitching"
        ? "pitching"
        : "hitting";

    const data = await mlbSafe(
      `people/${encodeURIComponent(id)}/stats`,
      {
        stats: "gameLog",
        season,
        group
      }
    );

    const games =
      Array.isArray(data?.stats)
        ? data.stats.flatMap(
            groupData =>
              groupData?.splits || []
          )
        : [];

    res.json({
      success: true,
      games,
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

app.get(
  "/api/mets/transactions",
  async (req, res) => {
    try {
      const startDate =
        req.query.startDate ||
        dateDaysAgo(45);

      const endDate =
        req.query.endDate ||
        todayISO();

      const data = await mlbSafe(
        "transactions",
        {
          teamId: METS_ID,
          startDate,
          endDate
        }
      );

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
  }
);

// ============================================================
// MINOR LEAGUE / PROSPECTS
// ============================================================

async function getMetsMinorLeagueTeams() {
  const sports = [
    11,
    12,
    13,
    14
  ];

  const results = [];

  for (const sportId of sports) {
    try {
      const data = await mlbSafe(
        "teams",
        {
          sportId,
          season: CURRENT_SEASON
        }
      );

      for (const team of data?.teams || []) {
        const parentId =
          Number(team?.parentOrgId);

        const parentName =
          normalizeName(
            team?.parentOrgName
          );

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
        "Minor league lookup failed:",
        sportId,
        error.message
      );
    }
  }

  const unique = new Map();

  for (const team of results) {
    if (team?.id) {
      unique.set(
        String(team.id),
        team
      );
    }
  }

  return [...unique.values()];
}

async function getMinorLeagueRoster(teamId) {
  try {
    const data = await mlbSafe(
      `teams/${teamId}/roster`,
      {
        season: CURRENT_SEASON
      }
    );

    return Array.isArray(data?.roster)
      ? data.roster
      : [];
  } catch {
    return [];
  }
}

app.get(
  "/api/mets/prospects",
  async (req, res) => {
    try {
      const teams =
        await getMetsMinorLeagueTeams();

      const allPlayers = [];

      for (const team of teams) {
        const roster =
          await getMinorLeagueRoster(
            team.id
          );

        for (const player of roster) {
          const person =
            player?.person || {};

          allPlayers.push({
            id: person.id,

            name:
              person.fullName ||
              "Unknown Player",

            firstName:
              person.firstName ||
              "",

            lastName:
              person.lastName ||
              "",

            position:
              player?.position?.abbreviation ||
              player?.position?.name ||
              person?.primaryPosition?.abbreviation ||
              "—",

            jerseyNumber:
              player?.jerseyNumber ||
              person?.primaryNumber ||
              "—",

            teamId:
              team.id,

            teamName:
              team.name,

            level:
              team.sport?.name ||
              team.sport?.abbreviation ||
              "Minor League",

            status:
              player?.status?.description ||
              player?.status?.code ||
              "",

            birthDate:
              person.birthDate ||
              null,

            age:
              person.currentAge ||
              null,

            bats:
              person.batSide?.description ||
              null,

            throws:
              person.pitchHand?.description ||
              null
          });
        }
      }

      const unique = new Map();

      for (const player of allPlayers) {
        if (player.id) {
          unique.set(
            String(player.id),
            player
          );
        }
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
  }
);

// ============================================================
// STATCAST / BASEBALL SAVANT
// ============================================================

async function savantRequest(url, params = {}) {
  const target = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      target.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const response = await fetch(target, {
    headers: {
      Accept: "text/csv,application/json",
      "User-Agent": "Mets-HQ/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Baseball Savant error ${response.status}`
    );
  }

  return await response.text();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      value += '"';
      i++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if (
      (char === "\n" || char === "\r") &&
      !insideQuotes
    ) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(value);
      value = "";

      if (row.some(cell => cell !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);

    if (row.some(cell => cell !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0];

  return rows.slice(1).map(columns => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] =
        columns[index] ?? "";
    });

    return object;
  });
}

function statcastNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

app.get(
  "/api/statcast/player/:id",
  async (req, res) => {
    try {
      const playerId =
        req.params.id;

      const startDate =
        req.query.startDate ||
        dateDaysAgo(30);

      const endDate =
        req.query.endDate ||
        todayISO();

      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      const csv =
        await savantRequest(
          "https://baseballsavant.mlb.com/leaderboard/custom",
          {
            type: "batter",
            year: CURRENT_SEASON,
            player_lookup:
              playerId,
            player_type:
              "batter",
            min_pas: 0,
            sort_col:
              "pa",
            sort_order:
              "desc",
            run_scoring:
              "standard"
          }
        );

      const rows =
        parseCSV(csv);

      const playerRows =
        rows.filter(
          row =>
            String(
              row.player_id
            ) === String(playerId)
        );

      res.json({
        success: true,
        playerId,
        group,
        startDate,
        endDate,
        stats: playerRows
      });
    } catch (error) {
      console.error(
        "Statcast:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

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
    "on base",
    "on-base",
    "on base percentage"
  ],

  slg: [
    "slg",
    "slugging",
    "slugging percentage"
  ],

  ops: [
    "ops",
    "on base plus slugging",
    "on-base plus slugging"
  ],

  hr: [
    "hr",
    "hrs",
    "home run",
    "home runs",
    "homers"
  ],

  rbi: [
    "rbi",
    "rbis",
    "runs batted in"
  ],

  hits: [
    "hit",
    "hits"
  ],

  runs: [
    "run",
    "runs"
  ],

  ab: [
    "ab",
    "at bat",
    "at bats",
    "at-bats"
  ],

  walks: [
    "walk",
    "walks",
    "bb",
    "base on balls"
  ],

  strikeouts: [
    "strikeout",
    "strikeouts",
    "strike out",
    "strike outs",
    "so"
  ],

  sb: [
    "sb",
    "stolen base",
    "stolen bases"
  ],

  era: [
    "era"
  ],

  whip: [
    "whip"
  ],

  wins: [
    "win",
    "wins"
  ],

  losses: [
    "loss",
    "losses"
  ],

  saves: [
    "save",
    "saves"
  ],

  ip: [
    "ip",
    "innings",
    "innings pitched"
  ]
};

function detectStat(query) {
  const lower = query.toLowerCase();

  const ordered = [
    "ops",
    "obp",
    "slg",
    "avg",
    "era",
    "whip",
    "hr",
    "rbi",
    "hits",
    "runs",
    "ab",
    "walks",
    "strikeouts",
    "sb",
    "wins",
    "losses",
    "saves",
    "ip"
  ];

  for (const key of ordered) {
    const aliases =
      STAT_ALIASES[key];

    if (
      aliases.some(
        alias =>
          lower.includes(alias)
      )
    ) {
      return key;
    }
  }

  return null;
}

function detectGroup(query) {
  const lower =
    query.toLowerCase();

  if (
    lower.includes("pitch") ||
    lower.includes("pitcher") ||
    lower.includes("pitchers") ||
    lower.includes("era") ||
    lower.includes("whip") ||
    lower.includes("innings") ||
    lower.includes("strikeout") ||
    lower.includes("strikeouts") ||
    lower.includes("saves") ||
    lower.includes("wins") ||
    lower.includes("losses")
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

  const n = Number(match[1]);

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

  if (!/\d{4}/.test(value)) {
    value += `, ${CURRENT_SEASON}`;
  }

  return formatDateISO(
    new Date(value)
  );
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
    start:
      formatDateISO(new Date(start)),

    end:
      formatDateISO(new Date(end))
  };
}

// ============================================================
// FLEXIBLE PLAYER EXTRACTION
// ============================================================

const KNOWN_METS = [
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
  "Kodai Senga",
  "Sean Manaea",
  "David Peterson",
  "Nate Lavender"
];

function parsePlayerNames(query) {
  const found = [];

  const normalizedQuery =
    normalizeName(query);

  for (const name of KNOWN_METS) {
    if (
      normalizedQuery.includes(
        normalizeName(name)
      )
    ) {
      found.push(name);
    }
  }

  return found;
}

function cleanResearchSearch(query) {
  return query
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
      /\bwhat (?:is|are)\b/gi,
      ""
    )
    .replace(
      /\bhow many\b/gi,
      ""
    )
    .replace(
      /\bwhat's\b/gi,
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
      /\bOPS\b/gi,
      ""
    )
    .replace(
      /\bAVG\b/gi,
      ""
    )
    .replace(
      /\bOBP\b/gi,
      ""
    )
    .replace(
      /\bSLG\b/gi,
      ""
    )
    .replace(
      /\bHR\b/gi,
      ""
    )
    .replace(
      /\bhome runs?\b/gi,
      ""
    )
    .replace(
      /\bhits?\b/gi,
      ""
    )
    .replace(
      /\bruns?\b/gi,
      ""
    )
    .replace(
      /\bcompare\b/gi,
      ""
    )
    .trim();
}

// ============================================================
// HIT / PITCH TOTAL CALCULATIONS
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
      split?.stat ||
      {};

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
    OBP !== null && SLG !== null
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

function parseInnings(value) {
  const ip = String(value ?? "0");

  const parts = ip.split(".");

  const whole =
    Number(parts[0]) || 0;

  let fraction = 0;

  if (parts[1] === "1") {
    fraction = 1 / 3;
  } else if (parts[1] === "2") {
    fraction = 2 / 3;
  }

  return whole + fraction;
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
      split?.stat ||
      {};

    innings +=
      parseInnings(
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
// RESEARCH FORMATTING
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
    String(stat).toUpperCase();
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

  return totals[map[stat]];
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
    [
      "avg",
      "obp",
      "slg",
      "ops"
    ].includes(stat)
  ) {
    return Number(value)
      .toFixed(3)
      .replace(/^0/, "");
  }

  if (
    stat === "era" ||
    stat === "whip"
  ) {
    return Number(value)
      .toFixed(2);
  }

  if (stat === "ip") {
    return Number(value)
      .toFixed(1);
  }

  return String(
    Math.round(Number(value))
  );
}

// ============================================================
// GAME LOG
// ============================================================

async function getPlayerGameStats(
  playerId,
  group
) {
  const data =
    await mlbSafe(
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
          item?.splits || []
      )
    : [];
}

function getGameDate(split) {
  return (
    split?.date ||
    split?.gameDate ||
    split?.game?.gameDate ||
    null
  );
}

function filterGamesByDate(
  games,
  startDate,
  endDate
) {
  return games.filter(split => {
    const date =
      getGameDate(split);

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
// SINGLE PLAYER RESEARCH
// ============================================================

async function researchPlayer(
  player,
  query
) {
  const group =
    detectGroup(query);

  const stat =
    detectStat(query);

  let games =
    await getPlayerGameStats(
      player.id,
      group
    );

  games.sort(
    (a, b) =>
      new Date(getGameDate(b)) -
      new Date(getGameDate(a))
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
      ? calculatePitchingTotals(
          selected
        )
      : calculateHittingTotals(
          selected
        );

  const value =
    stat
      ? getStatValue(
          totals,
          stat
        )
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
// PLAYER COMPARISON
// ============================================================

async function comparePlayers(
  players,
  query
) {
  const stat =
    detectStat(query) ||
    "ops";

  const results = [];

  for (const player of players) {
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

    results.push({
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

  results.sort(
    (a, b) =>
      (b.value ?? -Infinity) -
      (a.value ?? -Infinity)
  );

  return {
    type: "comparison",

    stat,

    statLabel:
      statLabel(stat),

    results
  };
}

// ============================================================
// METS LEADERS
// ============================================================

async function metsLeaders(query) {
  const group =
    detectGroup(query);

  let stat =
    detectStat(query);

  if (!stat) {
    stat =
      group === "pitching"
        ? "era"
        : "hr";
  }

  const data =
    await mlbSafe(
      "stats",
      {
        stats: "season",
        group,
        season: CURRENT_SEASON,
        teamIds: METS_ID,
        sportIds: MLB_SPORT_ID,
        hydrate: "person"
      }
    );

  const splits =
    data?.stats?.flatMap(
      groupData =>
        groupData?.splits || []
    ) || [];

  const mapped =
    splits.map(split => {
      const person =
        split?.player ||
        {};

      const totals =
        group === "pitching"
          ? getPitchingStatObject(
              split.stat || {}
            )
          : getHittingStatObject(
              split.stat || {}
            );

      const value =
        getStatValue(
          totals,
          stat
        );

      return {
        name:
          person.fullName ||
          "Unknown",

        id:
          person.id,

        value,

        formattedValue:
          formatResearchNumber(
            value,
            stat
          ),

        totals
      };
    });

  const filtered =
    mapped.filter(
      row =>
        row.value !== null
    );

  filtered.sort(
    (a, b) =>
      (
        b.value ??
        -Infinity
      ) -
      (
        a.value ??
        -Infinity
      )
  );

  return {
    type: "leaderboard",

    group,
    stat,

    statLabel:
      statLabel(stat),

    players:
      filtered.slice(0, 10)
  };
}

// ============================================================
// RESEARCH API
// ============================================================

app.get(
  "/api/mlb/query",
  async (req, res) => {
    const query =
      cleanString(
        req.query.question
      );

    if (!query) {
      return res.status(400).json({
        success: false,
        error:
          "Enter a baseball question."
      });
    }

    try {
      const lower =
        query.toLowerCase();

      // --------------------------------------------------------
      // METS LEADERBOARD QUESTIONS
      // --------------------------------------------------------

      const isLeaderboard =
        lower.includes("leader") ||
        lower.includes("leaders") ||
        lower.includes("most home runs") ||
        lower.includes("most hr") ||
        lower.includes("highest ops") ||
        lower.includes("best batting average") ||
        lower.includes("lowest era");

      if (isLeaderboard) {
        const result =
          await metsLeaders(
            query
          );

        return res.json({
          success: true,
          query,
          result
        });
      }

      // --------------------------------------------------------
      // FIND PLAYERS
      // --------------------------------------------------------

      let players =
        parsePlayerNames(
          query
        );

      if (!players.length) {
        const cleaned =
          cleanResearchSearch(
            query
          );

        const searchTerms =
          cleaned
            .split(
              /\s+(?:vs\.?|versus|and)\s+/i
            )
            .map(
              value =>
                value.trim()
            )
            .filter(Boolean);

        for (
          const term of
          searchTerms.slice(0, 4)
        ) {
          try {
            const player =
              await findPlayer(
                term
              );

            if (
              player &&
              !players.some(
                existing =>
                  String(
                    existing.id
                  ) ===
                  String(
                    player.id
                  )
              )
            ) {
              players.push(
                player
              );
            }
          } catch {
            // Continue searching.
          }
        }
      }

      // --------------------------------------------------------
      // COMPARISON
      // --------------------------------------------------------

      const isComparison =
        lower.includes("compare") ||
        lower.includes(" vs ") ||
        lower.includes("versus") ||
        lower.includes("who has more") ||
        lower.includes("better");

      if (
        players.length >= 2 &&
        isComparison
      ) {
        const result =
          await comparePlayers(
            players.slice(0, 4),
            query
          );

        return res.json({
          success: true,
          query,
          result
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
      // GENERIC PLAYER SEARCH
      // --------------------------------------------------------

      const cleaned =
        cleanResearchSearch(
          query
        );

      const search =
        await searchPlayers(
          cleaned || query
        );

      return res.json({
        success: true,

        query,

        result: {
          type: "search",

          message:
            search.length
              ? "I found these players."
              : "I couldn't identify a player or statistic from that question.",

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
        "Research:",
        error
      );

      res.status(500).json({
        success: false,

        error:
          error.message ||
          "Research failed."
      });
    }
  }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      success: true,
      service: "Mets HQ",
      season: CURRENT_SEASON,
      metsId: METS_ID,
      statcast: "enabled",
      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// API 404
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      success: false,
      error:
        "Mets HQ API endpoint not found."
    });
  }
);

// ============================================================
// SPA FALLBACK
// ============================================================
//
// IMPORTANT:
// Express 5 does NOT accept app.get("*").
// The correct wildcard syntax is:
// app.get("/{*splat}", ...)
//
// Also IMPORTANT:
// index.html lives in /public.
// ============================================================

app.get(
  "/{*splat}",
  (req, res, next) => {
    if (
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    res.sendFile(
      INDEX_FILE,
      error => {
        if (error) {
          console.error(
            "Unable to serve index.html:",
            error
          );

          if (!res.headersSent) {
            res.status(404).send(
              "Mets HQ frontend could not be found."
            );
          }
        }
      }
    );
  }
);

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
      `Frontend: ${INDEX_FILE}`
    );

    console.log(
      "Statcast: Baseball Savant enabled"
    );
  }
);
