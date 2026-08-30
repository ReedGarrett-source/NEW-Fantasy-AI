const CURRENT_SEASON = 2026;
const METS_ID = 121;


// ============================================================
// API
// ============================================================

async function api(url) {

  const response =
    await fetch(url);

  const data =
    await response.json();

  if (
    !response.ok ||
    data.success === false
  ) {

    throw new Error(
      data.error ||
      "Request failed"
    );

  }

  return data;

}


// ============================================================
// HELPERS
// ============================================================

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatDate(dateString) {

  if (!dateString) {
    return "—";
  }

  const date =
    new Date(dateString);

  return date.toLocaleDateString(
    "en-US",
    {
      timeZone:
        "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric"
    }
  );

}


function getEasternDate() {

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(
      new Date()
    );

  const year =
    parts.find(
      p => p.type === "year"
    ).value;

  const month =
    parts.find(
      p => p.type === "month"
    ).value;

  const day =
    parts.find(
      p => p.type === "day"
    ).value;

  return `${year}-${month}-${day}`;

}


// ============================================================
// MLB HEADSHOT
// ============================================================

function getPlayerImage(playerId) {

  if (!playerId) {

    return "";

  }

  return (
    "https://img.mlbstatic.com/" +
    "mlb-photos/image/upload/" +
    "w_300,q_auto:good/" +
    `v1/people/${playerId}/` +
    "headshot/67/current"
  );

}


// ============================================================
// NAVIGATION
// ============================================================

function showSection(sectionName) {

  document
    .querySelectorAll(".section")
    .forEach(section => {

      section.classList.remove(
        "active"
      );

    });

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {

      button.classList.remove(
        "active"
      );

    });

  const section =
    document.getElementById(
      `${sectionName}-section`
    );

  if (section) {

    section.classList.add(
      "active"
    );

  }

  document
    .querySelectorAll(
      `[data-section="${sectionName}"]`
    )
    .forEach(button => {

      button.classList.add(
        "active"
      );

    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (sectionName === "games") {
    loadGames();
  }

  if (sectionName === "roster") {
    loadRoster();
  }

  if (sectionName === "stats") {
    loadStats();
  }

  if (sectionName === "transactions") {
    loadTransactions();
  }

}


document
  .querySelectorAll("[data-section]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        showSection(
          button.dataset.section
        );

      }
    );

  });


// ============================================================
// STANDINGS
// ============================================================

async function loadStandings() {

  try {

    const data =
      await api(
        `/api/mets/standings?season=${CURRENT_SEASON}`
      );

    const mets =
      data.mets;

    if (!mets) {
      return;
    }

    const wins =
      Number(mets.wins) || 0;

    const losses =
      Number(mets.losses) || 0;

    const record =
      document.getElementById(
        "record"
      );

    if (record) {

      record.textContent =
        `${wins}-${losses}`;

    }

    const recordSub =
      document.getElementById(
        "record-sub"
      );

    if (recordSub) {

      recordSub.textContent =
        `Win % ${
          mets.winningPercentage ||
          "—"
        }`;

    }

    const divisionRank =
      document.getElementById(
        "division-rank"
      );

    if (divisionRank) {

      divisionRank.textContent =
        mets.divisionRank
          ? `#${mets.divisionRank}`
          : "—";

    }

    const gamesBack =
      document.getElementById(
        "games-back"
      );

    if (gamesBack) {

      gamesBack.textContent =
        (
          mets.gamesBack === "0.0" ||
          mets.gamesBack === "0"
        )
          ? "1st place"
          : `${mets.gamesBack || "—"} GB`;

    }

    const streak =
      document.getElementById(
        "streak"
      );

    if (streak) {

      streak.textContent =
        mets.streak?.streakCode ||
        "—";

    }

    // --------------------------------------------------------
    // Last 10 is loaded separately below.
    // --------------------------------------------------------

    await loadLast10();

  } catch (error) {

    console.error(
      "Standings:",
      error
    );

  }

}


// ============================================================
// LAST 10
// ============================================================

