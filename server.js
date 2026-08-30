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
// CURRENT DAY + NEXT 14 DAYS
// EST DATE
// ============================================

app.get("/api/mets/games", async (req, res) => {
  try {

    // Use New York time so the schedule rolls over
    // according to Eastern Time rather than UTC.
    const now = new Date();

    const easternDate = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).format(now);

    const startDate = easternDate;

    const start = new Date(`${startDate}T12:00:00`);

    const end = new Date(start);
    end.setDate(end.getDate() + 14);

    const endDate =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }
      ).format(end);

    const data = await mlbFetch(
      `/schedule?teamId=${METS_ID}&sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore,probablePitcher`
    );

    const games = [];

    for (const date of data.dates || []) {
      for (const game of date.games || []) {

        const homeTeam =
          game.teams?.home?.team || {};

        const awayTeam =
          game.teams?.away?.team || {};

        const metsIsHome =
          Number(homeTeam.id) === METS_ID;

        const opponent =
          metsIsHome
            ? awayTeam
            : homeTeam;

        const metsSide =
          metsIsHome
            ? game.teams.home
            : game.teams.away;

        const opponentSide =
          metsIsHome
            ? game.teams.away
            : game.teams.home;

        games.push({
          gamePk: game.gamePk,
          gameDate: game.gameDate,

          status: game.status,

          isHome: metsIsHome,

          location: metsIsHome
            ? "vs."
            : "@",

          mets: {
            id: METS_ID,
            name: "New York Mets",
            abbreviation: "NYM",
            score: metsSide?.score ?? null
          },

          opponent: {
            id: opponent.id ?? null,
            name:
              opponent.name ||
              opponent.teamName ||
              opponent.clubName ||
              "Unknown Opponent",
            abbreviation:
              opponent.abbreviation ||
              opponent.teamCode ||
              ""
            ,
            score:
              opponentSide?.score ?? null
          },

          probablePitcher: {
            mets:
              metsSide?.probablePitcher || null,
            opponent:
              opponentSide?.probablePitcher || null
          }
        });
      }
    }

    // Sort chronologically.
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
    console.error("GAMES ERROR:", error);

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

    const roster =
      data.roster || [];

    res.json({
      success: true,
      season,
      rosterType: "active",
      roster
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

    /*
      Important:
      Stats API returns player splits.

      We explicitly request hitting stats for
      the Mets and hydrate the player information.
    */

    const data = await mlbFetch(
      `/stats?stats=season&group=hitting&season=${season}&sportIds=1&teamId=${METS_ID}&playerPool=QUALIFIED&hydrate=person&limit=100`
    );

    let splits =
      data.stats?.[0]?.splits || [];

    /*
      If QUALIFIED returns nothing, retry with ALL.
    */

    if (!splits.length) {

      const fallback =
        await mlbFetch(
          `/stats?stats=season&group=hitting&season=${season}&sportIds=1&teamId=${METS_ID}&playerPool=ALL&hydrate=person&limit=100`
        );

      splits =
        fallback.stats?.[0]?.splits || [];
    }

    /*
      Make sure each split has the player name.
    */

    const stats =
      splits.map(split => {

        const stat =
          split.stat || {};

        const player =
          split.player ||
          split.person ||
          {};

        return {
          player: {
            id: player.id || split.player?.id || null,
            fullName:
              player.fullName ||
              split.player?.fullName ||
              "Unknown Player"
          },

          stat: {
            gamesPlayed:
              stat.gamesPlayed ?? null,

            atBats:
              stat.atBats ?? null,

            hits:
              stat.hits ?? null,

            homeRuns:
              stat.homeRuns ?? null,

            rbi:
              stat.rbi ?? null,

            avg:
              stat.avg ?? null,

            obp:
              stat.obp ?? null,

            slg:
              stat.slg ?? null,

            ops:
              stat.ops ?? null
          }
        };
      });

    /*
      Sort by at-bats, highest first.
    */

    stats.sort(
      (a, b) =>
        (Number(b.stat.atBats) || 0) -
        (Number(a.stat.atBats) || 0)
    );

    res.json({
      success: true,
      season,
      stats
    });

  } catch (error) {

    console.error("STATS ERROR:", error);

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

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Unable to load player stats."
    });
  }
});


// ============================================
// LAST 10 GAMES
// ============================================

app.get("/api/mets/last10", async (req, res) => {

  try {

    const today =
      new Date();

    const start =
      new Date(today);

    start.setDate(
      start.getDate() - 30
    );

    const formatDate =
      date =>
        date.toISOString().split("T")[0];

    const startDate =
      formatDate(start);

    const endDate =
      formatDate(today);

    const data =
      await mlbFetch(
        `/schedule?teamId=${METS_ID}&sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=team,linescore`
      );

    const games = [];

    for (const date of data.dates || []) {

      for (const game of date.games || []) {

        if (
          game.status?.abstractGameState !==
          "Final"
        ) {
          continue;
        }

        const home =
          game.teams?.home;

        const away =
          game.teams?.away;

        const metsIsHome =
          Number(home?.team?.id) ===
          METS_ID;

        const mets =
          metsIsHome
            ? home
            : away;

        const opponent =
          metsIsHome
            ? away
            : home;

        if (
          typeof mets?.score !== "number" ||
          typeof opponent?.score !== "number"
        ) {
          continue;
        }

        games.push({
          gameDate:
            game.gameDate,

          win:
            mets.score >
            opponent.score,

          loss:
            mets.score <
            opponent.score,

          metsScore:
            mets.score,

          opponentScore:
            opponent.score,

          opponentName:
            opponent.team?.name ||
            "Opponent"
        });
      }
    }

    games.sort(
      (a, b) =>
        new Date(b.gameDate) -
        new Date(a.gameDate)
    );

    const last10 =
      games.slice(0, 10);

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
      games: last10,
      wins,
      losses,
      record:
        `${wins}-${losses}`
    });

  } catch (error) {

    console.error(
      "LAST 10 ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to load Mets last 10 games."
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
      new Date()
        .toISOString()
        .split("T")[0];

    const startDate =
      req.query.startDate ||
      (() => {

        const date =
          new Date();

        date.setDate(
          date.getDate() - 45
        );

        return date
          .toISOString()
          .split("T")[0];

      })();

    const data =
      await mlbFetch(
        `/transactions?teamId=${METS_ID}&startDate=${startDate}&endDate=${endDate}`
      );

    let transactions =
      data.transactions || [];

    // Remove exact duplicates.
    const seen =
      new Set();

    transactions =
      transactions.filter(
        transaction => {

          const key = [
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

          if (seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        }
      );

    // Newest first.
    transactions.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.date || 0
          ).getTime();

        const dateB =
          new Date(
            b.date || 0
          ).getTime();

        return dateB - dateA;
      }
    );

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
      error:
        "Unable to load Mets transactions."
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


// ============================================
// 404
// ============================================

app.use(
  (req, res) => {

    res.status(404).json({
      success: false,
      error:
        "Route not found."
    });

  }
);


// ============================================
// ERROR HANDLER
// ============================================

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


// ============================================
// START SERVER
// ============================================

app.listen(
  PORT,
  () => {

    console.log(
      `Mets HQ running on port ${PORT}`
    );

  }
);
