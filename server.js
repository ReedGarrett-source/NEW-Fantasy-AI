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
// EASTERN DATE
// ============================================================

function getEasternDate(offsetDays = 0) {

  const now = new Date();

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(now);

  const year =
    Number(
      parts.find(
        part => part.type === "year"
      ).value
    );

  const month =
    Number(
      parts.find(
        part => part.type === "month"
      ).value
    );

  const day =
    Number(
      parts.find(
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
    .slice(0, 10);

}


// ============================================================
// SAFE NUMBER
// ============================================================

function numberOrNull(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;

}


// ============================================================
// TEAM NAME
// ============================================================

function teamName(team) {

  if (!team) {
    return "Unknown Opponent";
  }

  return (
    team.name ||
    team.teamName ||
    team.clubName ||
    team.shortName ||
    team.abbreviation ||
    "Unknown Opponent"
  );

}


// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {

  res.json({

    success: true,

    service:
      "Mets HQ",

    season:
      CURRENT_SEASON

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

      team:
        data.teams?.[0] || null

    });

  } catch (error) {

    console.error(
      "TEAM ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load Mets team."

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

        metsRecord =
          found;

        division =
          record;

        break;

      }

    }

    res.json({

      success: true,

      season,

      mets:
        metsRecord,

      division

    });

  } catch (error) {

    console.error(
      "STANDINGS ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load Mets standings."

    });

  }

});


// ============================================================
// SCHEDULE
//
// IMPORTANT:
// We deliberately convert the MLB response into our own
// simple format here.
//
// The frontend should NEVER have to figure out whether
// home.team.name or away.team.teamName is the opponent.
// ============================================================