async function loadLast10() {

  try {

    const data =
      await api(
        "/api/mets/last10"
      );

    const element =
      document.getElementById(
        "last-ten"
      );

    if (!element) {
      return;
    }

    const wins =
      Number(data.wins) || 0;

    const losses =
      Number(data.losses) || 0;

    element.textContent =
      `${wins}-${losses}`;

  } catch (error) {

    console.error(
      "Last 10:",
      error
    );

  }

}


// ============================================================
// GAMES
// ============================================================

function getGameInfo(game) {

  const home =
    game?.teams?.home || {};

  const away =
    game?.teams?.away || {};

  const homeId =
    Number(
      home?.team?.id ||
      home?.team?.teamId ||
      home?.id
    );

  const awayId =
    Number(
      away?.team?.id ||
      away?.team?.teamId ||
      away?.id
    );

  let metsIsHome;

  if (homeId === METS_ID) {

    metsIsHome = true;

  } else if (awayId === METS_ID) {

    metsIsHome = false;

  } else {

    metsIsHome =
      String(
        home?.team?.name ||
        ""
      )
        .toLowerCase()
        .includes("mets");

  }

  const mets =
    metsIsHome
      ? home
      : away;

  const opponent =
    metsIsHome
      ? away
      : home;

  return {
    metsIsHome,
    mets,
    opponent
  };

}


function getTeamName(team) {

  if (!team) {
    return "Unknown Opponent";
  }

  if (typeof team === "string") {
    return team;
  }

  if (team.name) {
    return team.name;
  }

  if (team.teamName) {
    return team.teamName;
  }

  if (team.clubName) {
    return team.clubName;
  }

  if (team.shortName) {
    return team.shortName;
  }

  if (team.team) {
    return getTeamName(
      team.team
    );
  }

  return "Unknown Opponent";

}


function renderGame(game) {

  const {
    metsIsHome,
    mets,
    opponent
  } =
    getGameInfo(game);

  const opponentName =
    getTeamName(
      opponent?.team ||
      opponent
    );

  const metsScore =
    Number.isFinite(
      Number(mets?.score)
    )
      ? Number(mets.score)
      : null;

  const opponentScore =
    Number.isFinite(
      Number(opponent?.score)
    )
      ? Number(opponent.score)
      : null;

  const isFinal =
    game.status?.abstractGameState ===
    "Final";

  let resultClass = "";

  if (
    isFinal &&
    metsScore !== null &&
    opponentScore !== null
  ) {

    if (
      metsScore >
      opponentScore
    ) {

      resultClass = "win";

    } else if (
      metsScore <
      opponentScore
    ) {

      resultClass = "loss";

    }

  }

  const scoreText =
    metsScore !== null &&
    opponentScore !== null
      ? `${metsScore} - ${opponentScore}`
      : "—";

  const status =
    game.status?.detailedState ||
    game.status?.abstractGameState ||
    "Scheduled";

  const location =
    metsIsHome
      ? "vs."
      : "@";

  return `

    <div class="game">

      <div class="game-date">
        ${formatDate(
          game.gameDate
        )}
      </div>

      <div class="game-teams">

        <span class="team-name mets">
          Mets
        </span>

        <span>
          ${location}
        </span>

        <span class="team-name">
          ${escapeHTML(
            opponentName
          )}
        </span>

        <span
          class="game-score ${resultClass}"
        >
          ${scoreText}
        </span>

      </div>

      <div class="game-status">
        ${escapeHTML(status)}
      </div>

    </div>

  `;

}


