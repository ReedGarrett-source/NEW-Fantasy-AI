const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const MLB_API = "https://statsapi.mlb.com/api/v1";

const CURRENT_SEASON = 2026;
const METS_ID = 121;
const MLB_SPORT_ID = 1;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname)));

// ============================================================
// GENERAL HELPERS
// ============================================================

function cleanString(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
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

function dateDaysAgo(days) {
  const d = new Date();

  d.setDate(d.getDate() - days);

  return formatDateISO(d);
}

function todayISO() {
  return formatDateISO(new Date());
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
      "MLB API:",
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

  const data = await mlbSafe("people/search", {
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
      normalizeName(person.fullName).startsWith(
        exactName
      )
  );

  if (starts) {
    return starts;
  }

  return candidates[0];
}

// ============================================================
// ACTIVE METS ROSTER
// ============================================================

async function getActiveMetsRoster() {
  const data = await mlbSafe(
    `teams/${METS_ID}/roster`,
    {
      season: CURRENT_SEASON,
      rosterType: "active"
    }
  );

  return Array.isArray(data?.roster)
    ? data.roster
    : [];
}

async function getActiveMetsIds() {
  const roster = await getActiveMetsRoster();

  return new Set(
    roster
      .map(player => {
        return (
          player?.person?.id ||
          player?.id
        );
      })
      .filter(Boolean)
      .map(String)
  );
}

// ============================================================
// STATS HELPERS
// ============================================================

function getHittingStatObject(stat) {
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

function getPitchingStatObject(stat) {
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

app.get(
  "/api/mets/standings",
  async (req, res) => {
    try {
      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const data = await mlbSafe(
        "standings",
        {
          leagueId: "104,103",
          season,
          standingsTypes: "regularSeason"
        }
      );

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

      if (!mets) {
        return res.json({
          success: true,
          mets: null,
          standings: records
        });
      }

      const lastTenRecord =
        mets.records?.find(
          record =>
            record?.type === "lastTen"
        ) || null;

      res.json({
        success: true,

        mets: {
          ...mets,

          wins: mets.wins,
          losses: mets.losses,
          gamesBack: mets.gamesBack,
          divisionRank: mets.divisionRank,

          lastTen: lastTenRecord,

          streak: mets.streak
        },

        standings: records
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// GAMES
// ============================================================

app.get(
  "/api/mets/games",
  async (req, res) => {
    try {
      const startDate =
        req.query.startDate ||
        dateDaysAgo(14);

      const endDate =
        req.query.endDate ||
        addDays(todayISO(), 21);

      const data = await mlbSafe(
        "schedule",
        {
          sportId: MLB_SPORT_ID,
          teamId: METS_ID,
          startDate,
          endDate,
          hydrate:
            "linescore,probablePitcher"
        }
      );

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
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// ROSTER
// ============================================================

app.get(
  "/api/mets/roster",
  async (req, res) => {
    try {
      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const data = await mlbSafe(
        `teams/${METS_ID}/roster`,
        {
          season,
          rosterType: "active"
        }
      );

      res.json({
        success: true,

        roster:
          Array.isArray(data?.roster)
            ? data.roster
            : []
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// SEASON STATS
// ============================================================

app.get(
  "/api/mets/stats",
  async (req, res) => {
    try {
      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      /*
       * IMPORTANT:
       *
       * We retrieve the active roster separately.
       * MLB's season stats endpoint can include players
       * who appeared for the Mets earlier in the season
       * but are no longer currently active.
       *
       * Therefore every row receives an explicit
       * isActive/active boolean.
       */

      const activeIds =
        await getActiveMetsIds();

      const data = await mlbSafe(
        "stats",
        {
          stats: "season",
          group,
          season,
          teamIds: METS_ID,
          sportIds: MLB_SPORT_ID,
          hydrate: "person,team"
        }
      );

      const splits =
        Array.isArray(data?.stats)
          ? data.stats.flatMap(
              statGroup =>
                Array.isArray(
                  statGroup?.splits
                )
                  ? statGroup.splits
                  : []
            )
          : [];

      const result = splits.map(split => {
        const person =
          split?.player || {};

        const id =
          person?.id ||
          split?.player?.id ||
          "";

        const isActive =
          activeIds.has(String(id));

        return {
          ...split,

          player: person,

          isActive,

          active: isActive,

          status: isActive
            ? "Active"
            : "Inactive"
        };
      });

      res.json({
        success: true,

        stats: result,

        activePlayerIds: [...activeIds],

        group,

        season
      });
    } catch (error) {
      console.error(
        "Stats error:",
        error
      );

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// PLAYER
// ============================================================

app.get(
  "/api/player/:id",
  async (req, res) => {
    try {
      const id = req.params.id;

      const data = await mlbSafe(
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
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// PLAYER SEASON STATS
// ============================================================

app.get(
  "/api/player/:id/stats",
  async (req, res) => {
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
                groupData?.splits ||
                []
            )
          : [];

      res.json({
        success: true,
        stats: splits,
        group,
        season
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// PLAYER GAME LOG
// ============================================================

app.get(
  "/api/player/:id/games",
  async (req, res) => {
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

      const splits =
        Array.isArray(data?.stats)
          ? data.stats.flatMap(
              groupData =>
                groupData?.splits ||
                []
            )
          : [];

      res.json({
        success: true,

        games: splits,

        season,

        group
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

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
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// PROSPECT CENTER
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
          parentName.includes(
            "new york mets"
          ) ||
          parentName === "mets"
        ) {
          results.push(team);
        }
      }
    } catch (error) {
      console.warn(
        "Minor team lookup failed:",
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

            position:
              player?.position?.abbreviation ||
              player?.position?.name ||
              person?.primaryPosition
                ?.abbreviation ||
              "—",

            jerseyNumber:
              player?.jerseyNumber ||
              person?.primaryNumber ||
              "—",

            teamId: team.id,

            teamName: team.name,

            level:
              team.sport?.name ||
              team.sport?.abbreviation ||
              "Minor League",

            status:
              player?.status?.description ||
              player?.status?.code ||
              ""
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

        prospects:
          [...unique.values()]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
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
  const lower =
    query.toLowerCase();

  for (
    const [
      key,
      aliases
    ] of Object.entries(
      STAT_ALIASES
    )
  ) {
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
    lower.includes("era") ||
    lower.includes("whip") ||
    lower.includes("innings") ||
    lower.includes("strikeouts") ||
    lower.includes("strikeout") ||
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

  let value =
    match[1];

  if (
    /^\d{4}-/.test(value)
  ) {
    return formatDateISO(value);
  }

  if (
    !/\d{4}/.test(value)
  ) {
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

  let start =
    match[1];

  let end =
    match[2];

  if (
    !/\d{4}/.test(start)
  ) {
    start += `, ${CURRENT_SEASON}`;
  }

  if (
    !/\d{4}/.test(end)
  ) {
    end += `, ${CURRENT_SEASON}`;
  }

  return {
    start:
      formatDateISO(
        new Date(start)
      ),

    end:
      formatDateISO(
        new Date(end)
      )
  };
}

function parsePlayerNames(query) {
  const names = [];

  const knownMets = [
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
    "Cedric Mullins"
  ];

  for (const name of knownMets) {
    if (
      normalizeName(query).includes(
        normalizeName(name)
      )
    ) {
      names.push(name);
    }
  }

  return names;
}

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
    CS: 0
  };

  for (const split of games) {
    const stat =
      split?.stat || {};

    totals.G++;

    const keys = [
      "AB",
      "R",
      "H",
      "2B",
      "3B",
      "HR",
      "RBI",
      "BB",
      "SO",
      "SB",
      "CS"
    ];

    for (const key of keys) {
      const apiKey = {
        AB: "atBats",
        R: "runs",
        H: "hits",
        "2B": "doubles",
        "3B": "triples",
        HR: "homeRuns",
        RBI: "rbi",
        BB: "baseOnBalls",
        SO: "strikeOuts",
        SB: "stolenBases",
        CS: "caughtStealing"
      }[key];

      totals[key] +=
        numberOrNull(
          stat[apiKey]
        ) || 0;
    }
  }

  const avg =
    totals.AB > 0
      ? totals.H / totals.AB
      : null;

  let obp = null;
  let slg = null;
  let ops = null;

  /*
   * NOTE:
   *
   * This is intentionally calculated from the
   * underlying game totals rather than averaging
   * individual game OPS values.
   *
   * This is much more accurate.
   */

  const denominator =
    totals.AB +
    totals.BB;

  if (denominator > 0) {
    obp =
      (
        totals.H +
        totals.BB
      ) /
      denominator;
  }

  const totalBases =
    totals.H +
    totals["2B"] +
    2 * totals["3B"] +
    3 * totals.HR;

  if (totals.AB > 0) {
    slg =
      totalBases /
      totals.AB;
  }

  if (
    obp !== null &&
    slg !== null
  ) {
    ops =
      obp + slg;
  }

  return {
    ...totals,

    AVG: round(avg, 3),

    OBP: round(obp, 3),

    SLG: round(slg, 3),

    OPS: round(ops, 3)
  };
}

function parseInningsPitched(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  const str =
    String(value);

  const parts =
    str.split(".");

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

  for (const split of games) {
    const stat =
      split?.stat || {};

    wins +=
      numberOrNull(
        stat.wins
      ) || 0;

    losses +=
      numberOrNull(
        stat.losses
      ) || 0;

    saves +=
      numberOrNull(
        stat.saves
      ) || 0;

    earnedRuns +=
      numberOrNull(
        stat.earnedRuns
      ) || 0;

    hits +=
      numberOrNull(
        stat.hits
      ) || 0;

    walks +=
      numberOrNull(
        stat.baseOnBalls
      ) || 0;

    strikeouts +=
      numberOrNull(
        stat.strikeOuts
      ) || 0;

    innings +=
      parseInningsPitched(
        stat.inningsPitched
      );
  }

  const era =
    innings > 0
      ? (earnedRuns * 9) /
        innings
      : null;

  const whip =
    innings > 0
      ? (hits + walks) /
        innings
      : null;

  return {
    G: games.length,

    IP: round(innings, 2),

    W: wins,

    L: losses,

    SV: saves,

    ERA: round(era, 2),

    WHIP: round(whip, 2),

    SO: strikeouts,

    BB: walks,

    H: hits
  };
}

function formatResearchNumber(
  value,
  stat
) {
  if (
    value === null ||
    value === undefined
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
    [
      "era",
      "whip"
    ].includes(stat)
  ) {
    return Number(value)
      .toFixed(2);
  }

  if (stat === "ip") {
    return Number(value)
      .toFixed(1);
  }

  return String(
    Math.round(
      Number(value)
    )
  );
}

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

  return (
    labels[stat] ||
    stat.toUpperCase()
  );
}

function getStatValue(
  totals,
  stat
) {
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

  return totals[
    map[stat]
  ];
}

async function getPlayerGameStats(
  playerId,
  group
) {
  const data =
    await mlbSafe(
      `people/${playerId}/stats`,
      {
        stats: "gameLog",

        season:
          CURRENT_SEASON,

        group
      }
    );

  return Array.isArray(data?.stats)
    ? data.stats.flatMap(
        item =>
          item?.splits ||
          []
      )
    : [];
}

function filterGamesByDate(
  games,
  startDate,
  endDate
) {
  return games.filter(
    split => {
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
        (!startDate ||
          day >= startDate) &&
        (!endDate ||
          day <= endDate)
      );
    }
  );
}

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
      new Date(
        b.date ||
          b.gameDate
      ) -
      new Date(
        a.date ||
          a.gameDate
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
      selected.slice(
        0,
        lastN
      );

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
    query
      .toLowerCase()
      .includes(
        "last game"
      )
  ) {
    selected =
      selected.slice(
        0,
        1
      );

    period =
      "last game";
  }

  let totals;

  if (group === "pitching") {
    totals =
      calculatePitchingTotals(
        selected
      );
  } else {
    totals =
      calculateHittingTotals(
        selected
      );
  }

  const value =
    stat
      ? getStatValue(
          totals,
          stat
        )
      : null;

  return {
    type:
      "player-stat",

    player: {
      id: player.id,

      name:
        player.fullName,

      position:
        player.primaryPosition
          ?.name ||
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

async function comparePlayers(
  players,
  query
) {
  const stat =
    detectStat(query) ||
    "ops";

  const results = [];

  for (
    const player of players
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
    type:
      "comparison",

    stat,

    statLabel:
      statLabel(stat),

    results
  };
}

async function metsLeaders(
  query
) {
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
    await mlbSafe(
      "stats",
      {
        stats: "season",

        group,

        season:
          CURRENT_SEASON,

        teamIds:
          METS_ID,

        sportIds:
          MLB_SPORT_ID,

        hydrate:
          "person"
      }
    );

  const splits =
    data?.stats?.flatMap(
      groupData =>
        groupData?.splits ||
        []
    ) || [];

  const mapped =
    splits.map(
      split => {
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
            )
        };
      }
    );

  const filtered =
    mapped.filter(
      row =>
        row.value !== null
    );

  /*
   * ERA is a "lower is better" stat.
   * Everything else in this leaderboard
   * is treated as "higher is better."
   */

  if (stat === "era") {
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
    type:
      "leaderboard",

    group,

    stat,

    statLabel:
      statLabel(stat),

    players:
      filtered.slice(
        0,
        10
      )
  };
}

// ============================================================
// RESEARCH QUERY ENDPOINT
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
      // LEADERBOARDS
      // --------------------------------------------------------

      if (
        lower.includes("leader") ||
        lower.includes("leaders") ||
        lower.includes("most home runs") ||
        lower.includes("most hr")
      ) {
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
      // PLAYER IDENTIFICATION
      // --------------------------------------------------------

      let players =
        parsePlayerNames(
          query
        );

      if (!players.length) {
        const cleaned =
          query
            .replace(
              /\blast\s+\d+\s+games?\b/gi,
              ""
            )
            .replace(
              /\bsince\b.*$/i,
              ""
            )
            .replace(
              /\bstats?\b/gi,
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
            .map(
              value =>
                value
                  .replace(
                    /\bwhat is\b|\bwhat are\b|\bhow many\b/gi,
                    ""
                  )
                  .trim()
            )
            .filter(Boolean);

        for (
          const term of
          searchTerms.slice(
            0,
            3
          )
        ) {
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
        }
      }

      // --------------------------------------------------------
      // COMPARISON
      // --------------------------------------------------------

      if (
        players.length >= 2 &&
        (
          lower.includes(
            "compare"
          ) ||
          lower.includes(
            " vs "
          ) ||
          lower.includes(
            "versus"
          ) ||
          lower.includes(
            "who has more"
          ) ||
          lower.includes(
            "better"
          )
        )
      ) {
        const result =
          await comparePlayers(
            players.slice(
              0,
              4
            ),
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

      const search =
        await searchPlayers(
          query
        );

      return res.json({
        success: true,

        query,

        result: {
          type:
            "search",

          message:
            search.length
              ? "I found these players."
              : "I couldn't identify a player or statistic from that question.",

          players:
            search
              .slice(0, 10)
              .map(
                player => ({
                  id:
                    player.id,

                  name:
                    player.fullName,

                  position:
                    player
                      .primaryPosition
                      ?.name ||
                    "—"
                })
              )
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

      service:
        "Mets HQ",

      season:
        CURRENT_SEASON,

      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// SPA FALLBACK
// ============================================================
//
// IMPORTANT:
//
// DO NOT use:
//
// app.get("*", ...)
//
// Express 5 / path-to-regexp rejects that syntax.
//
// Instead, this middleware catches non-API routes after
// all API routes have already been registered.
//
// ============================================================

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET" &&
      req.method !== "HEAD"
    ) {
      return next();
    }

    if (
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
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
      `MLB API: ${MLB_API}`
    );
  }
);
