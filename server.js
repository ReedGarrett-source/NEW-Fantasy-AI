const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const MLB_API = "https://statsapi.mlb.com/api/v1";

const METS_ID = 121;
const CURRENT_SEASON = 2026;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));


// ============================================
// MLB API HELPER
// ============================================

async function mlbFetch(endpoint) {

  const url = `${MLB_API}${endpoint}`;

  console.log("MLB REQUEST:", url);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `MLB API returned ${response.status} for ${endpoint}`
    );
  }

  return response.json();
}


// ============================================
// HEALTH
// ============================================

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    service: "Mets HQ",
    season: CURRENT_SEASON
  });

});


// ============================================
// TEAM
// ============================================

app.get("/api/mets/team", async (req, res) => {

  try {

    const data = await mlbFetch(
      `/teams/${METS_ID}?hydrate=venue,division,league`
    );

    res.json({
      success: true,
      team: data.teams?.[0] || null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets team."
    });

  }

});


// ============================================
// STANDINGS
// ============================================

app.get("/api/mets/standings", async (req, res) => {

  try {

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/standings?leagueId=104&season=${season}&standingsTypes=regularSeason&hydrate=team`
    );

    let metsRecord = null;
    let division = null;

    for (const record of data.records || []) {

      const found =
        (record.teamRecords || []).find(
          team =>
            Number(team.team?.id) === METS_ID
        );

      if (found) {

        metsRecord = found;
        division = record;

        break;
      }
    }

    res.json({
      success: true,
      season,
      mets: metsRecord,
      division
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets standings."
    });

  }

});


// ============================================
// GAMES
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

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets games."
    });

  }

});


// ============================================
// ACTIVE ROSTER
// ============================================

app.get("/api/mets/roster", async (req, res) => {

  try {

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/teams/${METS_ID}/roster?season=${season}&rosterType=active&hydrate=person`
    );

    res.json({
      success: true,
      season,
      rosterType: "active",
      roster: data.roster || []
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load active Mets roster."
    });

  }

});


// ============================================
// PLAYER HITTING STATS
// ============================================

app.get("/api/mets/stats", async (req, res) => {

  try {

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/stats?stats=season&group=hitting&season=${season}&sportIds=1&teamId=${METS_ID}&playerPool=ALL&hydrate=person,team&limit=100&sortStat=atBats&order=desc`
    );

    const splits =
      data.stats?.[0]?.splits || [];

    res.json({
      success: true,
      season,
      stats: splits
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets player statistics."
    });

  }

});


// ============================================
// PLAYER PROFILE
// ============================================

app.get("/api/player/:id", async (req, res) => {

  try {

    const playerId =
      Number(req.params.id);

    if (!playerId) {

      return res.status(400).json({
        success: false,
        error: "Invalid player ID."
      });

    }

    const data = await mlbFetch(
      `/people/${playerId}?hydrate=currentTeam`
    );

    res.json({
      success: true,
      player: data.people?.[0] || null
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load player."
    });

  }

});


// ============================================
// PLAYER STATS
// ============================================

app.get("/api/player/:id/stats", async (req, res) => {

  try {

    const playerId =
      Number(req.params.id);

    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const group =
      req.query.group || "hitting";

    const data = await mlbFetch(
      `/people/${playerId}/stats?stats=season&group=${group}&season=${season}`
    );

    res.json({
      success: true,
      stats: data.stats || []
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load player stats."
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

        const date = new Date();

        date.setDate(
          date.getDate() - 45
        );

        return date
          .toISOString()
          .split("T")[0];

      })();

    const data = await mlbFetch(
      `/transactions?teamId=${METS_ID}&startDate=${startDate}&endDate=${endDate}`
    );

    let transactions =
      data.transactions || [];


    // ----------------------------------------
    // Remove exact duplicate transactions
    // ----------------------------------------

    const seen = new Set();

    transactions =
      transactions.filter(transaction => {

        const key = [
          transaction.date,
          transaction.description,
          transaction.player?.id,
          transaction.typeDesc
        ]
          .map(value => value ?? "")
          .join("|");

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;

      });


    // ----------------------------------------
    // Newest → oldest
    // ----------------------------------------

    transactions.sort((a, b) => {

      const dateA =
        new Date(a.date || 0).getTime();

      const dateB =
        new Date(b.date || 0).getTime();

      return dateB - dateA;

    });


    res.json({
      success: true,
      startDate,
      endDate,
      transactions
    });

  } catch (error) {

    console.error(error);

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
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }

  next();

});


app.use((req, res) => {

  res.status(404).json({
    success: false,
    error: "Route not found."
  });

});


app.use((error, req, res, next) => {

  console.error(
    "SERVER ERROR:",
    error
  );

  res.status(500).json({
    success: false,
    error: "Internal server error."
  });

});


app.listen(PORT, () => {

  console.log(
    `Mets HQ running on port ${PORT}`
  );

});
