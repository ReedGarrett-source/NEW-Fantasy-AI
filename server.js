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


// ============================================================
// MLB API HELPER
// ============================================================

async function mlbFetch(endpoint) {

  const url = `${MLB_API}${endpoint}`;

  console.log("MLB REQUEST:", url);

  const response = await fetch(url);

  if (!response.ok) {

    const text = await response.text();

    console.error(
      "MLB API ERROR:",
      response.status,
      text
    );

    throw new Error(
      `MLB API returned ${response.status}`
    );

  }

  return response.json();

}


// ============================================================
// DATE HELPERS
// ============================================================

function easternDate(offsetDays = 0) {

  const now = new Date();

  const easternParts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(now);

  const year =
    Number(
      easternParts.find(
        part => part.type === "year"
      ).value
    );

  const month =
    Number(
      easternParts.find(
        part => part.type === "month"
      ).value
    );

  const day =
    Number(
      easternParts.find(
        part => part.type === "day"
      ).value
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() + offsetDays
  );

  return date
    .toISOString()
    .split("T")[0];

}


// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {

  res.json({
    success: true,
    service: "Mets HQ",
    season: CURRENT_SEASON
  });

});


// ============================================================
// TEAM
// ============================================================

app.get("/api/mets/team", async (req, res) => {

  try {

    const data =
      await mlbFetch(
        `/teams/${METS_ID}?hydrate=venue,division,league`
      );

    res.json({
      success: true,
      team: data.teams?.[0] || null
    });

  } catch (error) {

    console.error("TEAM:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets team."
    });

  }

});


// ============================================================
// STANDINGS
// ============================================================

app.get("/api/mets/standings", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data =
      await mlbFetch(
        `/standings?leagueId=104&season=${season}&standingsTypes=regularSeason&hydrate=team`
      );

    let metsRecord = null;
    let division = null;

    for (
      const record of data.records || []
    ) {

      const found =
        (record.teamRecords || [])
          .find(
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

    console.error("STANDINGS:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets standings."
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
      easternDate(0);

    const endDate =
      req.query.endDate ||
      easternDate(21);

    const data =
      await mlbFetch(
        `/schedule?teamId=${METS_ID}&sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,probablePitcher`
      );

    const games = [];

    for (
      const date of data.dates || []
    ) {

      for (
        const game of date.games || []
      ) {

        const home =
          game.teams?.home || {};

        const away =
          game.teams?.away || {};

        const homeTeam =
          home.team || {};

        const awayTeam =
          away.team || {};

        const homeId =
          Number(homeTeam.id);

        const awayId =
          Number(awayTeam.id);

        const metsIsHome =
          homeId === METS_ID;

        const metsSide =
          metsIsHome
            ? home
            : away;

        const opponentSide =
          metsIsHome
            ? away
            : home;

        const opponentTeam =
          opponentSide.team || {};

        games.push({

          gamePk:
            game.gamePk,

          gameDate:
            game.gameDate,

          officialDate:
            game.officialDate,

          status:
            game.status || {},

          seriesDescription:
            game.seriesDescription || "",

          gameType:
            game.gameType || "",

          metsIsHome,

          location:
            metsIsHome
              ? "vs."
              : "@",

          opponent: {

            id:
              Number(opponentTeam.id) || null,

            name:
              opponentTeam.name ||
              opponentTeam.teamName ||
              opponentTeam.clubName ||
              "Unknown Opponent",

            abbreviation:
              opponentTeam.abbreviation ||
              ""

          },

          metsScore:
            typeof metsSide.score === "number"
              ? metsSide.score
              : null,

          opponentScore:
            typeof opponentSide.score === "number"
              ? opponentSide.score
              : null,

          probablePitcher:
            metsSide.probablePitcher ||
            null,

          opponentProbablePitcher:
            opponentSide.probablePitcher ||
            null

        });

      }

    }

    games.sort(
      (a, b) =>
        new Date(a.gameDate) -
        new Date(b.gameDate)
    );

    res.json({
      success: true,
      startDate,
      endDate,
      games
    });

  } catch (error) {

    console.error("GAMES:", error);

    res.status(500).json({
      success: false,
      error: "Unable to load Mets games."
    });

  }

});


// ============================================================
// LAST 10 GAMES
// ============================================================

app.get("/api/mets/last10", async (req, res) => {

  try {

    const today =
      easternDate(0);

    // Look back far enough to account for off-days.
    const startDate =
      easternDate(-30);

    const data =
      await mlbFetch(
        `/schedule?teamId=${METS_ID}&sportId=1&startDate=${startDate}&endDate=${today}&hydrate=team,linescore`
      );

    const completed = [];

    for (
      const date of data.dates || []
    ) {

      for (
        const game of date.games || []
      ) {

        if (
          game.status?.abstractGameState !==
          "Final"
        ) {
          continue;
        }

        const home =
          game.teams?.home || {};

        const away =
          game.teams?.away || {};

        const homeId =
          Number(home.team?.id);

        const awayId =
          Number(away.team?.id);

        const metsIsHome =
          homeId === METS_ID;

        const mets =
          metsIsHome
            ? home
            : away;

        const opponent =
          metsIsHome
            ? away
            : home;

        const metsScore =
          Number(mets.score);

        const opponentScore =
          Number(opponent.score);

        if (
          !Number.isFinite(metsScore) ||
          !Number.isFinite(opponentScore)
        ) {
          continue;
        }

        completed.push({

          gameDate:
            game.gameDate,

          metsScore,

          opponentScore,

          opponent:
            opponent.team?.name ||
            opponent.team?.teamName ||
            "Unknown Opponent",

          win:
            metsScore > opponentScore,

          loss:
            metsScore < opponentScore

        });

      }

    }

    completed.sort(
      (a, b) =>
        new Date(b.gameDate) -
        new Date(a.gameDate)
    );

    const last10 =
      completed.slice(0, 10);

    const wins =
      last10.filter(
        game => game.win
      ).length;

    const losses =
      last10.filter(
        game => game.loss
      ).length;

    res.json({

      success: true,

      record:
        `${wins}-${losses}`,

      wins,

      losses,

      games:
        last10

    });

  } catch (error) {

    console.error(
      "LAST 10:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to calculate last 10 games."
    });

  }

});