async function loadGames() {

  const container =
    document.getElementById(
      "games-list"
    );

  const homeContainer =
    document.getElementById(
      "home-games"
    );

  if (container) {

    container.innerHTML =
      `<div class="loading">
        Loading games...
      </div>`;

  }

  if (homeContainer) {

    homeContainer.innerHTML =
      `<div class="loading">
        Loading Mets games...
      </div>`;

  }

  try {

    const today =
      getEasternDate();

    const start =
      new Date(
        `${today}T00:00:00-04:00`
      );

    const end =
      new Date(start);

    end.setDate(
      end.getDate() + 21
    );

    const endDate =
      end
        .toISOString()
        .split("T")[0];

    const data =
      await api(
        `/api/mets/games?startDate=${today}&endDate=${endDate}`
      );

    let games =
      data.games || [];

    games =
      games.filter(
        game => {

          if (!game.gameDate) {
            return false;
          }

          return (
            new Date(game.gameDate) >=
            start
          );

        }
      );

    games.sort(
      (a, b) =>
        new Date(a.gameDate) -
        new Date(b.gameDate)
    );

    if (!games.length) {

      const message =
        `<div class="loading">
          No Mets games found.
        </div>`;

      if (container) {
        container.innerHTML =
          message;
      }

      if (homeContainer) {
        homeContainer.innerHTML =
          message;
      }

      return;

    }

    if (container) {

      container.innerHTML =
        games
          .map(renderGame)
          .join("");

    }

    if (homeContainer) {

      homeContainer.innerHTML =
        games
          .slice(0, 5)
          .map(renderGame)
          .join("");

    }

  } catch (error) {

    console.error(
      "Games:",
      error
    );

    const message =
      `<div class="loading">
        Unable to load Mets games.
      </div>`;

    if (container) {
      container.innerHTML =
        message;
    }

    if (homeContainer) {
      homeContainer.innerHTML =
        message;
    }

  }

}


// ============================================================
// ROSTER
//
// ONE GROUP.
// No starters.
// No relievers.
// Everyone together.
// ============================================================

function renderRosterPlayer(player) {

  const person =
    player.person || {};

  const playerId =
    person.id;

  const number =
    player.jerseyNumber ||
    person.primaryNumber ||
    "—";

  const position =
    player.position?.abbreviation ||
    player.position?.name ||
    "—";

  const image =
    getPlayerImage(
      playerId
    );

  return `

    <div
      class="player-card roster-player-card"
      data-player-id="${escapeHTML(
        playerId
      )}"
    >

      <div class="roster-photo-wrap">

        ${
          image
            ? `
              <img
                class="roster-player-photo"
                src="${image}"
                alt="${escapeHTML(
                  person.fullName ||
                  "Mets player"
                )}"
                loading="lazy"
                onerror="
                  this.style.display='none';
                  this.nextElementSibling.style.display='flex';
                "
              >

              <div
                class="roster-photo-placeholder"
                style="display:none;"
              >
                ${escapeHTML(
                  person.fullName ||
                  "Player"
                )}
              </div>
            `
            : `
              <div
                class="roster-photo-placeholder"
              >
                ${escapeHTML(
                  person.fullName ||
                  "Player"
                )}
              </div>
            `
        }

      </div>

      <div class="player-top">

        <div class="player-number">
          ${escapeHTML(number)}
        </div>

        <div>

          <div class="player-name">
            ${escapeHTML(
              person.fullName ||
              "Unknown Player"
            )}
          </div>

          <div class="player-position">
            ${escapeHTML(position)}
          </div>

        </div>

      </div>

    </div>

  `;

}