app.get("/api/mets/games", async (req, res) => {

  try {

    const startDate =
      req.query.startDate ||
      getEasternDate(0);

    const endDate =
      req.query.endDate ||
      getEasternDate(30);

    const endpoint =
      `/schedule?sportId=1` +
      `&teamId=${METS_ID}` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&hydrate=team,linescore,probablePitcher`;

    const data =
      await mlbFetch(endpoint);

    const games = [];

    for (
      const dateBlock of data.dates || []
    ) {

      for (
        const game of dateBlock.games || []
      ) {

        const home =
          game.teams?.home;

        const away =
          game.teams?.away;

        if (!home || !away) {
          continue;
        }

        const homeTeam =
          home.team || {};

        const awayTeam =
          away.team || {};

        const homeId =
          Number(homeTeam.id);

        const awayId =
          Number(awayTeam.id);

        // Only accept games where the Mets are
        // explicitly one of the two teams.
        if (
          homeId !== METS_ID &&
          awayId !== METS_ID
        ) {
          continue;
        }

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

        const metsTeam =
          metsSide.team || {};

        const opponentId =
          Number(opponentTeam.id);

        // This is the critical part:
        // get the name directly from the actual
        // opponent team object.
        const opponentName =
          teamName(opponentTeam);

        const metsScore =
          numberOrNull(
            metsSide.score
          );

        const opponentScore =
          numberOrNull(
            opponentSide.score
          );

        games.push({

          gamePk:
            game.gamePk,

          gameDate:
            game.gameDate,

          officialDate:
            game.officialDate ||
            dateBlock.date,

          status:
            game.status || {},

          gameType:
            game.gameType || "",

          seriesDescription:
            game.seriesDescription || "",

          metsIsHome:

            metsIsHome,

          location:

            metsIsHome
              ? "vs."
              : "@",

          mets: {

            id:
              METS_ID,

            name:
              teamName(metsTeam)

          },

          opponent: {

            id:
              Number.isFinite(opponentId)
                ? opponentId
                : null,

            name:
              opponentName

          },

          metsScore,

          opponentScore,

          probablePitcher:
            metsSide.probablePitcher
              ? {
                  id:
                    metsSide
                      .probablePitcher
                      .id,

                  name:
                    metsSide
                      .probablePitcher
                      .fullName ||
                    metsSide
                      .probablePitcher
                      .name ||
                    "TBD"
                }
              : null,

          opponentProbablePitcher:
            opponentSide.probablePitcher
              ? {
                  id:
                    opponentSide
                      .probablePitcher
                      .id,

                  name:
                    opponentSide
                      .probablePitcher
                      .fullName ||
                    opponentSide
                      .probablePitcher
                      .name ||
                    "TBD"
                }
              : null

        });

      }

    }

    games.sort(
      (a, b) =>
        new Date(a.gameDate) -
        new Date(b.gameDate)
    );

    console.log(
      `Returning ${games.length} Mets games from ${startDate} through ${endDate}`
    );

    if (games.length > 0) {

      console.log(
        "FIRST GAME:",
        JSON.stringify(
          games[0],
          null,
          2
        )
      );

    }

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


// ============================================================
// LAST 10 GAMES
//
// We DO NOT use standings.lastTen.
// We independently retrieve the schedule and calculate
// the record from completed games.
//
// This avoids MLB returning an object/string/empty value
// depending on the standings response.
// ============================================================

app.get("/api/mets/last10", async (req, res) => {

  try {

    const endDate =
      getEasternDate(0);

    // 60 days gives us plenty of room for rainouts,
// off days, etc.
    const startDate =
      getEasternDate(-60);

    const endpoint =
      `/schedule?sportId=1` +
      `&teamId=${METS_ID}` +
      `&startDate=${startDate}` +
      `&endDate=${endDate}` +
      `&hydrate=team,linescore`;

    const data =
      await mlbFetch(endpoint);

    const completedGames = [];

    for (
      const dateBlock of data.dates || []
    ) {

      for (
        const game of dateBlock.games || []
      ) {

        const home =
          game.teams?.home;

        const away =
          game.teams?.away;

        if (!home || !away) {
          continue;
        }

        const homeId =
          Number(home.team?.id);

        const awayId =
          Number(away.team?.id);

        if (
          homeId !== METS_ID &&
          awayId !== METS_ID
        ) {
          continue;
        }

        const isHome =
          homeId === METS_ID;

        const metsSide =
          isHome
            ? home
            : away;

        const opponentSide =
          isHome
            ? away
            : home;

        const status =
          game.status || {};

        // Accept MLB's normal final states.
        const isFinal =
          status.abstractGameState ===
            "Final" ||
          status.detailedState ===
            "Final" ||
          status.statusCode ===
            "F";

        if (!isFinal) {
          continue;
        }

        const metsScore =
          numberOrNull(
            metsSide.score
          );

        const opponentScore =
          numberOrNull(
            opponentSide.score
          );

        if (
          metsScore === null ||
          opponentScore === null
        ) {
          continue;
        }

        completedGames.push({

          gamePk:
            game.gamePk,

          gameDate:
            game.gameDate,

          opponent:
            teamName(
              opponentSide.team
            ),

          metsIsHome:
            isHome,

          metsScore,

          opponentScore,

          result:
            metsScore > opponentScore
              ? "W"
              : metsScore < opponentScore
                ? "L"
                : "T"

        });

      }

    }

    // Most recent first.
    completedGames.sort(
      (a, b) =>
        new Date(b.gameDate) -
        new Date(a.gameDate)
    );

    const last10 =
      completedGames.slice(
        0,
        10
      );

    let wins = 0;
    let losses = 0;
    let ties = 0;

    for (
      const game of last10
    ) {

      if (game.result === "W") {
        wins++;
      }

      else if (
        game.result === "L"
      ) {
        losses++;
      }

      else {
        ties++;
      }

    }

    const record =
      `${wins}-${losses}` +
      (
        ties > 0
          ? `-${ties}`
          : ""
      );

    console.log(
      "LAST 10:",
      record
    );

    console.log(
      "LAST 10 GAMES:",
      JSON.stringify(
        last10,
        null,
        2
      )
    );

    res.json({

      success: true,

      record,

      wins,

      losses,

      ties,

      games:
        last10,

      gamesFound:
        last10.length

    });

  } catch (error) {

    console.error(
      "LAST 10 ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to calculate Mets last 10."

    });

  }

});


// ============================================================
// ACTIVE ROSTER
//
// Use active roster as the primary current roster.
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

    res.json({

      success: true,

      season,

      roster:
        data.roster || []

    });

  } catch (error) {

    console.error(
      "ROSTER ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load active Mets roster."

    });

  }

});


// ============================================================
// FULL ROSTER
//
// Used as a backup so a player isn't lost merely because
// MLB's active-roster endpoint has a temporary discrepancy.
// ============================================================

app.get("/api/mets/full-roster", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data =
      await mlbFetch(
        `/teams/${METS_ID}/roster?season=${season}&rosterType=fullRoster&hydrate=person`
      );

    res.json({

      success: true,

      season,

      roster:
        data.roster || []

    });

  } catch (error) {

    console.error(
      "FULL ROSTER ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load full Mets roster."

    });

  }

});


// ============================================================
// DEPTH CHART
// ============================================================

app.get("/api/mets/depth", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const data =
      await mlbFetch(
        `/teams/${METS_ID}/roster?season=${season}&rosterType=depthChart&hydrate=person`
      );

    res.json({

      success: true,

      season,

      roster:
        data.roster || []

    });

  } catch (error) {

    console.error(
      "DEPTH ERROR:",
      error
    );

    // Don't make the whole roster fail if depth chart
    // isn't available.
    res.json({

      success: true,

      season,

      roster: []

    });

  }

});


// ============================================================
// STATS
//
// We normalize every split.
//
// MLB returns:
// {
//   player: {...},
//   stat: {...}
// }
//
// We return a very simple object.
// ============================================================

app.get("/api/mets/stats", async (req, res) => {

  try {

    const season =
      Number(req.query.season) ||
      CURRENT_SEASON;

    const endpoint =
      `/stats` +
      `?stats=season` +
      `&group=hitting` +
      `&season=${season}` +
      `&sportIds=1` +
      `&teamId=${METS_ID}` +
      `&playerPool=ALL` +
      `&gameType=R` +
      `&limit=1000` +
      `&hydrate=person,team`;

    const data =
      await mlbFetch(endpoint);

    const splits =
      data.stats?.[0]?.splits || [];

    const statsByPlayer =
      new Map();

    for (
      const split of splits
    ) {

      const player =
        split.player ||
        split.person ||
        {};

      const stat =
        split.stat ||
        {};

      const playerId =
        Number(
          player.id ||
          split.playerId ||
          split.personId
        );

      if (
        !Number.isFinite(playerId)
      ) {
        continue;
      }

      const playerName =
        player.fullName ||
        player.name ||
        "Unknown Player";

      // If a player appears multiple times,
      // add their statistics rather than displaying
      // only one split.
      const existing =
        statsByPlayer.get(
          playerId
        );

      if (!existing) {

        statsByPlayer.set(
          playerId,
          {

            player: {

              id:
                playerId,

              fullName:
                playerName

            },

            games:
              Number(
                stat.gamesPlayed ||
                stat.games ||
                0
              ),

            atBats:
              Number(
                stat.atBats || 0
              ),

            hits:
              Number(
                stat.hits || 0
              ),

            homeRuns:
              Number(
                stat.homeRuns || 0
              ),

            rbi:
              Number(
                stat.rbi || 0
              ),

            avg:
              stat.avg ?? ".000",

            obp:
              stat.obp ?? ".000",

            slg:
              stat.slg ?? ".000",

            ops:
              stat.ops ?? ".000"

          }
        );

      }

      else {

        existing.games +=
          Number(
            stat.gamesPlayed ||
            stat.games ||
            0
          );

        existing.atBats +=
          Number(
            stat.atBats || 0
          );

        existing.hits +=
          Number(
            stat.hits || 0
          );

        existing.homeRuns +=
          Number(
            stat.homeRuns || 0
          );

        existing.rbi +=
          Number(
            stat.rbi || 0
          );

        // Recalculate slash lines from totals.
        const ab =
          existing.atBats;

        const hits =
          existing.hits;

        const walks =
          Number(
            existing.walks || 0
          );

        if (ab > 0) {

          existing.avg =
            (
              hits / ab
            ).toFixed(3);

        }

      }

    }

    let stats =
      Array.from(
        statsByPlayer.values()
      );

    // Sort by AB descending.
    stats.sort(
      (a, b) =>
        b.atBats -
        a.atBats
    );

    console.log(
      `Returning ${stats.length} Mets hitters`
    );

    res.json({

      success: true,

      season,

      stats

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


// ============================================================
// PLAYER PROFILE
// ============================================================

app.get("/api/player/:id", async (req, res) => {

  try {

    const playerId =
      Number(req.params.id);

    if (
      !Number.isFinite(playerId)
    ) {

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
        data.people?.[0] || null

    });

  } catch (error) {

    console.error(
      "PLAYER ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load player."

    });

  }

});


// ============================================================
// PLAYER STATS
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
        `/people/${playerId}/stats?stats=season&group=${group}&season=${season}&gameType=R`
      );

    res.json({

      success: true,

      stats:
        data.stats || []

    });

  } catch (error) {

    console.error(
      "PLAYER STATS ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load player stats."

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
      getEasternDate(0);

    const startDate =
      req.query.startDate ||
      getEasternDate(-45);

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
        new Date(
          b.date || 0
        ) -
        new Date(
          a.date || 0
        )
    );

    res.json({

      success: true,

      startDate,

      endDate,

      transactions

    });

  } catch (error) {

    console.error(
      "TRANSACTIONS ERROR:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Unable to load Mets transactions."

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
// START SERVER
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `Mets HQ running on port ${PORT}`
    );

  }
);
