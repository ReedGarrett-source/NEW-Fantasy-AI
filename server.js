const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const MLB_API = "https://statsapi.mlb.com/api/v1";

const METS_ID = 121;
const CURRENT_SEASON = 2026;

// ============================================
// MIDDLEWARE
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// ============================================
// MLB API HELPER
// ============================================

async function mlbFetch(endpoint) {
  const url = `${MLB_API}${endpoint}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `MLB API returned ${response.status} for ${endpoint}`
    );
  }

  return response.json();
}

// ============================================
// HEALTH CHECK
// ============================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "Mets HQ",
    season: CURRENT_SEASON
  });
});

// ============================================
// METS TEAM INFO
// ============================================

app.get("/api/mets/team", async (req, res) => {
  try {
    const data = await mlbFetch(
      `/teams/${METS_ID}?hydrate=venue,division,league`
    );

    const team = data.teams?.[0];

    res.json({
      success: true,
      team
    });

  } catch (error) {
    console.error("Team error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets team information."
    });
  }
});

// ============================================
// STANDINGS
// ============================================

app.get("/api/mets/standings", async (req, res) => {
  try {
    const season = Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/standings?leagueId=104&season=${season}&standingsTypes=regularSeason&hydrate=team`
    );

    let metsRecord = null;
    let division = null;

    for (const record of data.records || []) {

      const found = (record.teamRecords || []).find(
        team => Number(team.team?.id) === METS_ID
      );

      if (found) {
        metsRecord = found;
        division = record;
      }
    }

    res.json({
      success: true,
      season,
      mets: metsRecord,
      division
    });

  } catch (error) {
    console.error("Standings error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets standings."
    });
  }
});

// ============================================
// METS SCHEDULE
// ============================================

app.get("/api/mets/schedule", async (req, res) => {
  try {

    const season = Number(req.query.season) || CURRENT_SEASON;

    const startDate =
      req.query.startDate ||
      `${season}-01-01`;

    const endDate =
      req.query.endDate ||
      `${season}-12-31`;

    const data = await mlbFetch(
      `/schedule?teamId=${METS_ID}&sportId=1&season=${season}&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,probablePitcher`
    );

    const games = [];

    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        games.push(game);
      }
    }

    res.json({
      success: true,
      season,
      games
    });

  } catch (error) {
    console.error("Schedule error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets schedule."
    });
  }
});

// ============================================
// UPCOMING / RECENT GAMES
// ============================================

app.get("/api/mets/games", async (req, res) => {
  try {

    const today = new Date();

    const start = new Date(today);
    start.setDate(start.getDate() - 10);

    const end = new Date(today);
    end.setDate(end.getDate() + 10);

    const formatDate = date =>
      date.toISOString().split("T")[0];

    const startDate = formatDate(start);
    const endDate = formatDate(end);

    const data = await mlbFetch(
      `/schedule?teamId=${METS_ID}&sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,probablePitcher`
    );

    const games = [];

    for (const date of data.dates || []) {
      for (const game of date.games || []) {
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
      error: "Unable to load recent Mets games."
    });
  }
});

// ============================================
// METS ROSTER
// ============================================

app.get("/api/mets/roster", async (req, res) => {
  try {

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const rosterType =
      req.query.rosterType || "40Man";

    const data = await mlbFetch(
      `/teams/${METS_ID}/roster?season=${season}&rosterType=${rosterType}`
    );

    res.json({
      success: true,
      season,
      rosterType,
      roster: data.roster || []
    });

  } catch (error) {
    console.error("Roster error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets roster."
    });
  }
});

// ============================================
// METS TEAM STATS
// ============================================

app.get("/api/mets/stats", async (req, res) => {
  try {

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group || "hitting";

    const data = await mlbFetch(
      `/teams/${METS_ID}/stats?season=${season}&group=${group}&stats=season`
    );

    res.json({
      success: true,
      season,
      group,
      stats: data.stats || []
    });

  } catch (error) {
    console.error("Stats error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets statistics."
    });
  }
});

// ============================================
// PLAYER PROFILE
// ============================================

app.get("/api/player/:id", async (req, res) => {
  try {

    const playerId = Number(req.params.id);

    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: "Invalid player ID."
      });
    }

    const data = await mlbFetch(
      `/people/${playerId}?hydrate=currentTeam`
    );

    const player = data.people?.[0];

    res.json({
      success: true,
      player
    });

  } catch (error) {
    console.error("Player error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load player information."
    });
  }
});

// ============================================
// PLAYER STATS
// ============================================

app.get("/api/player/:id/stats", async (req, res) => {
  try {

    const playerId = Number(req.params.id);

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group || "hitting";

    const statsType =
      req.query.stats || "season";

    const data = await mlbFetch(
      `/people/${playerId}/stats?stats=${statsType}&group=${group}&season=${season}`
    );

    res.json({
      success: true,
      playerId,
      season,
      group,
      stats: data.stats || []
    });

  } catch (error) {
    console.error("Player stats error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load player statistics."
    });
  }
});

// ============================================
// PLAYER SEARCH
// ============================================

app.get("/api/players/search", async (req, res) => {
  try {

    const name = String(req.query.name || "").trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Enter a player name."
      });
    }

    const data = await mlbFetch(
      `/people/search?names=${encodeURIComponent(name)}`
    );

    res.json({
      success: true,
      players: data.people || []
    });

  } catch (error) {
    console.error("Player search error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to search for players."
    });
  }
});

// ============================================
// TRANSACTIONS
// ============================================

app.get("/api/mets/transactions", async (req, res) => {
  try {

    const endDate =
      req.query.endDate ||
      new Date().toISOString().split("T")[0];

    const startDate =
      req.query.startDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split("T")[0];
      })();

    const data = await mlbFetch(
      `/transactions?teamId=${METS_ID}&startDate=${startDate}&endDate=${endDate}`
    );

    res.json({
      success: true,
      startDate,
      endDate,
      transactions: data.transactions || []
    });

  } catch (error) {
    console.error("Transactions error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets transactions."
    });
  }
});

// ============================================
// FRONTEND FALLBACK
// ============================================

app.use((req, res, next) => {

  if (
    req.method === "GET" &&
    !req.path.startsWith("/api/")
  ) {
    return res.sendFile(
      path.join(__dirname, "public", "index.html")
    );
  }

  next();
});

// ============================================
// 404
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found."
  });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((error, req, res, next) => {

  console.error("Server error:", error);

  res.status(500).json({
    success: false,
    error: "Internal server error."
  });
});

// ============================================
// START
// ============================================

app.listen(PORT, () => {

  console.log(
    `Mets HQ running on port ${PORT}`
  );

});