async function loadRoster() {

  const container =
    document.getElementById(
      "roster-grid"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="loading">
      Loading active Mets roster...
    </div>`;

  try {

    const data =
      await api(
        `/api/mets/roster?season=${CURRENT_SEASON}`
      );

    const roster =
      data.roster || [];

    if (!roster.length) {

      container.innerHTML =
        `<div class="loading">
          No active roster found.
        </div>`;

      return;

    }

    // Sort alphabetically by last name.
    roster.sort(
      (a, b) => {

        const aName =
          (
            a.person?.lastName ||
            a.person?.fullName ||
            ""
          ).toLowerCase();

        const bName =
          (
            b.person?.lastName ||
            b.person?.fullName ||
            ""
          ).toLowerCase();

        return aName.localeCompare(
          bName
        );

      }
    );

    container.innerHTML =
      roster
        .map(
          renderRosterPlayer
        )
        .join("");

    container
      .querySelectorAll(
        ".player-card"
      )
      .forEach(card => {

        card.addEventListener(
          "click",
          () => {

            openPlayer(
              card.dataset.playerId
            );

          }
        );

      });

  } catch (error) {

    console.error(
      "Roster:",
      error
    );

    container.innerHTML =
      `<div class="loading">
        Unable to load active Mets roster.
      </div>`;

  }

}


// ============================================================
// PLAYER MODAL
// ============================================================

async function openPlayer(playerId) {

  const modal =
    document.getElementById(
      "player-modal"
    );

  const details =
    document.getElementById(
      "player-details"
    );

  if (!modal || !details) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

  details.innerHTML =
    `<div class="loading">
      Loading player...
    </div>`;

  try {

    const playerData =
      await api(
        `/api/player/${playerId}`
      );

    const statsData =
      await api(
        `/api/player/${playerId}/stats?season=${CURRENT_SEASON}&group=hitting`
      );

    const player =
      playerData.player;

    const split =
      statsData.stats?.[0]?.splits?.[0];

    const stat =
      split?.stat || {};

    details.innerHTML = `

      <div class="player-modal-name">
        ${escapeHTML(
          player?.fullName ||
          "Unknown Player"
        )}
      </div>

      <div class="player-modal-info">

        ${escapeHTML(
          player?.primaryPosition?.name ||
          "—"
        )}

        ${
          player?.primaryNumber
            ? ` · #${escapeHTML(
                player.primaryNumber
              )}`
            : ""
        }

      </div>

      <div class="player-stat-grid">

        <div class="player-stat">
          <div class="player-stat-label">
            AVG
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.avg || "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            HR
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.homeRuns ?? "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            RBI
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.rbi ?? "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            OPS
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.ops || "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            OBP
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.obp || "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            SLG
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.slg || "—"
            )}
          </div>
        </div>

      </div>

    `;

  } catch (error) {

    console.error(
      "Player:",
      error
    );

    details.innerHTML =
      `<div class="loading">
        Unable to load player information.
      </div>`;

  }

}


// ============================================================
// STATS STATE
// ============================================================

let currentStatsType =
  "hitting";

let currentStatsRows =
  [];

let currentStatsSort =
  null;

let currentStatsSortDirection =
  "desc";

let activeMetsIds =
  new Set();


// ============================================================
// DETERMINE WHETHER PLAYER IS ACTIVE
// ============================================================

async function loadActiveMetsIds() {

  try {

    const data =
      await api(
        `/api/mets/roster?season=${CURRENT_SEASON}`
      );

    activeMetsIds =
      new Set(
        (data.roster || [])
          .map(
            player =>
              Number(
                player.person?.id
              )
          )
          .filter(
            id =>
              Number.isFinite(id)
          )
      );

  } catch (error) {

    console.error(
      "Active roster for stats:",
      error
    );

    activeMetsIds =
      new Set();

  }

}


// ============================================================
// STATS LABELS
// ============================================================

const hittingColumns = [

  {
    key: "gamesPlayed",
    label: "G",
    value: stat =>
      stat.gamesPlayed ??
      stat.games
  },

  {
    key: "atBats",
    label: "AB",
    value: stat =>
      stat.atBats
  },

  {
    key: "hits",
    label: "H",
    value: stat =>
      stat.hits
  },

  {
    key: "homeRuns",
    label: "HR",
    value: stat =>
      stat.homeRuns
  },

  {
    key: "rbi",
    label: "RBI",
    value: stat =>
      stat.rbi
  },

  {
    key: "avg",
    label: "AVG",
    value: stat =>
      stat.avg
  },

  {
    key: "obp",
    label: "OBP",
    value: stat =>
      stat.obp
  },

  {
    key: "slg",
    label: "SLG",
    value: stat =>
      stat.slg
  },

  {
    key: "ops",
    label: "OPS",
    value: stat =>
      stat.ops
  }

];


const pitchingColumns = [

  {
    key: "gamesPlayed",
    label: "G",
    value: stat =>
      stat.gamesPlayed ??
      stat.games
  },

  {
    key: "gamesStarted",
    label: "GS",
    value: stat =>
      stat.gamesStarted
  },

  {
    key: "wins",
    label: "W",
    value: stat =>
      stat.wins
  },

  {
    key: "losses",
    label: "L",
    value: stat =>
      stat.losses
  },

  {
    key: "saves",
    label: "SV",
    value: stat =>
      stat.saves
  },

  {
    key: "inningsPitched",
    label: "IP",
    value: stat =>
      stat.inningsPitched
  },

  {
    key: "era",
    label: "ERA",
    value: stat =>
      stat.era
  },

  {
    key: "whip",
    label: "WHIP",
    value: stat =>
      stat.whip
  },

  {
    key: "strikeOuts",
    label: "SO",
    value: stat =>
      stat.strikeOuts
  },

  {
    key: "baseOnBalls",
    label: "BB",
    value: stat =>
      stat.baseOnBalls
  }

];


// ============================================================
// NUMBER CONVERSION
// ============================================================

function numericValue(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  const number =
    Number(value);

  if (
    Number.isFinite(number)
  ) {

    return number;

  }

  return null;

}


// ============================================================
// CREATE STATS CONTROLS
// ============================================================

function renderStatsControls() {

  const container =
    document.getElementById(
      "stats-table-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `

    <div class="stats-controls">

      <div class="stats-type-toggle">

        <button
          id="stats-hitting-button"
          class="stats-type-button active"
          type="button"
        >
          Hitting
        </button>

        <button
          id="stats-pitching-button"
          class="stats-type-button"
          type="button"
        >
          Pitching
        </button>

      </div>

      <div
        id="stats-current-container"
      ></div>

      <div
        id="stats-former-container"
      ></div>

    </div>

  `;

  document
    .getElementById(
      "stats-hitting-button"
    )
    .addEventListener(
      "click",
      () => {

        if (
          currentStatsType ===
          "hitting"
        ) {
          return;
        }

        currentStatsType =
          "hitting";

        currentStatsSort =
          null;

        currentStatsSortDirection =
          "desc";

        loadStats();

      }
    );

  document
    .getElementById(
      "stats-pitching-button"
    )
    .addEventListener(
      "click",
      () => {

        if (
          currentStatsType ===
          "pitching"
        ) {
          return;
        }

        currentStatsType =
          "pitching";

        currentStatsSort =
          null;

        currentStatsSortDirection =
          "desc";

        loadStats();

      }
    );

}


// ============================================================
// STAT DISPLAY
// ============================================================

function displayStat(
  stat,
  column
) {

  const value =
    column.value(stat);

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return "—";

  }

  return escapeHTML(
    value
  );

}


// ============================================================
// SORT ROWS
// ============================================================

function sortStatsRows(
  rows,
  columns
) {

  if (!currentStatsSort) {

    return [...rows];

  }

  const column =
    columns.find(
      c =>
        c.key ===
        currentStatsSort
    );

  if (!column) {

    return [...rows];

  }

  return [...rows].sort(
    (a, b) => {

      const aValue =
        numericValue(
          column.value(
            a.stat
          )
        );

      const bValue =
        numericValue(
          column.value(
            b.stat
          )
        );

      // Put missing values at bottom.
      if (
        aValue === null &&
        bValue === null
      ) {
        return 0;
      }

      if (
        aValue === null
      ) {
        return 1;
      }

      if (
        bValue === null
      ) {
        return -1;
      }

      const difference =
        aValue - bValue;

      return (
        currentStatsSortDirection ===
        "asc"
          ? difference
          : -difference
      );

    }
  );

}


// ============================================================
// RENDER ONE STATS TABLE
// ============================================================

function renderStatsTable(
  rows,
  title
) {

  const columns =
    currentStatsType ===
    "hitting"
      ? hittingColumns
      : pitchingColumns;

  const sortedRows =
    sortStatsRows(
      rows,
      columns
    );

  return `

    <div class="stats-category">

      <h2 class="stats-category-title">
        ${escapeHTML(title)}
      </h2>

      <div class="stats-table-wrapper">

        <table class="stats-table">

          <thead>

            <tr>

              <th class="stats-player-heading">
                PLAYER
              </th>

              ${columns
                .map(column => {

                  const active =
                    currentStatsSort ===
                    column.key;

                  const arrow =
                    active
                      ? (
                          currentStatsSortDirection ===
                          "desc"
                            ? " ↓"
                            : " ↑"
                        )
                      : "";

                  return `

                    <th
                      class="sortable-stat ${
                        active
                          ? "sorted-stat"
                          : ""
                      }"
                      data-sort-key="${escapeHTML(
                        column.key
                      )}"
                    >

                      ${escapeHTML(
                        column.label
                      )}

                      <span class="sort-arrow">
                        ${arrow}
                      </span>

                    </th>

                  `;

                })
                .join("")}

            </tr>

          </thead>

          <tbody>

            ${
              sortedRows.length
                ? sortedRows
                    .map(row => {

                      const player =
                        row.player ||
                        {};

                      const playerId =
                        player.id;

                      return `

                        <tr>

                          <td>

                            ${
                              playerId
                                ? `
                                  <button
                                    class="player-link"
                                    data-player-id="${escapeHTML(
                                      playerId
                                    )}"
                                  >
                                    ${escapeHTML(
                                      player.fullName ||
                                      "Unknown Player"
                                    )}
                                  </button>
                                `
                                : escapeHTML(
                                    player.fullName ||
                                    "Unknown Player"
                                  )
                            }

                          </td>

                          ${columns
                            .map(
                              column => `

                                <td>
                                  ${displayStat(
                                    row.stat,
                                    column
                                  )}
                                </td>

                              `
                            )
                            .join("")}

                        </tr>

                      `;

                    })
                    .join("")
                : `
                  <tr>

                    <td
                      colspan="${
                        columns.length + 1
                      }"
                    >

                      No players found.

                    </td>

                  </tr>
                `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


