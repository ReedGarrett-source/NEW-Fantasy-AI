const CURRENT_SEASON = 2026;
const METS_ID = 121;


// ============================================================
// API
// ============================================================

async function api(url) {

  const response =
    await fetch(url, {
      cache: "no-store"
    });

  let data;

  try {

    data =
      await response.json();

  } catch (error) {

    throw new Error(
      `Invalid server response (${response.status})`
    );

  }

  if (
    !response.ok ||
    data.success === false
  ) {

    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );

  }

  return data;

}


// ============================================================
// HTML SAFETY
// ============================================================

function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


// ============================================================
// EASTERN DATE
// ============================================================

function getEasternDate() {

  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/New_York",

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit"
      }
    ).formatToParts(
      new Date()
    );

  const year =
    parts.find(
      part =>
        part.type === "year"
    ).value;

  const month =
    parts.find(
      part =>
        part.type === "month"
    ).value;

  const day =
    parts.find(
      part =>
        part.type === "day"
    ).value;

  return `${year}-${month}-${day}`;

}


// ============================================================
// DATE FORMAT
// ============================================================

function formatDate(
  dateString
) {

  if (!dateString) {
    return "—";
  }

  const date =
    new Date(dateString);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      timeZone:
        "America/New_York",

      weekday:
        "short",

      month:
        "short",

      day:
        "numeric"
    }
  );

}


// ============================================================
// NAVIGATION
// ============================================================

function showSection(
  sectionName
) {

  document
    .querySelectorAll(
      ".section"
    )
    .forEach(
      section => {

        section.classList.remove(
          "active"
        );

      }
    );

  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach(
      button => {

        button.classList.remove(
          "active"
        );

      }
    );

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
    .forEach(
      button => {

        button.classList.add(
          "active"
        );

      }
    );

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (
    sectionName ===
    "games"
  ) {

    loadGames();

  }

  if (
    sectionName ===
    "roster"
  ) {

    loadRoster();

  }

  if (
    sectionName ===
    "stats"
  ) {

    loadStats();

  }

  if (
    sectionName ===
    "transactions"
  ) {

    loadTransactions();

  }

}


document
  .querySelectorAll(
    "[data-section]"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          showSection(
            button.dataset.section
          );

        }
      );

    }
  );


// ============================================================
// STANDINGS
// ============================================================