// ============================================================
// ACTIVE ROSTER
// ============================================================

app.get("/api/mets/roster", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data =
      await mlbFetch(
        `/teams/${METS_ID}/roster?season=${season}&rosterType=active&hydrate=person`
      );

    const roster =
      data.roster || [];

    res.json({

      success: true,

      season,

      rosterType:
        "active",

      roster

    });

  } catch (error) {

    console.error(
      "ROSTER:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to load active Mets roster."
    });

  }

});


// ============================================================
// DEPTH CHART
// ============================================================

app.get("/api/mets/depth", async (req, res) => {

  try {

    const data =
      await mlbFetch(
        `/teams/${METS_ID}/roster?rosterType=depthChart&season=${CURRENT_SEASON}&hydrate=person`
      );

    res.json({

      success: true,

      roster:
        data.roster || []

    });

  } catch (error) {

    console.error(
      "DEPTH:",
      error
    );

    res.json({

      success: true,

      roster: []

    });

  }

});


// ============================================================
// PLAYER STATS
// ============================================================

app.get("/api/mets/stats", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data =
      await mlbFetch(
        `/stats?stats=season&group=hitting&season=${season}&sportIds=1&teamId=${METS_ID}&playerPool=ALL&limit=200&hydrate=person,team`
      );

    const splits =
      data.stats?.[0]?.splits || [];

    const stats = [];

    for (
      const split of splits
    ) {

      const stat =
        split.stat || {};

      const player =
        split.player ||
        split.person ||
        {};

      if (!player.id) {
        continue;
      }

      stats.push({

        player: {

          id:
            Number(player.id),

          fullName:
            player.fullName ||
            player.name ||
            "Unknown Player"

        },

        games:
          stat.gamesPlayed ??
          stat.games ??
          0,

        atBats:
          stat.atBats ?? 0,

        hits:
          stat.hits ?? 0,

        homeRuns:
          stat.homeRuns ?? 0,

        rbi:
          stat.rbi ?? 0,

        avg:
          stat.avg ?? ".000",

        obp:
          stat.obp ?? ".000",

        slg:
          stat.slg ?? ".000",

        ops:
          stat.ops ?? ".000"

      });

    }

    // Sort by at-bats.
    stats.sort(
      (a, b) =>
        Number(b.atBats) -
        Number(a.atBats)
    );

    res.json({

      success: true,

      season,

      stats

    });

  } catch (error) {

    console.error(
      "STATS:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to load Mets player statistics."
    });

  }

});


// ============================================================
// PLAYER PROFILE
// ============================================================

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

    const data =
      await mlbFetch(
        `/people/${playerId}?hydrate=currentTeam`
      );

    res.json({

      success: true,

      player:
        data.people?.[0] || null

    });

  } catch (error) {

    console.error(
      "PLAYER:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to load player."
    });

  }

});


// ============================================================
// INDIVIDUAL PLAYER STATS
// ============================================================

app.get("/api/player/:id/stats", async (req, res) => {

  try {

    const playerId =
      Number(req.params.id);

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const group =
      req.query.group ||
      "hitting";

    const data =
      await mlbFetch(
        `/people/${playerId}/stats?stats=season&group=${group}&season=${season}`
      );

    res.json({

      success: true,

      stats:
        data.stats || []

    });

  } catch (error) {

    console.error(
      "PLAYER STATS:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to load player stats."
    });

  }

});


// ============================================================
// TRANSACTIONS
// ============================================================

app.get("/api/mets/transactions", async (req, res) => {

  try {

    const endDate =
      req.query.endDate ||
      easternDate(0);

    const startDate =
      req.query.startDate ||
      easternDate(-45);

    const data =
      await mlbFetch(
        `/transactions?teamId=${METS_ID}&startDate=${startDate}&endDate=${endDate}`
      );

    let transactions =
      data.transactions || [];

    const seen =
      new Set();

    transactions =
      transactions.filter(
        transaction => {

          const key =
            [
              transaction.date,
              transaction.description,
              transaction.player?.id,
              transaction.typeDesc
            ]
              .map(
                value =>
                  value ?? ""
              )
              .join("|");

          if (
            seen.has(key)
          ) {

            return false;

          }

          seen.add(key);

          return true;

        }
      );

    transactions.sort(
      (a, b) =>
        new Date(b.date || 0) -
        new Date(a.date || 0)
    );

    res.json({

      success: true,

      startDate,

      endDate,

      transactions

    });

  } catch (error) {

    console.error(
      "TRANSACTIONS:",
      error
    );

    res.status(500).json({
      success: false,
      error: "Unable to load Mets transactions."
    });

  }

});


// ============================================================
// FRONTEND FALLBACK
// ============================================================

app.use(
  (req, res, next) => {

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

  }
);


// ============================================================
// 404
// ============================================================

app.use(
  (req, res) => {

    res.status(404).json({

      success: false,

      error:
        "Route not found."

    });

  }
);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (error, req, res, next) => {

    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
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

  }
);
