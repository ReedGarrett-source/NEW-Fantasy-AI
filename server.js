const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;

const MLB_API = "https://statsapi.mlb.com/api/v1";
const SAVANT_API = "https://baseballsavant.mlb.com";

const CURRENT_SEASON = 2026;
const METS_ID = 121;
const MLB_SPORT_ID = 1;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname)));

// ============================================================
// HELPERS
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

  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function normalizeName(name) {
  return cleanString(name)
    .toLowerCase()
    .replace(/[.'’,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  return d.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function safeDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateISO(value) {
  const d = safeDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

function inningsToDecimal(ip) {
  if (ip === null || ip === undefined) {
    return 0;
  }

  const text = String(ip);
  const parts = text.split(".");

  const whole = Number(parts[0]) || 0;

  let fraction = 0;

  if (parts[1] === "1") {
    fraction = 1 / 3;
  } else if (parts[1] === "2") {
    fraction = 2 / 3;
  }

  return whole + fraction;
}

function decimalToIP(value) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }

  const whole = Math.floor(Number(value));
  const outs = Math.round((Number(value) - whole) * 3);

  if (outs === 0) {
    return `${whole}.0`;
  }

  if (outs === 1) {
    return `${whole}.1`;
  }

  return `${whole}.2`;
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
// BASEBALL SAVANT / STATCAST
// ============================================================

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }

      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(field);
      field = "";

      if (row.some(value => value !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    field += char;
  }

  if (field.length || row.length) {
    row.push(field);

    if (row.some(value => value !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0];

  return rows.slice(1).map(values => {
    const object = {};

    headers.forEach((header, index) => {
      object[header] = values[index] ?? "";
    });

    return object;
  });
}

async function savantCSV(params = {}) {
  const url = new URL(
    `${SAVANT_API}/statcast_search/csv`
  );

  const defaults = {
    all: "true",
    hfPT: "",
    hfAB: "",
    hfBBT: "",
    hfPR: "",
    hfZ: "",
    stadium: "",
    hfBBL: "",
    hfNewZones: "",
    hfGT: "R|PO|S|",
    hfC: "",
    hfSit: "",
    hfOuts: "",
    opponent: "",
    pitcher_throws: "",
    batter_stands: "",
    hfSA: "",
    hfInfield: "",
    team: "",
    position: "",
    hfOutfield: "",
    hfRO: "",
    home_road: "",
    hfFlag: "",
    hfPull: "",
    metric_1: "",
    hfInn: "",
    min_pitches: "0",
    min_results: "0",
    group_by: "name",
    sort_col: "pitches",
    player_event_sort: "h_launch_speed",
    sort_order: "desc",
    min_abs: "0",
    type: "details"
  };

  const finalParams = {
    ...defaults,
    ...params
  };

  for (const [key, value] of Object.entries(finalParams)) {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "Mets-HQ/2.0"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Baseball Savant returned ${response.status}`
    );
  }

  if (
    text.toLowerCase().includes("error") &&
    text.length < 1000
  ) {
    throw new Error(
      `Baseball Savant error: ${text}`
    );
  }

  return parseCSV(text);
}

// ============================================================
// PLAYER SEARCH
// ============================================================

async function searchPlayers(query) {
  const q = cleanString(query);

  if (!q) {
    return [];
  }

  const data = await mlb(
    "people/search",
    { q }
  );

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

  const normalized = normalizeName(q);

  const exact = candidates.find(
    player =>
      normalizeName(player.fullName) ===
      normalized
  );

  if (exact) {
    return exact;
  }

  const starts = candidates.find(
    player =>
      normalizeName(player.fullName).startsWith(
        normalized
      )
  );

  if (starts) {
    return starts;
  }

  return candidates[0];
}

// ============================================================
// METS ROSTERS
// ============================================================

async function getMetsRoster(
  rosterType = "fullRoster"
) {
  const data = await mlb(
    `teams/${METS_ID}/roster`,
    {
      season: CURRENT_SEASON,
      rosterType
    }
  );

  return Array.isArray(data?.roster)
    ? data.roster
    : [];
}

async function getActiveMetsRoster() {
  return getMetsRoster("active");
}

async function getMetsPlayerMap() {
  const roster = await getMetsRoster("fullRoster");

  const map = new Map();

  for (const item of roster) {
    const id =
      item?.person?.id ||
      item?.id;

    if (!id) {
      continue;
    }

    map.set(String(id), item);
  }

  return map;
}

async function getActiveMetsIds() {
  const roster = await getActiveMetsRoster();

  return new Set(
    roster
      .map(item => item?.person?.id || item?.id)
      .filter(Boolean)
      .map(String)
  );
}

// ============================================================
// STAT OBJECTS
// ============================================================

function hittingStatObject(stat = {}) {
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
    OPS: numberOrNull(stat.ops),
    HBP: numberOrNull(stat.hitByPitch),
    SF: numberOrNull(stat.sacFlies)
  };
}

function pitchingStatObject(stat = {}) {
  return {
    G: numberOrNull(stat.gamesPitched),
    GS: numberOrNull(stat.gamesStarted),
    IP: stat.inningsPitched ?? null,
    W: numberOrNull(stat.wins),
    L: numberOrNull(stat.losses),
    SV: numberOrNull(stat.saves),
    H: numberOrNull(stat.hits),
    ER: numberOrNull(stat.earnedRuns),
    HR: numberOrNull(stat.homeRuns),
    BB: numberOrNull(stat.baseOnBalls),
    SO: numberOrNull(stat.strikeOuts),
    ERA: numberOrNull(stat.era),
    WHIP: numberOrNull(stat.whip)
  };
}

// ============================================================
// GET INDIVIDUAL SEASON STATS
// ============================================================

async function getPlayerSeasonStat(
  playerId,
  group
) {
  const data = await mlb(
    `people/${playerId}/stats`,
    {
      stats: "season",
      season: CURRENT_SEASON,
      group
    }
  );

  const splits =
    data?.stats?.flatMap(
      item => item?.splits || []
    ) || [];

  return splits[0]?.stat || null;
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

      const data = await mlb(
        "standings",
        {
          leagueId: "104,103",
          season,
          standingsTypes: "regularSeason"
        }
      );

      const records =
        data?.records?.flatMap(
          record => record?.teamRecords || []
        ) || [];

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

      const data = await mlb(
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

      const games =
        data?.dates?.flatMap(
          date => date?.games || []
        ) || [];

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
      const roster =
        await getMetsRoster(
          req.query.rosterType ||
            "fullRoster"
        );

      const activeIds =
        await getActiveMetsIds();

      const enriched =
        roster.map(player => {
          const id =
            player?.person?.id ||
            player?.id;

          return {
            ...player,

            isActive:
              activeIds.has(
                String(id)
              ),

            status:
              activeIds.has(
                String(id)
              )
                ? "Active"
                : (
                    player?.status?.description ||
                    "Inactive"
                  )
          };
        });

      res.json({
        success: true,
        roster: enriched,
        activePlayerIds:
          [...activeIds]
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
// METS STATS
//
// IMPORTANT:
// We intentionally fetch stats player-by-player.
// This prevents MLB's team stats endpoint from returning
// players who aren't actually Mets.
// ============================================================

app.get(
  "/api/mets/stats",
  async (req, res) => {
    try {
      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      const roster =
        await getMetsRoster("fullRoster");

      const activeIds =
        await getActiveMetsIds();

      const results = [];

      const chunks = [];

      for (let i = 0; i < roster.length; i += 8) {
        chunks.push(
          roster.slice(i, i + 8)
        );
      }

      for (const chunk of chunks) {
        const rows =
          await Promise.all(
            chunk.map(async player => {
              const id =
                player?.person?.id ||
                player?.id;

              if (!id) {
                return null;
              }

              try {
                const stat =
                  await getPlayerSeasonStat(
                    id,
                    group
                  );

                if (!stat) {
                  return null;
                }

                return {
                  player: {
                    id,
                    fullName:
                      player?.person?.fullName ||
                      "Unknown",
                    firstName:
                      player?.person?.firstName ||
                      "",
                    lastName:
                      player?.person?.lastName ||
                      "",
                    primaryPosition:
                      player?.position ||
                      player?.person?.primaryPosition ||
                      null,
                    jerseyNumber:
                      player?.jerseyNumber ||
                      player?.person?.primaryNumber ||
                      null
                  },

                  stat,

                  isActive:
                    activeIds.has(
                      String(id)
                    ),

                  status:
                    activeIds.has(
                      String(id)
                    )
                      ? "Active"
                      : (
                          player?.status?.description ||
                          "Inactive"
                        )
                };
              } catch (error) {
                console.warn(
                  `Stats failed for ${id}:`,
                  error.message
                );

                return null;
              }
            })
          );

        results.push(
          ...rows.filter(Boolean)
        );
      }

      results.sort((a, b) => {
        const aName =
          a?.player?.fullName || "";

        const bName =
          b?.player?.fullName || "";

        return aName.localeCompare(bName);
      });

      res.json({
        success: true,
        stats: results,
        group,
        season: CURRENT_SEASON,
        activePlayerIds:
          [...activeIds]
      });
    } catch (error) {
      console.error(
        "Mets stats:",
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
      const data =
        await mlb(
          `people/${encodeURIComponent(
            req.params.id
          )}`
        );

      const player =
        data?.people?.[0];

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
      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      const data =
        await mlb(
          `people/${encodeURIComponent(
            req.params.id
          )}/stats`,
          {
            stats: "season",
            season,
            group
          }
        );

      res.json({
        success: true,
        stats:
          data?.stats?.flatMap(
            item => item?.splits || []
          ) || [],
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
      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      const data =
        await mlb(
          `people/${encodeURIComponent(
            req.params.id
          )}/stats`,
          {
            stats: "gameLog",
            season,
            group
          }
        );

      const games =
        data?.stats?.flatMap(
          item => item?.splits || []
        ) || [];

      res.json({
        success: true,
        games,
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
// TRANSACTIONS
// ============================================================

app.get(
  "/api/mets/transactions",
  async (req, res) => {
    try {
      const data =
        await mlb(
          "transactions",
          {
            teamId: METS_ID,
            startDate:
              req.query.startDate ||
              dateDaysAgo(45),
            endDate:
              req.query.endDate ||
              todayISO()
          }
        );

      const transactions =
        Array.isArray(
          data?.transactions
        )
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
// MINOR LEAGUE / PROSPECT CENTER
// ============================================================

async function getMetsMinorLeagueTeams() {
  const sports = [11, 12, 13, 14];

  const teams = [];

  for (const sportId of sports) {
    try {
      const data =
        await mlb(
          "teams",
          {
            sportId,
            season: CURRENT_SEASON
          }
        );

      for (const team of data?.teams || []) {
        if (
          Number(team?.parentOrgId) ===
            METS_ID ||
          normalizeName(
            team?.parentOrgName
          ).includes("new york mets")
        ) {
          teams.push(team);
        }
      }
    } catch (error) {
      console.warn(
        "Minor league lookup:",
        error.message
      );
    }
  }

  const unique = new Map();

  for (const team of teams) {
    if (team?.id) {
      unique.set(
        String(team.id),
        team
      );
    }
  }

  return [...unique.values()];
}

async function getMinorRoster(teamId) {
  try {
    const data =
      await mlb(
        `teams/${teamId}/roster`,
        {
          season: CURRENT_SEASON
        }
      );

    return data?.roster || [];
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

      const prospects = [];

      for (const team of teams) {
        const roster =
          await getMinorRoster(
            team.id
          );

        for (const item of roster) {
          const person =
            item?.person || {};

          if (!person.id) {
            continue;
          }

          prospects.push({
            id: person.id,

            name:
              person.fullName ||
              "Unknown",

            firstName:
              person.firstName ||
              "",

            lastName:
              person.lastName ||
              "",

            position:
              item?.position?.abbreviation ||
              person?.primaryPosition?.abbreviation ||
              item?.position?.name ||
              "—",

            jerseyNumber:
              item?.jerseyNumber ||
              person?.primaryNumber ||
              "—",

            teamId:
              team.id,

            teamName:
              team.name,

            teamShortName:
              team.shortName ||
              team.name,

            level:
              team.sport?.name ||
              team.sport?.abbreviation ||
              "Minor League",

            league:
              team?.league?.name ||
              "",

            status:
              item?.status?.description ||
              "Active"
          });
        }
      }

      const unique = new Map();

      for (const player of prospects) {
        unique.set(
          String(player.id),
          player
        );
      }

      const finalProspects =
        [...unique.values()].sort(
          (a, b) =>
            a.name.localeCompare(b.name)
        );

      res.json({
        success: true,
        teams,
        prospects:
          finalProspects
      });
    } catch (error) {
      console.error(
        "Prospects:",
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
// PROSPECT PLAYER PAGE
// ============================================================

app.get(
  "/api/mets/prospects/:id",
  async (req, res) => {
    try {
      const id =
        req.params.id;

      const [personData, hittingData, pitchingData] =
        await Promise.all([
          mlb(`people/${id}`),

          mlb(
            `people/${id}/stats`,
            {
              stats: "season",
              season: CURRENT_SEASON,
              group: "hitting"
            }
          ),

          mlb(
            `people/${id}/stats`,
            {
              stats: "season",
              season: CURRENT_SEASON,
              group: "pitching"
            }
          )
        ]);

      const player =
        personData?.people?.[0] ||
        null;

      if (!player) {
        return res.status(404).json({
          success: false,
          error: "Prospect not found."
        });
      }

      res.json({
        success: true,

        player,

        hitting:
          hittingData?.stats?.flatMap(
            item => item?.splits || []
          ) || [],

        pitching:
          pitchingData?.stats?.flatMap(
            item => item?.splits || []
          ) || []
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
// STATCAST
// ============================================================

function normalizeSavantRow(row) {
  const get = (...keys) => {
    for (const key of keys) {
      if (
        row[key] !== undefined &&
        row[key] !== ""
      ) {
        return row[key];
      }
    }

    return null;
  };

  return {
    name:
      get(
        "player_name",
        "name_display_first_last",
        "player_name"
      ),

    playerId:
      get(
        "batter",
        "pitcher",
        "player_id"
      ),

    pa:
      numberOrNull(
        get("pa")
      ),

    ab:
      numberOrNull(
        get("ab")
      ),

    hits:
      numberOrNull(
        get("hits")
      ),

    xBA:
      numberOrNull(
        get("xba")
      ),

    xSLG:
      numberOrNull(
        get("xslg")
      ),

    xwOBA:
      numberOrNull(
        get("xwoba")
      ),

    wOBA:
      numberOrNull(
        get("woba")
      ),

    exitVelocity:
      numberOrNull(
        get(
          "launch_speed",
          "exit_velocity"
        )
      ),

    maxExitVelocity:
      numberOrNull(
        get(
          "max_launch_speed",
          "max_exit_velocity"
        )
      ),

    launchAngle:
      numberOrNull(
        get("launch_angle")
      ),

    barrels:
      numberOrNull(
        get("barrels")
      ),

    barrelRate:
      numberOrNull(
        get(
          "barrel_batted_rate",
          "barrel_rate"
        )
      ),

    hardHitRate:
      numberOrNull(
        get(
          "hard_hit_percent",
          "hard_hit_rate"
        )
      ),

    sprintSpeed:
      numberOrNull(
        get(
          "sprint_speed",
          "speed"
        )
      ),

    whiffRate:
      numberOrNull(
        get(
          "whiff_percent",
          "whiff_rate"
        )
      ),

    chaseRate:
      numberOrNull(
        get(
          "chase_percent",
          "chase_rate"
        )
      )
  };
}

app.get(
  "/api/statcast",
  async (req, res) => {
    try {
      const playerId =
        req.query.playerId ||
        req.query.player_id;

      const type =
        req.query.type === "pitcher"
          ? "pitcher"
          : "batter";

      const startDate =
        req.query.startDate ||
        `${CURRENT_SEASON}-03-01`;

      const endDate =
        req.query.endDate ||
        todayISO();

      const params = {
        player_type: type,
        game_date_gt: startDate,
        game_date_lt: endDate,
        hfSea: `${CURRENT_SEASON}|`
      };

      if (playerId) {
        params.player_id =
          String(playerId);
        delete params.all;
      }

      const rows =
        await savantCSV(params);

      const normalized =
        rows.map(normalizeSavantRow);

      res.json({
        success: true,

        source:
          "Baseball Savant / MLB Statcast",

        playerId:
          playerId || null,

        type,

        startDate,

        endDate,

        data:
          normalized
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
// STATCAST PLAYER
// ============================================================

app.get(
  "/api/player/:id/statcast",
  async (req, res) => {
    try {
      const id =
        req.params.id;

      const startDate =
        req.query.startDate ||
        `${CURRENT_SEASON}-03-01`;

      const endDate =
        req.query.endDate ||
        todayISO();

      const rows =
        await savantCSV({
          player_id: id,
          player_type:
            req.query.type ===
            "pitcher"
              ? "pitcher"
              : "batter",
          game_date_gt:
            startDate,
          game_date_lt:
            endDate,
          hfSea:
            `${CURRENT_SEASON}|`
        });

      res.json({
        success: true,

        playerId: id,

        startDate,

        endDate,

        data:
          rows.map(
            normalizeSavantRow
          )
      });
    } catch (error) {
      console.error(
        "Player Statcast:",
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

  era: ["era"],

  whip: ["whip"],

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
  ],

  xba: [
    "xba",
    "expected batting average"
  ],

  xslg: [
    "xslg",
    "expected slugging"
  ],

  xwoba: [
    "xwoba",
    "expected woba",
    "expected weighted on base"
  ],

  exitvelocity: [
    "exit velocity",
    "exit velo",
    "ev"
  ],

  hardhit: [
    "hard hit",
    "hard-hit",
    "hard hit rate"
  ],

  barrels: [
    "barrels",
    "barrel"
  ],

  sprintspeed: [
    "sprint speed",
    "speed"
  ]
};

function detectStat(query) {
  const lower =
    query.toLowerCase();

  const ordered =
    Object.entries(
      STAT_ALIASES
    ).sort(
      (a, b) =>
        Math.max(
          ...b[1].map(
            alias => alias.length
          )
        ) -
        Math.max(
          ...a[1].map(
            alias => alias.length
          )
        )
    );

  for (
    const [key, aliases]
    of ordered
  ) {
    if (
      aliases.some(
        alias =>
          lower.includes(
            alias
          )
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
    lower.includes("era") ||
    lower.includes("whip") ||
    lower.includes("innings") ||
    lower.includes("save") ||
    lower.includes("wins") ||
    lower.includes("losses") ||
    lower.includes("strikeout rate")
  ) {
    return "pitching";
  }

  return "hitting";
}

function detectLastN(query) {
  const match =
    query.match(
      /\blast\s+(\d+)\s+(?:games?|appearances?|starts?)\b/i
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

  if (
    /^\d{4}-/.test(value)
  ) {
    return formatDateISO(value);
  }

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
      formatDateISO(
        new Date(start)
      ),

    end:
      formatDateISO(
        new Date(end)
      )
  };
}

function parseLastNDays(query) {
  const match =
    query.match(
      /\blast\s+(\d+)\s+days?\b/i
    );

  if (!match) {
    return null;
  }

  const n =
    Number(match[1]);

  if (
    !Number.isFinite(n) ||
    n < 1 ||
    n > 365
  ) {
    return null;
  }

  return n;
}

// ============================================================
// GAME LOG CALCULATIONS
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

    const mappings = {
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
      CS: "caughtStealing",
      HBP: "hitByPitch",
      SF: "sacFlies"
    };

    for (
      const [key, apiKey]
      of Object.entries(mappings)
    ) {
      totals[key] +=
        numberOrNull(
          stat[apiKey]
        ) || 0;
    }
  }

  const avg =
    totals.AB
      ? totals.H / totals.AB
      : null;

  const obpDenominator =
    totals.AB +
    totals.BB +
    totals.HBP +
    totals.SF;

  const obp =
    obpDenominator
      ? (
          totals.H +
          totals.BB +
          totals.HBP
        ) /
        obpDenominator
      : null;

  const totalBases =
    totals.H +
    totals["2B"] +
    2 * totals["3B"] +
    3 * totals.HR;

  const slg =
    totals.AB
      ? totalBases / totals.AB
      : null;

  const ops =
    obp !== null &&
    slg !== null
      ? obp + slg
      : null;

  return {
    ...totals,
    AVG: round(avg, 3),
    OBP: round(obp, 3),
    SLG: round(slg, 3),
    OPS: round(ops, 3)
  };
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

    innings += inningsToDecimal(
      stat.inningsPitched
    );

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
  }

  return {
    G: games.length,

    IP:
      round(
        innings,
        2
      ),

    W: wins,

    L: losses,

    SV: saves,

    ERA:
      innings
        ? round(
            (earnedRuns * 9) /
              innings,
            2
          )
        : null,

    WHIP:
      innings
        ? round(
            (hits + walks) /
              innings,
            2
          )
        : null,

    SO: strikeouts,
    BB: walks,
    H: hits
  };
}

function statValue(
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

function formatResearchValue(
  value,
  stat
) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
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
    return decimalToIP(
      Number(value)
    );
  }

  return String(
    Math.round(
      Number(value)
    )
  );
}

// ============================================================
// PLAYER GAME DATA
// ============================================================

async function getPlayerGames(
  playerId,
  group
) {
  const data =
    await mlb(
      `people/${playerId}/stats`,
      {
        stats: "gameLog",
        season: CURRENT_SEASON,
        group
      }
    );

  return (
    data?.stats?.flatMap(
      item => item?.splits || []
    ) || []
  );
}

function sortGamesNewestFirst(games) {
  return [...games].sort(
    (a, b) => {
      const aDate =
        a?.date ||
        a?.gameDate ||
        a?.game?.gameDate ||
        "";

      const bDate =
        b?.date ||
        b?.gameDate ||
        b?.game?.gameDate ||
        "";

      return (
        new Date(bDate) -
        new Date(aDate)
      );
    }
  );
}

function filterByDate(
  games,
  start,
  end
) {
  return games.filter(game => {
    const date =
      formatDateISO(
        game?.date ||
          game?.gameDate ||
          game?.game?.gameDate
      );

    if (!date) {
      return false;
    }

    return (
      (!start || date >= start) &&
      (!end || date <= end)
    );
  });
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
    await getPlayerGames(
      player.id,
      group
    );

  games =
    sortGamesNewestFirst(
      games
    );

  const lastN =
    detectLastN(query);

  const lastDays =
    parseLastNDays(query);

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
  } else if (lastDays) {
    const start =
      dateDaysAgo(
        lastDays
      );

    selected =
      filterByDate(
        selected,
        start,
        todayISO()
      );

    period =
      `last ${lastDays} days`;
  } else if (dateRange) {
    selected =
      filterByDate(
        selected,
        dateRange.start,
        dateRange.end
      );

    period =
      `${dateRange.start} through ${dateRange.end}`;
  } else if (sinceDate) {
    selected =
      filterByDate(
        selected,
        sinceDate,
        todayISO()
      );

    period =
      `since ${sinceDate}`;
  } else if (
    query
      .toLowerCase()
      .includes("last game")
  ) {
    selected =
      selected.slice(
        0,
        1
      );

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
      ? statValue(
          totals,
          stat
        )
      : null;

  return {
    type:
      "player-stat",

    player: {
      id:
        player.id,

      name:
        player.fullName,

      position:
        player.primaryPosition?.name ||
        "—"
    },

    group,

    stat,

    statLabel:
      stat
        ? stat.toUpperCase()
        : null,

    value,

    formattedValue:
      stat
        ? formatResearchValue(
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
// RESEARCH PLAYER EXTRACTION
// ============================================================

function cleanResearchQuery(query) {
  return query
    .replace(
      /\blast\s+\d+\s+(?:games?|appearances?|starts?)\b/gi,
      ""
    )
    .replace(
      /\blast\s+\d+\s+days?\b/gi,
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
      /\bhow\s+many\b/gi,
      ""
    )
    .replace(
      /\bwhat\s+was\b/gi,
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
      /\bwho\s+has\s+more\b/gi,
      ""
    )
    .trim();
}

async function discoverPlayers(query) {
  const cleaned =
    cleanResearchQuery(
      query
    );

  const terms =
    cleaned
      .split(
        /\s+(?:vs\.?|versus|and|with)\s+/i
      )
      .map(
        value =>
          value
            .replace(
              /\bOPS\b/gi,
              ""
            )
            .replace(
              /\bHRs?\b/gi,
              ""
            )
            .replace(
              /\bhome runs?\b/gi,
              ""
            )
            .replace(
              /\bERA\b/gi,
              ""
            )
            .trim()
      )
      .filter(
        Boolean
      );

  const players = [];

  for (
    const term of terms.slice(
      0,
      4
    )
  ) {
    const found =
      await searchPlayers(
        term
      );

    if (!found.length) {
      continue;
    }

    const exact =
      found.find(
        player =>
          normalizeName(
            player.fullName
          ) ===
          normalizeName(term)
      );

    const player =
      exact ||
      found[0];

    if (
      player &&
      !players.some(
        existing =>
          String(existing.id) ===
          String(player.id)
      )
    ) {
      players.push(
        player
      );
    }
  }

  return players;
}

// ============================================================
// COMPARISON
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
    const research =
      await researchPlayer(
        player,
        query
      );

    const value =
      statValue(
        research.totals,
        stat
      );

    results.push({
      name:
        player.fullName,

      id:
        player.id,

      value,

      formattedValue:
        formatResearchValue(
          value,
          stat
        ),

      period:
        research.period
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
      stat.toUpperCase(),

    results
  };
}

// ============================================================
// METS LEADERS
//
// We explicitly obtain the Mets roster IDs and then query each
// Mets player. This prevents non-Mets from appearing.
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

  const roster =
    await getMetsRoster(
      "fullRoster"
    );

  const rows = [];

  for (
    let i = 0;
    i < roster.length;
    i += 8
  ) {
    const chunk =
      roster.slice(
        i,
        i + 8
      );

    const result =
      await Promise.all(
        chunk.map(
          async player => {
            const id =
              player?.person?.id ||
              player?.id;

            if (!id) {
              return null;
            }

            try {
              const statData =
                await getPlayerSeasonStat(
                  id,
                  group
                );

              if (!statData) {
                return null;
              }

              const totals =
                group === "pitching"
                  ? pitchingStatObject(
                      statData
                    )
                  : hittingStatObject(
                      statData
                    );

              const value =
                statValue(
                  totals,
                  stat
                );

              if (
                value === null ||
                value === undefined
              ) {
                return null;
              }

              return {
                name:
                  player?.person?.fullName ||
                  "Unknown",

                id,

                position:
                  player?.position?.abbreviation ||
                  player?.person?.primaryPosition?.abbreviation ||
                  "—",

                value,

                formattedValue:
                  formatResearchValue(
                    value,
                    stat
                  )
              };
            } catch {
              return null;
            }
          }
        )
      );

    rows.push(
      ...result.filter(Boolean)
    );
  }

  rows.sort(
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
    type:
      "leaderboard",

    team:
      "New York Mets",

    group,

    stat,

    statLabel:
      stat.toUpperCase(),

    players:
      rows.slice(
        0,
        15
      )
  };
}

// ============================================================
// STAT OF THE DAY
// ============================================================

app.get(
  "/api/mets/stat-of-day",
  async (req, res) => {
    try {
      const roster =
        await getMetsRoster(
          "fullRoster"
        );

      const activeIds =
        await getActiveMetsIds();

      const candidates = [];

      for (
        let i = 0;
        i < roster.length;
        i += 8
      ) {
        const chunk =
          roster.slice(
            i,
            i + 8
          );

        const rows =
          await Promise.all(
            chunk.map(
              async player => {
                const id =
                  player?.person?.id ||
                  player?.id;

                if (!id) {
                  return null;
                }

                try {
                  const stat =
                    await getPlayerSeasonStat(
                      id,
                      "hitting"
                    );

                  if (!stat) {
                    return null;
                  }

                  return {
                    name:
                      player?.person?.fullName,

                    id,

                    hr:
                      numberOrNull(
                        stat.homeRuns
                      ) || 0,

                    ops:
                      numberOrNull(
                        stat.ops
                      ),

                    avg:
                      numberOrNull(
                        stat.avg
                      ),

                    rbi:
                      numberOrNull(
                        stat.rbi
                      ),

                    active:
                      activeIds.has(
                        String(id)
                      )
                  };
                } catch {
                  return null;
                }
              }
            )
          );

        candidates.push(
          ...rows.filter(Boolean)
        );
      }

      const best =
        [...candidates]
          .filter(
            player =>
              player.active
          )
          .sort(
            (a, b) =>
              b.hr - a.hr
          )[0];

      if (!best) {
        return res.json({
          success: true,
          stat: null
        });
      }

      res.json({
        success: true,

        stat: {
          player:
            best.name,

          playerId:
            best.id,

          label:
            "Home Runs",

          value:
            best.hr,

          text:
            `${best.name} leads the Mets with ${best.hr} home runs in the ${CURRENT_SEASON} season.`,

          verified:
            true,

          season:
            CURRENT_SEASON
        }
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

      // ------------------------------------------------------
      // METS LEADERS
      // ------------------------------------------------------

      if (
        (
          lower.includes("mets") &&
          (
            lower.includes("leader") ||
            lower.includes("most") ||
            lower.includes("top")
          )
        )
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

      // ------------------------------------------------------
      // DISCOVER PLAYERS DYNAMICALLY
      // ------------------------------------------------------

      const players =
        await discoverPlayers(
          query
        );

      // ------------------------------------------------------
      // COMPARISON
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // PLAYER QUESTION
      // ------------------------------------------------------

      if (
        players.length >= 1
      ) {
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

      // ------------------------------------------------------
      // GENERAL PLAYER SEARCH
      // ------------------------------------------------------

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
              : "I couldn't identify a player from that question.",

          players:
            search
              .slice(
                0,
                15
              )
              .map(
                player => ({
                  id:
                    player.id,

                  name:
                    player.fullName,

                  position:
                    player.primaryPosition?.name ||
                    "—",

                  team:
                    player.currentTeam?.name ||
                    ""
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
// HEALTH
// ============================================================

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      success: true,
      service: "Mets HQ",
      season: CURRENT_SEASON,
      timestamp:
        new Date().toISOString()
    });
  }
);

// ============================================================
// EXPRESS 5 SPA FALLBACK
//
// DO NOT USE app.get("*") HERE.
// Express 5 / path-to-regexp rejects "*".
//
// This middleware only serves index.html for non-API,
// non-file requests.
// ============================================================

app.use(
  (req, res, next) => {
    if (
      req.method !== "GET"
    ) {
      return next();
    }

    if (
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    if (
      path.extname(req.path)
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

    if (
      res.headersSent
    ) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Internal server error."
    });
  }
);

// ============================================================
// START
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
      "Statcast: Baseball Savant enabled"
    );
  }
);