async function loadStandings() {

  try {

    const [
      standingsData,
      last10Data
    ] =
      await Promise.all([
        api(
          `/api/mets/standings?season=${CURRENT_SEASON}`
        ),

        api(
          "/api/mets/last10"
        )
      ]);

    const mets =
      standingsData.mets;

    if (mets) {

      const wins =
        Number(
          mets.wins
        ) || 0;

      const losses =
        Number(
          mets.losses
        ) || 0;

      const recordElement =
        document.getElementById(
          "record"
        );

      if (recordElement) {

        recordElement.textContent =
          `${wins}-${losses}`;

      }

      const winPct =
        document.getElementById(
          "record-sub"
        );

      if (winPct) {

        winPct.textContent =
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

        if (
          mets.gamesBack === "0.0" ||
          mets.gamesBack === "0"
        ) {

          gamesBack.textContent =
            "1st place";

        }

        else {

          gamesBack.textContent =
            `${mets.gamesBack || "—"} GB`;

        }

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

    }

    // ========================================
    // LAST 10
    // ========================================

    const lastTenElement =
      document.getElementById(
        "last-ten"
      );

    if (lastTenElement) {

      if (
        last10Data.gamesFound === 10
      ) {

        lastTenElement.textContent =
          last10Data.record;

      }

      else if (
        last10Data.gamesFound > 0
      ) {

        lastTenElement.textContent =
          last10Data.record;

      }

      else {

        lastTenElement.textContent =
          "—";

      }

    }

  } catch (error) {

    console.error(
      "Standings:",
      error
    );

    const lastTenElement =
      document.getElementById(
        "last-ten"
      );

    if (lastTenElement) {

      lastTenElement.textContent =
        "—";

    }

  }

}


// ============================================================
// GAME STATUS
// ============================================================

function getGameStatus(
  game
) {

  if (
    game.status?.detailedState
  ) {

    return game.status.detailedState;

  }

  if (
    game.status?.abstractGameState
  ) {

    return game.status.abstractGameState;

  }

  return "Scheduled";

}


// ============================================================
// GAME RESULT CLASS
// ============================================================

function getGameResultClass(
  game
) {

  if (
    game.status?.abstractGameState !==
    "Final"
  ) {

    return "";

  }

  if (
    typeof game.metsScore !==
      "number" ||
    typeof game.opponentScore !==
      "number"
  ) {

    return "";

  }

  if (
    game.metsScore >
    game.opponentScore
  ) {

    return "win";

  }

  if (
    game.metsScore <
    game.opponentScore
  ) {

    return "loss";

  }

  return "";

}


// ============================================================
// RENDER GAME
// ============================================================

function renderGame(
  game
) {

  const opponentName =
    game.opponent?.name ||
    "Unknown Opponent";

  const location =
    game.metsIsHome
      ? "vs."
      : "@";

  const metsScore =
    typeof game.metsScore ===
      "number"
      ? game.metsScore
      : null;

  const opponentScore =
    typeof game.opponentScore ===
      "number"
      ? game.opponentScore
      : null;

  let scoreText =
    "—";

  if (
    metsScore !== null &&
    opponentScore !== null
  ) {

    scoreText =
      `${metsScore} - ${opponentScore}`;

  }

  const resultClass =
    getGameResultClass(
      game
    );

  const status =
    getGameStatus(
      game
    );

  return `

    <div class="game">

      <div class="game-date">
        ${escapeHTML(
          formatDate(
            game.gameDate
          )
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
          ${escapeHTML(
            scoreText
          )}
        </span>

      </div>

      <div class="game-status">
        ${escapeHTML(
          status
        )}
      </div>

    </div>

  `;

}


// ============================================================
// GAMES
// ============================================================

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
      `
      <div class="loading">
        Loading games...
      </div>
      `;

  }

  if (homeContainer) {

    homeContainer.innerHTML =
      `
      <div class="loading">
        Loading Mets games...
      </div>
      `;

  }

  try {

    // TODAY in Eastern Time.
    const startDate =
      getEasternDate();

    // Show 30 days forward.
    const start =
      new Date(
        `${startDate}T00:00:00`
      );

    const end =
      new Date(start);

    end.setDate(
      end.getDate() + 30
    );

    const endDate =
      end
        .toISOString()
        .slice(0, 10);

    const data =
      await api(
        `/api/mets/games?startDate=${startDate}&endDate=${endDate}`
      );

    let games =
      data.games || [];

    // Safety check:
    // never display anything before today.
    games =
      games.filter(
        game => {

          if (
            !game.officialDate
          ) {

            return true;

          }

          return (
            game.officialDate >=
            startDate
          );

        }
      );

    games.sort(
      (a, b) =>
        new Date(
          a.gameDate
        ) -
        new Date(
          b.gameDate
        )
    );

    if (!games.length) {

      const message =
        `
        <div class="loading">
          No Mets games found.
        </div>
        `;

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
          .map(
            renderGame
          )
          .join("");

    }

    if (homeContainer) {

      homeContainer.innerHTML =
        games
          .slice(0, 5)
          .map(
            renderGame
          )
          .join("");

    }

  } catch (error) {

    console.error(
      "Games:",
      error
    );

    const message =
      `
      <div class="loading">
        Unable to load Mets games.
      </div>
      `;

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
// ROSTER POSITION
// ============================================================

function getRosterPosition(
  player
) {

  return (
    player.position?.abbreviation ||
    player.position?.name ||
    ""
  )
    .toString()
    .toLowerCase();

}


// ============================================================
// IS PITCHER
// ============================================================

function isPitcher(
  player
) {

  const position =
    getRosterPosition(
      player
    );

  return (
    position === "p" ||
    position === "sp" ||
    position === "rp" ||
    position.includes(
      "pitcher"
    )
  );

}


// ============================================================
// IS CATCHER
// ============================================================

function isCatcher(
  player
) {

  const position =
    getRosterPosition(
      player
    );

  return (
    position === "c" ||
    position.includes(
      "catcher"
    )
  );

}


// ============================================================
// IS INFIELDER
// ============================================================

function isInfielder(
  player
) {

  const position =
    getRosterPosition(
      player
    );

  return [
    "1b",
    "2b",
    "3b",
    "ss",
    "if"
  ].includes(
    position
  ) ||
  position.includes(
    "first base"
  ) ||
  position.includes(
    "second base"
  ) ||
  position.includes(
    "third base"
  ) ||
  position.includes(
    "shortstop"
  );

}


// ============================================================
// IS OUTFIELDER
// ============================================================

function isOutfielder(
  player
) {

  const position =
    getRosterPosition(
      player
    );

  return [
    "lf",
    "cf",
    "rf",
    "of"
  ].includes(
    position
  ) ||
  position.includes(
    "outfield"
  );

}


// ============================================================
// STARTER NAMES
//
// This list is deliberately used as a fallback because
// the MLB depth-chart endpoint can be inconsistent.
// If the API says a pitcher is SP, that takes priority.
// ============================================================

const KNOWN_STARTER_NAMES = new Set([
  "Sean Manaea",
  "Kodai Senga",
  "David Peterson",
  "Tylor Megill",
  "Clay Holmes"
]);


// ============================================================
// IS STARTING PITCHER
// ============================================================

function isStartingPitcher(
  player
) {

  if (!isPitcher(player)) {

    return false;

  }

  const position =
    getRosterPosition(
      player
    );

  if (
    position === "sp"
  ) {

    return true;

  }

  const rosterType =
    String(
      player.rosterType ||
      ""
    ).toLowerCase();

  if (
    rosterType.includes(
      "starting"
    )
  ) {

    return true;

  }

  const name =
    player.person?.fullName ||
    "";

  if (
    KNOWN_STARTER_NAMES.has(
      name
    )
  ) {

    return true;

  }

  return false;

}


// ============================================================
// RENDER ROSTER PLAYER
// ============================================================

function renderRosterPlayer(
  player
) {

  const person =
    player.person || {};

  const number =
    player.jerseyNumber ||
    person.primaryNumber ||
    "—";

  const position =
    player.position?.abbreviation ||
    player.position?.name ||
    "—";

  return `

    <div
      class="player-card"
      data-player-id="${escapeHTML(
        person.id
      )}"
    >

      <div class="player-top">

        <div class="player-number">
          ${escapeHTML(
            number
          )}
        </div>

        <div>

          <div class="player-name">
            ${escapeHTML(
              person.fullName ||
              "Unknown Player"
            )}
          </div>

          <div class="player-position">
            ${escapeHTML(
              position
            )}
          </div>

        </div>

      </div>

    </div>

  `;

}


// ============================================================
// ROSTER SECTION
// ============================================================

function renderRosterSection(
  title,
  players
) {

  if (!players.length) {

    return "";

  }

  return `

    <div class="roster-group">

      <h2
        class="roster-group-title"
      >
        ${escapeHTML(
          title
        )}
      </h2>

      <div
        class="roster-grid-section"
      >

        ${players
          .map(
            renderRosterPlayer
          )
          .join("")}

      </div>

    </div>

  `;

}


// ============================================================
// ROSTER
// ============================================================

async function loadRoster() {

  const container =
    document.getElementById(
      "roster-grid"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `
    <div class="loading">
      Loading active Mets roster...
    </div>
    `;

  try {

    const data =
      await api(
        `/api/mets/roster?season=${CURRENT_SEASON}`
      );

    let roster =
      data.roster || [];

    // Remove duplicate players.
    const unique =
      new Map();

    roster.forEach(
      player => {

        const id =
          player.person?.id;

        if (id) {

          unique.set(
            Number(id),
            player
          );

        }

      }
    );

    roster =
      Array.from(
        unique.values()
      );

    if (!roster.length) {

      container.innerHTML =
        `
        <div class="loading">
          No active roster found.
        </div>
        `;

      return;

    }

    // ========================================
    // GROUPS
    // ========================================

    const starters =
      roster.filter(
        isStartingPitcher
      );

    const pitchers =
      roster.filter(
        player =>
          isPitcher(player) &&
          !starters.includes(player)
      );

    const infield =
      roster.filter(
        player =>
          !isPitcher(player) &&
          (
            isCatcher(player) ||
            isInfielder(player)
          )
      );

    const outfield =
      roster.filter(
        player =>
          !isPitcher(player) &&
          !isCatcher(player) &&
          !isInfielder(player) &&
          isOutfielder(player)
      );

    // Utility players / anything MLB doesn't classify
    // cleanly are placed into infield rather than
    // silently disappearing.
    const alreadyPlaced =
      new Set([
        ...starters,
        ...pitchers,
        ...infield,
        ...outfield
      ]);

    const unclassified =
      roster.filter(
        player =>
          !alreadyPlaced.has(
            player
          )
      );

    infield.push(
      ...unclassified
    );

    let html = "";

    html +=
      renderRosterSection(
        "Starters",
        starters
      );

    html +=
      renderRosterSection(
        "Pitchers",
        pitchers
      );

    html +=
      renderRosterSection(
        "Infield",
        infield
      );

    html +=
      renderRosterSection(
        "Outfield",
        outfield
      );

    container.innerHTML =
      html;

    // ========================================
    // PLAYER CLICK EVENTS
    // ========================================

    container
      .querySelectorAll(
        ".player-card"
      )
      .forEach(
        card => {

          card.addEventListener(
            "click",
            () => {

              openPlayer(
                card.dataset.playerId
              );

            }
          );

        }
      );

  } catch (error) {

    console.error(
      "Roster:",
      error
    );

    container.innerHTML =
      `
      <div class="loading">
        Unable to load active Mets roster.
      </div>
      `;

  }

}


// ============================================================
// PLAYER MODAL
// ============================================================

async function openPlayer(
  playerId
) {

  const modal =
    document.getElementById(
      "player-modal"
    );

  const details =
    document.getElementById(
      "player-details"
    );

  if (
    !modal ||
    !details
  ) {

    return;

  }

  modal.classList.remove(
    "hidden"
  );

  details.innerHTML =
    `
    <div class="loading">
      Loading player...
    </div>
    `;

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
      statsData.stats?.[0]
        ?.splits?.[0];

    const stat =
      split?.stat || {};

    details.innerHTML = `

      <div
        class="player-modal-name"
      >
        ${escapeHTML(
          player?.fullName ||
          "Unknown Player"
        )}
      </div>

      <div
        class="player-modal-info"
      >
        ${escapeHTML(
          player
            ?.primaryPosition
            ?.name ||
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

      <div
        class="player-stat-grid"
      >

        ${renderPlayerModalStat(
          "AVG",
          stat.avg
        )}

        ${renderPlayerModalStat(
          "HR",
          stat.homeRuns
        )}

        ${renderPlayerModalStat(
          "RBI",
          stat.rbi
        )}

        ${renderPlayerModalStat(
          "OPS",
          stat.ops
        )}

        ${renderPlayerModalStat(
          "OBP",
          stat.obp
        )}

        ${renderPlayerModalStat(
          "SLG",
          stat.slg
        )}

      </div>

    `;

  } catch (error) {

    console.error(
      "Player:",
      error
    );

    details.innerHTML =
      `
      <div class="loading">
        Unable to load player information.
      </div>
      `;

  }

}


// ============================================================
// MODAL STAT
// ============================================================

function renderPlayerModalStat(
  label,
  value
) {

  return `

    <div
      class="player-stat"
      style="
        text-decoration:none !important;
        -webkit-text-decoration:none !important;
      "
    >

      <div
        class="player-stat-label"
        style="
          text-decoration:none !important;
        "
      >
        ${escapeHTML(
          label
        )}
      </div>

      <div
        class="player-stat-value"
        style="
          text-decoration:none !important;
          -webkit-text-decoration:none !important;
        "
      >
        ${escapeHTML(
          value ??
          "—"
        )}
      </div>

    </div>

  `;

}


// ============================================================
// STATS TABLE
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
    `
    <div class="loading">
      Loading Mets player statistics...
    </div>
    `;

  try {

    const data =
      await api(
        `/api/mets/stats?season=${CURRENT_SEASON}`
      );

    const stats =
      data.stats || [];

    if (!stats.length) {

      container.innerHTML =
        `
        <div class="loading">
          No Mets player statistics found.
        </div>
        `;

      return;

    }

    // ========================================
    // INLINE STYLES ARE INTENTIONAL.
    //
    // This protects the stats from any existing
    // CSS that is accidentally applying text-decoration,
    // line-through, opacity, etc.
    // ========================================

    container.innerHTML = `

      <div
        style="
          width:100%;
          overflow-x:auto;
          text-decoration:none !important;
        "
      >

        <table
          class="stats-table"
          style="
            width:100%;
            border-collapse:collapse;
            text-decoration:none !important;
          "
        >

          <thead>

            <tr>

              <th>PLAYER</th>
              <th>G</th>
              <th>AB</th>
              <th>H</th>
              <th>HR</th>
              <th>RBI</th>
              <th>AVG</th>
              <th>OBP</th>
              <th>SLG</th>
              <th>OPS</th>

            </tr>

          </thead>

          <tbody>

            ${
              stats
                .map(
                  renderStatsRow
                )
                .join("")
            }

          </tbody>

        </table>

      </div>

    `;

    // ========================================
    // PLAYER LINKS
    // ========================================

    container
      .querySelectorAll(
        ".player-link"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              openPlayer(
                button.dataset.playerId
              );

            }
          );

        }
      );

  } catch (error) {

    console.error(
      "Stats:",
      error
    );

    container.innerHTML =
      `
      <div class="loading">
        Unable to load Mets statistics.
      </div>
      `;

  }

}


