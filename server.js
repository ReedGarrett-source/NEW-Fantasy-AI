const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 10000;
const MLB_API = "https://statsapi.mlb.com/api/v1";
const METS_ID = 121;
const CURRENT_SEASON = 2026;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));


// ============================================================
// HELPERS
// ============================================================

async function mlbFetch(endpoint) {
  const response = await fetch(`${MLB_API}${endpoint}`);

  if (!response.ok) {
    throw new Error(
      `MLB API request failed: ${response.status}`
    );
  }

  return response.json();
}

function sendError(res, error, message = "Request failed.") {
  console.error(message, error);

  return res.status(500).json({
    success: false,
    error: error?.message || message
  });
}

function getPlayerId(player) {
  return (
    player?.person?.id ||
    player?.person?.personId ||
    player?.player?.id ||
    player?.id ||
    null
  );
}

function getPlayerName(player) {
  return (
    player?.person?.fullName ||
    player?.player?.fullName ||
    player?.fullName ||
    player?.name ||
    "Unknown Player"
  );
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Mets HQ server is running.",
    season: CURRENT_SEASON
  });
});


// ============================================================
// STANDINGS
// ============================================================

app.get("/api/mets/standings", async (req, res) => {
  try {
    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/standings?leagueId=104&leagueId=103&season=${season}&standingsTypes=regularSeason`
    );

    let mets = null;

    for (const record of data.records || []) {
      for (const teamRecord of record.teamRecords || []) {
        const teamId =
          Number(teamRecord.team?.id);

        if (teamId === METS_ID) {
          mets = teamRecord;
          break;
        }
      }

      if (mets) break;
    }

    if (!mets) {
      return res.status(404).json({
        success: false,
        error: "Mets standings could not be found."
      });
    }

    const wins =
      Number(mets.wins ?? 0);

    const losses =
      Number(mets.losses ?? 0);

    const divisionRank =
      mets.divisionRank ??
      mets.rank ??
      null;

    const gamesBack =
      mets.gamesBack ??
      null;

    let lastTen = null;

    if (mets.records?.splitRecords) {
      const splitRecords =
        mets.records.splitRecords;

      const lastTenRecord =
        splitRecords.find(record => {
          const type =
            String(record.type || "").toLowerCase();

          return (
            type.includes("last10") ||
            type.includes("last 10")
          );
        });

      if (lastTenRecord) {
        lastTen = {
          wins:
            Number(lastTenRecord.wins || 0),
          losses:
            Number(lastTenRecord.losses || 0)
        };
      }
    }

    res.json({
      success: true,

      mets: {
        ...mets,

        wins,
        losses,

        divisionRank,

        gamesBack,

        lastTen,

        streak:
          mets.streak || null,

        record: {
          wins,
          losses
        }
      }
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load Mets standings."
    );
  }
});


// ============================================================
// GAMES
// ============================================================

app.get("/api/mets/games", async (req, res) => {
  try {
    const startDate =
      req.query.startDate;

    const endDate =
      req.query.endDate;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error:
          "startDate and endDate are required."
      });
    }

    const data = await mlbFetch(
      `/schedule?sportId=1&teamId=${METS_ID}&startDate=${encodeURIComponent(
        startDate
      )}&endDate=${encodeURIComponent(
        endDate
      )}&hydrate=team,linescore`
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
    return sendError(
      res,
      error,
      "Unable to load Mets games."
    );
  }
});


// ============================================================
// ROSTER
// ============================================================

app.get("/api/mets/roster", async (req, res) => {
  try {
    const season =
      Number(req.query.season) || CURRENT_SEASON;

    const data = await mlbFetch(
      `/teams/${METS_ID}/roster?season=${season}&hydrate=person,position`
    );

    const roster =
      Array.isArray(data.roster)
        ? data.roster
        : [];

    res.json({
      success: true,
      roster
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load Mets roster."
    );
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

    const data = await mlbFetch(
      `/stats?stats=season&group=${group}&season=${season}&teamId=${METS_ID}&sportIds=1&hydrate=person,team`
    );

    const stats = [];

    for (const split of data.stats || []) {
      for (const item of split.splits || []) {
        stats.push(item);
      }
    }

    res.json({
      success: true,
      group,
      season,
      stats
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Unable to load Mets statistics."
    );
  }
});


// ============================================================
// PLAYER INFORMATION
// ============================================================

app.get("/api/player/:id", async (req, res) => {
  try {
    const playerId =
      encodeURIComponent(req.params.id);

    const data = await mlbFetch(
      `/people/${playerId}?hydrate=currentTeam,primaryPosition`
    );

    const player =
      data.people?.[0];

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
    return sendError(
      res,
      error,
      "Unable to load player information."
    );
  }
});


// ============================================================
// PLAYER STATS
// ============================================================

app.get(
  "/api/player/:id/stats",
  async (req, res) => {
    try {
      const playerId =
        encodeURIComponent(req.params.id);

      const season =
        Number(req.query.season) ||
        CURRENT_SEASON;

      const group =
        req.query.group === "pitching"
          ? "pitching"
          : "hitting";

      const data = await mlbFetch(
        `/people/${playerId}/stats?stats=season&group=${group}&season=${season}`
      );

      res.json({
        success: true,
        playerId,
        season,
        group,
        stats: data.stats || []
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Unable to load player statistics."
      );
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
      const endDate =
        new Date();

      const startDate =
        new Date();

      startDate.setDate(
        startDate.getDate() - 30
      );

      const formatDate = date =>
        date.toISOString().split("T")[0];

      const start =
        formatDate(startDate);

      const end =
        formatDate(endDate);

      const data = await mlbFetch(
        `/transactions?teamId=${METS_ID}&startDate=${start}&endDate=${end}`
      );

      const transactions =
        Array.isArray(data.transactions)
          ? data.transactions
          : [];

      res.json({
        success: true,
        transactions
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Unable to load Mets transactions."
      );
    }
  }
);


// ============================================================
// RESEARCH LAB
// ============================================================

function normalizePlayerName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

async function findPlayer(query) {

  const cleanQuery =
    normalizePlayerName(query);

  if (!cleanQuery) {
    return null;
  }

  const data = await mlbFetch(
    `/people/search?names=${encodeURIComponent(
      query
    )}`
  );

  const people =
    Array.isArray(data.people)
      ? data.people
      : [];

  if (!people.length) {
    return null;
  }

  const exact =
    people.find(person =>
      normalizePlayerName(
        person.fullName
      ) === cleanQuery
    );

  return exact || people[0];
}


// ============================================================
// RESEARCH HELPERS
// ============================================================

async function getPlayerSeasonStats(
  playerId,
  season = CURRENT_SEASON
) {

  const data = await mlbFetch(
    `/people/${playerId}/stats?stats=season&group=hitting&season=${season}`
  );

  const split =
    data.stats?.[0]?.splits?.[0];

  return split?.stat || null;
}

async function getPlayerLastNGames(
  playerId,
  games = 15
) {

  const data = await mlbFetch(
    `/people/${playerId}/stats?stats=lastNGames&group=hitting&limit=${games}`
  );

  const split =
    data.stats?.[0]?.splits?.[0];

  return split?.stat || null;
}


// ============================================================
// RESEARCH QUERY
// ============================================================

app.get("/api/mlb/query", async (req, res) => {
  try {

    const question =
      String(
        req.query.question || ""
      ).trim();

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "A question is required."
      });
    }

    const lower =
      question.toLowerCase();


    // --------------------------------------------------------
    // COMMON TEAM QUESTIONS
    // --------------------------------------------------------

    if (
      lower.includes("mets") &&
      (
        lower.includes("home run") ||
        lower.includes("hr leader")
      )
    ) {

      const data = await mlbFetch(
        `/stats?stats=season&group=hitting&season=${CURRENT_SEASON}&teamId=${METS_ID}&sportIds=1&hydrate=person`
      );

      const records =
        [];

      for (
        const statGroup
        of data.stats || []
      ) {

        for (
          const split
          of statGroup.splits || []
        ) {

          records.push({
            player:
              split.player,
            stat:
              split.stat
          });

        }
      }

      records.sort(
        (a, b) =>
          Number(
            b.stat?.homeRuns || 0
          ) -
          Number(
            a.stat?.homeRuns || 0
          )
      );

      return res.json({
        success: true,
        question,
        type: "team_home_run_leaders",
        stats:
          records.slice(0, 10)
      });
    }


    // --------------------------------------------------------
    // FIND PLAYER
    // --------------------------------------------------------

    const player =
      await findPlayer(question);

    if (!player) {

      return res.json({
        success: true,
        question,
        message:
          "No player was found for that search.",
        stats: []
      });

    }

    const playerId =
      player.id;


    // --------------------------------------------------------
    // LAST N GAMES
    // --------------------------------------------------------

    const lastGamesMatch =
      lower.match(
        /last\s+(\d+)\s+games?/
      );

    if (lastGamesMatch) {

      const requestedGames =
        Math.max(
          1,
          Math.min(
            140,
            Number(
              lastGamesMatch[1]
            )
          )
        );

      const stats =
        await getPlayerLastNGames(
          playerId,
          requestedGames
        );

      if (!stats) {
        return res.json({
          success: true,
          question,
          player:
            player.fullName,
          playerId,
          games:
            requestedGames,
          stats: {}
        });
      }

      return res.json({
        success: true,
        question,
        player:
          player.fullName,
        playerId,
        games:
          requestedGames,

        atBats:
          stats.atBats ?? null,

        hits:
          stats.hits ?? null,

        runs:
          stats.runs ?? null,

        doubles:
          stats.doubles ?? null,

        triples:
          stats.triples ?? null,

        homeRuns:
          stats.homeRuns ?? null,

        rbi:
          stats.rbi ?? null,

        walks:
          stats.baseOnBalls ?? null,

        strikeOuts:
          stats.strikeOuts ?? null,

        stolenBases:
          stats.stolenBases ?? null,

        caughtStealing:
          stats.caughtStealing ?? null,

        battingAverage:
          stats.avg ?? null,

        onBasePercentage:
          stats.obp ?? null,

        sluggingPercentage:
          stats.slg ?? null,

        OPS:
          stats.ops ?? null
      });

    }


    // --------------------------------------------------------
    // SEASON STATS
    // --------------------------------------------------------

    const stats =
      await getPlayerSeasonStats(
        playerId,
        CURRENT_SEASON
      );

    if (!stats) {

      return res.json({
        success: true,
        question,
        player:
          player.fullName,
        playerId,
        stats: {}
      });

    }


    // --------------------------------------------------------
    // SPECIFIC STAT ANSWERS
    // --------------------------------------------------------

    let answer = null;

    if (
      lower.includes("ops")
    ) {
      answer =
        stats.ops ?? null;
    }

    else if (
      lower.includes("batting average") ||
      /\bavg\b/.test(lower) ||
      lower.includes("average")
    ) {
      answer =
        stats.avg ?? null;
    }

    else if (
      lower.includes("home run") ||
      /\bhr\b/.test(lower)
    ) {
      answer =
        stats.homeRuns ?? null;
    }

    else if (
      lower.includes("rbi")
    ) {
      answer =
        stats.rbi ?? null;
    }

    else if (
      lower.includes("hits")
    ) {
      answer =
        stats.hits ?? null;
    }

    else if (
      lower.includes("walks") ||
      lower.includes("walk")
    ) {
      answer =
        stats.baseOnBalls ?? null;
    }

    else if (
      lower.includes("strikeout") ||
      /\bso\b/.test(lower)
    ) {
      answer =
        stats.strikeOuts ?? null;
    }


    return res.json({
      success: true,
      question,

      player:
        player.fullName,

      playerId,

      answer,

      stats
    });

  } catch (error) {

    return sendError(
      res,
      error,
      "Research query failed."
    );

  }
});


// ============================================================
// 404 API HANDLER
// ============================================================

app.use(
  "/api",
  (req, res) => {
    res.status(404).json({
      success: false,
      error:
        "API endpoint not found."
    });
  }
);


// ============================================================
// FRONTEND FALLBACK
// ============================================================

app.get("*", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "..",
      "index.html"
    )
  );

});


// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Mets HQ server running on port ${PORT}`
    );

    console.log(
      `MLB API: ${MLB_API}`
    );

    console.log(
      `Season: ${CURRENT_SEASON}`
    );

  }
);