// ============================================================
// RENDER STATS
// ============================================================

function renderStats() {

  const container =
    document.getElementById(
      "stats-table-container"
    );

  if (!container) {
    return;
  }

  const current =
    [];

  const former =
    [];

  for (
    const row of currentStatsRows
  ) {

    const playerId =
      Number(
        row.player?.id
      );

    if (
      activeMetsIds.has(
        playerId
      )
    ) {

      current.push(row);

    } else {

      former.push(row);

    }

  }

  // Make the controls.
  renderStatsControls();

  const currentContainer =
    document.getElementById(
      "stats-current-container"
    );

  const formerContainer =
    document.getElementById(
      "stats-former-container"
    );

  if (!currentContainer ||
      !formerContainer) {

    return;

  }

  currentContainer.innerHTML =
    renderStatsTable(
      current,
      "Current Active Mets"
    );

  formerContainer.innerHTML =
    renderStatsTable(
      former,
      "Former Mets / No Longer on Team"
    );

  // ----------------------------------------------------------
  // Sorting buttons
  // ----------------------------------------------------------

  document
    .querySelectorAll(
      ".sortable-stat"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const key =
            button.dataset.sortKey;

          if (
            currentStatsSort ===
            key
          ) {

            currentStatsSortDirection =
              currentStatsSortDirection ===
              "desc"
                ? "asc"
                : "desc";

          } else {

            currentStatsSort =
              key;

            currentStatsSortDirection =
              "desc";

          }

          renderStats();

        }
      );

    });

  // ----------------------------------------------------------
  // Player buttons
  // ----------------------------------------------------------

  document
    .querySelectorAll(
      ".player-link"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          openPlayer(
            button.dataset.playerId
          );

        }
      );

    });

}


