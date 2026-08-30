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
    /*
      Use the actual current date on the server,
      then request a window around it.
    */
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 10);
    const end = new Date(today);
    end.setDate(end.getDate() + 10);
    const formatDate = date => {
      return date
        .toISOString()
        .split("T")[0];
    };
    const startDate =
      formatDate(start);
    const endDate =
      formatDate(end);
    const endpoint =
      `/schedule?teamId=${METS_ID}` +
      `&sportId=1` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&gameType=R` +
      `&hydrate=team,linescore`;
    const data =
      await mlbFetch(endpoint);
    const games = [];
    for (const date of data.dates || []) {
      for (const game of date.games || []) {
        const home =
          game.teams?.home;
        const away =
          game.teams?.away;
        /*
          IMPORTANT:
          We determine the opponent from the actual
          team IDs rather than relying on the frontend.
        */
        const metsIsHome =
          Number(home?.team?.id) === METS_ID;
        const metsTeam =
          metsIsHome
            ? home
            : away;
        const opponentTeam =
          metsIsHome
            ? away
            : home;
        const opponentName =
          opponentTeam?.team?.name ||
          opponentTeam?.team?.teamName ||
          opponentTeam?.team?.clubName ||
          "Unknown Opponent";
        const opponentId =
          opponentTeam?.team?.id ||
          null;
        const metsScore =
          typeof metsTeam?.score === "number"
            ? metsTeam.score
            : null;
        const opponentScore =
          typeof opponentTeam?.score === "number"
            ? opponentTeam.score
            : null;
        const status =
          game.status?.detailedState ||
          game.status?.abstractGameState ||
          "Scheduled";
        let result = null;
        if (
          status === "Final" &&
          metsScore !== null &&
          opponentScore !== null
        ) {
          if (metsScore > opponentScore) {
            result = "W";
          }
          else if (metsScore < opponentScore) {
            result = "L";
          }
          else {
            result = "T";
          }
        }
        games.push({
          gamePk:
            game.gamePk,
          gameDate:
            game.gameDate,
          officialDate:
            game.officialDate,
          status,
          abstractGameState:
            game.status?.abstractGameState,
          detailedState:
            game.status?.detailedState,
          metsIsHome,
          location:
            metsIsHome
              ? "vs."
              : "@",
          opponent: {
            id:
              opponentId,
            name:
              opponentName,
            abbreviation:
              opponentTeam?.team?.abbreviation ||
              null,
            score:
              opponentScore
          },
          mets: {
            id:
              METS_ID,
            name:
              "New York Mets",
            score:
              metsScore
          },
          result,
          venue:
            game.venue?.name ||
            null
        });
      }
    }
    /*
      Sort chronologically.
    */
    games.sort((a, b) => {
      return (
        new Date(a.gameDate).getTime() -
        new Date(b.gameDate).getTime()
      );
    });
    console.log(
      `Loaded ${games.length} Mets games`
    );
    res.json({
      success: true,
      startDate,
      endDate,
      games
    });
  } catch (error) {
    console.error(
      "GAMES ERROR:",
      error
    );
    res.status(500).json({
      success: false,
      error:
        "Unable to load Mets games."
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
    /*
      Ask MLB for individual player statistics
      for the Mets.
      teamId = 121
      playerPool = ALL
      gameType = R
    */
    const endpoint =
      `/stats` +
      `?stats=season` +
      `&group=hitting` +
      `&season=${season}` +
      `&sportIds=1` +
      `&teamId=${METS_ID}` +
      `&gameType=R` +
      `&playerPool=ALL` +
      `&limit=100` +
      `&hydrate=person`;
    const data =
      await mlbFetch(endpoint);
    /*
      MLB returns:
      stats
        [
          {
            type,
            group,
            totalSplits,
            splits: [...]
          }
        ]
      We need the splits array.
    */
    let splits = [];
    if (
      Array.isArray(data.stats)
    ) {
      for (
        const statGroup of data.stats
      ) {
        if (
          Array.isArray(
            statGroup.splits
          )
        ) {
          splits.push(
            ...statGroup.splits
          );
        }
      }
    }
    /*
      Normalize the response so the frontend
      doesn't have to understand MLB's entire
      nested structure.
    */
    const stats =
      splits
        .map(split => {
          const player =
            split.player ||
            split.person ||
            {};
          const stat =
            split.stat ||
            {};
          return {
            player: {
              id:
                player.id ||
                null,
              fullName:
                player.fullName ||
                "Unknown Player"
            },
            games:
              stat.gamesPlayed ??
              stat.games ??
              0,
            atBats:
              stat.atBats ??
              0,
            hits:
              stat.hits ??
              0,
            homeRuns:
              stat.homeRuns ??
              0,
            rbi:
              stat.rbi ??
              0,
            avg:
              stat.avg ||
              ".000",
            obp:
              stat.obp ||
              ".000",
            slg:
              stat.slg ||
              ".000",
            ops:
              stat.ops ||
              ".000",
            runs:
              stat.runs ??
              0,
            walks:
              stat.baseOnBalls ??
              stat.walks ??
              0,
            strikeOuts:
              stat.strikeOuts ??
              0,
            stolenBases:
              stat.stolenBases ??
              0
          };
        });
    /*
      Remove anything without a player ID.
    */
    const validStats =
      stats.filter(
        player =>
          player.player.id
      );
    /*
      Sort by at-bats, highest first.
    */
    validStats.sort(
      (a, b) =>
        Number(b.atBats) -
        Number(a.atBats)
    );
    console.log(
      `Loaded ${validStats.length} Mets hitters`
    );
    res.json({
      success: true,
      season,
      stats:
        validStats
    });
  } catch (error) {
    console.error(
      "STATS ERROR:",
      error
    );
    res.status(500).json({
      success: false,
      error:
        "Unable to load Mets player statistics."
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
        error:
          "Invalid player ID."
      });
    }
    const data =
      await mlbFetch(
        `/people/${playerId}?hydrate=currentTeam`
      );
    res.json({
      success: true,
      player:
        data.people?.[0] ||
        null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error:
        "Unable to load player."
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
        data.stats ||
        []
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error:
        "Unable to load player stats."
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
    // ----------------------------------------
    // Remove exact duplicates
    // ----------------------------------------
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
          if (
            seen.has(key)
          ) {
            return false;
          }
          seen.add(key);
          return true;
        }
      );
    // ----------------------------------------
    // Newest → oldest
    // ----------------------------------------
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
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:
      "Route not found."
  });
});
app.use(
  (
    error,
    req,
    res,
    next
  ) => {
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
// START
// ============================================
app.listen(
  PORT,
  () => {
    console.log(
      `Mets HQ running on port ${PORT}`
    );
  }
);