// ============================================================
// STATS ROW
// ============================================================

function renderStatsRow(
  split
) {

  const player =
    split.player || {};

  const playerId =
    player.id || "";

  const playerName =
    player.fullName ||
    "Unknown Player";

  const cellStyle =
    `
      text-decoration:none !important;
      -webkit-text-decoration:none !important;
      text-decoration-line:none !important;
      opacity:1 !important;
      visibility:visible !important;
    `;

  const value =
    (
      field,
      fallback = "—"
    ) => {

      const val =
        split[field];

      return (
        val === null ||
        val === undefined ||
        val === ""
      )
        ? fallback
        : val;

    };

  return `

    <tr
      style="
        text-decoration:none !important;
      "
    >

      <td
        style="${cellStyle}"
      >

        ${
          playerId
            ? `
              <button
                type="button"
                class="player-link"
                data-player-id="${escapeHTML(
                  playerId
                )}"
                style="
                  text-decoration:none !important;
                  -webkit-text-decoration:none !important;
                  cursor:pointer;
                "
              >
                ${escapeHTML(
                  playerName
                )}
              </button>
            `
            : escapeHTML(
                playerName
              )
        }

      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("games")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("atBats")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("hits")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("homeRuns")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("rbi")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("avg")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("obp")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("slg")
        )}
      </td>

      <td style="${cellStyle}">
        ${escapeHTML(
          value("ops")
        )}
      </td>

    </tr>

  `;

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
    `
    <div class="loading">
      Loading recent Mets transactions...
    </div>
    `;

  try {

    const data =
      await api(
        "/api/mets/transactions"
      );

    const transactions =
      data.transactions || [];

    if (!transactions.length) {

      container.innerHTML =
        `
        <div class="loading">
          No recent transactions found.
        </div>
        `;

      return;

    }

    container.innerHTML =
      transactions
        .map(
          transaction => {

            let playerName =
              transaction
                .player
                ?.fullName;

            if (!playerName) {

              const first =
                transaction
                  .player
                  ?.firstName ||
                "";

              const last =
                transaction
                  .player
                  ?.lastName ||
                "";

              playerName =
                `${first} ${last}`
                  .trim();

            }

            if (!playerName) {

              playerName =
                "Team transaction";

            }

            const description =
              transaction.description ||
              transaction.typeDesc ||
              "Transaction";

            return `

              <div
                class="transaction"
              >

                <div
                  class="transaction-date"
                >
                  ${escapeHTML(
                    formatDate(
                      transaction.date
                    )
                  )}
                </div>

                <div
                  class="transaction-player"
                >
                  ${escapeHTML(
                    playerName
                  )}
                </div>

                <div
                  class="transaction-type"
                >
                  ${escapeHTML(
                    description
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
      `
      <div class="loading">
        Unable to load Mets transactions.
      </div>
      `;

  }

}


// ============================================================
// MODAL CLOSE
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

      await Promise.all([
        loadStandings(),
        loadGames()
      ]);

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