// ============================================================
// LOAD STATS
// ============================================================

async function loadStats() {

  const container =
    document.getElementById(
      "stats-table-container"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="loading">
      Loading ${
        currentStatsType ===
        "hitting"
          ? "hitting"
          : "pitching"
      } statistics...
    </div>`;

  try {

    // Make sure we know exactly who is
    // currently active before classifying
    // players.
    await loadActiveMetsIds();

    const data =
      await api(
        `/api/mets/stats?season=${CURRENT_SEASON}&group=${currentStatsType}`
      );

    currentStatsRows =
      data.stats || [];

    renderStats();

  } catch (error) {

    console.error(
      "Stats:",
      error
    );

    container.innerHTML =
      `<div class="loading">
        Unable to load Mets statistics.
      </div>`;

  }

}


// ============================================================
// TRANSACTIONS
// ============================================================

async function loadTransactions() {

  const container =
    document.getElementById(
      "transactions-list"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="loading">
      Loading recent Mets transactions...
    </div>`;

  try {

    const data =
      await api(
        "/api/mets/transactions"
      );

    const transactions =
      data.transactions || [];

    if (!transactions.length) {

      container.innerHTML =
        `<div class="loading">
          No recent transactions found.
        </div>`;

      return;

    }

    container.innerHTML =
      transactions
        .map(
          transaction => {

            let playerName =
              transaction.player?.fullName;

            if (!playerName) {

              const first =
                transaction.player?.firstName ||
                "";

              const last =
                transaction.player?.lastName ||
                "";

              playerName =
                `${first} ${last}`.trim();

            }

            if (!playerName) {

              playerName =
                "Team transaction";

            }

            return `

              <div class="transaction">

                <div class="transaction-date">
                  ${formatDate(
                    transaction.date
                  )}
                </div>

                <div class="transaction-player">
                  ${escapeHTML(
                    playerName
                  )}
                </div>

                <div class="transaction-type">
                  ${escapeHTML(
                    transaction.description ||
                    transaction.typeDesc ||
                    "Transaction"
                  )}
                </div>

              </div>

            `;

          }
        )
        .join("");

  } catch (error) {

    console.error(
      "Transactions:",
      error
    );

    container.innerHTML =
      `<div class="loading">
        Unable to load Mets transactions.
      </div>`;

  }

}


// ============================================================
// MODAL
// ============================================================

const closeModal =
  document.getElementById(
    "close-modal"
  );

if (closeModal) {

  closeModal.addEventListener(
    "click",
    () => {

      const modal =
        document.getElementById(
          "player-modal"
        );

      if (modal) {

        modal.classList.add(
          "hidden"
        );

      }

    }
  );

}


const modalBackdrop =
  document.querySelector(
    ".modal-backdrop"
  );

if (modalBackdrop) {

  modalBackdrop.addEventListener(
    "click",
    () => {

      const modal =
        document.getElementById(
          "player-modal"
        );

      if (modal) {

        modal.classList.add(
          "hidden"
        );

      }

    }
  );

}


// ============================================================
// REFRESH BUTTONS
// ============================================================

const refreshHome =
  document.getElementById(
    "refresh-home"
  );

if (refreshHome) {

  refreshHome.addEventListener(
    "click",
    async () => {

      await loadStandings();
      await loadGames();

    }
  );

}


const refreshGames =
  document.getElementById(
    "refresh-games"
  );

if (refreshGames) {

  refreshGames.addEventListener(
    "click",
    loadGames
  );

}


const refreshRoster =
  document.getElementById(
    "refresh-roster"
  );

if (refreshRoster) {

  refreshRoster.addEventListener(
    "click",
    loadRoster
  );

}


const refreshStats =
  document.getElementById(
    "refresh-stats"
  );

if (refreshStats) {

  refreshStats.addEventListener(
    "click",
    loadStats
  );

}


const refreshTransactions =
  document.getElementById(
    "refresh-transactions"
  );

if (refreshTransactions) {

  refreshTransactions.addEventListener(
    "click",
    loadTransactions
  );

}


// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {

  console.log(
    "Starting Mets HQ..."
  );

  await Promise.all([
    loadStandings(),
    loadGames()
  ]);

  console.log(
    "Mets HQ ready."
  );

}


initialize();
