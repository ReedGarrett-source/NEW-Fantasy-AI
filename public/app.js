// ============================================
// METS HQ
// FRONTEND APPLICATION
// ============================================

const CURRENT_SEASON = 2026;


// ============================================
// API HELPER
// ============================================

async function api(url) {

  const response = await fetch(url);

  const data = await response.json();

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || "Request failed."
    );
  }

  return data;
}


// ============================================
// FORMATTERS
// ============================================

function formatDate(dateString) {

  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return date.toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric"
    }
  );
}


function formatDateTime(dateString) {

  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  return date.toLocaleString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }
  );
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================
// NAVIGATION
// ============================================

function showSection(sectionName) {

  document
    .querySelectorAll(".section")
    .forEach(section => {
      section.classList.remove("active");
    });

  document
    .querySelectorAll(".nav-button")
    .forEach(button => {
      button.classList.remove("active");
    });

  const section =
    document.getElementById(
      `${sectionName}-section`
    );

  if (section) {
    section.classList.add("active");
  }

  document
    .querySelectorAll(
      `[data-section="${sectionName}"]`
    )
    .forEach(button => {
      button.classList.add("active");
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


// ============================================
// STANDINGS
// ============================================

async function loadStandings() {

  const recordElement =
    document.getElementById("record");

  const recordSub =
    document.getElementById("record-sub");

  const divisionRank =
    document.getElementById("division-rank");

  const gamesBack =
    document.getElementById("games-back");

  const lastTen =
    document.getElementById("last-ten");

  const streak =
    document.getElementById("streak");


  try {

    const data =
      await api(
        `/api/mets/standings?season=${CURRENT_SEASON}`
      );

    const mets =
      data.mets;


    if (!mets) {

      recordElement.textContent = "—";

      recordSub.textContent =
        "Standings unavailable";

      return;
    }


    const wins =
      mets.wins ?? 0;

    const losses =
      mets.losses ?? 0;


    recordElement.textContent =
      `${wins}-${losses}`;


    recordSub.textContent =
      `Win % ${mets.winningPercentage || "—"}`;


    divisionRank.textContent =
      mets.divisionRank
        ? `#${mets.divisionRank}`
        : "—";


    gamesBack.textContent =
      mets.gamesBack === "0.0"
        ? "1st place"
        : `${mets.gamesBack || "—"} GB`;


    if (mets.lastTen) {

      lastTen.textContent =
        mets.lastTen;

    }


    if (mets.streak) {

      streak.textContent =
        mets.streak.streakCode ||
        "—";

    }

  } catch (error) {

    console.error(error);

    recordElement.textContent =
      "—";

    recordSub.textContent =
      "Unable to load";

  }
}


// ============================================
// GAMES
// ============================================

function getMetsGameInfo(game) {

  const homeTeam =
    game.teams?.home?.team;

  const awayTeam =
    game.teams?.away?.team;

  const metsIsHome =
    Number(homeTeam?.id) === 121;

  const metsTeam =
    metsIsHome
      ? game.teams.home
      : game.teams.away;

  const opponentTeam =
    metsIsHome
      ? awayTeam
      : homeTeam;

  return {
    metsIsHome,
    metsTeam,
    opponentTeam
  };
}


function renderGame(game) {

  const {
    metsIsHome,
    metsTeam,
    opponentTeam
  } = getMetsGameInfo(game);


  const status =
    game.status?.detailedState ||
    game.status?.abstractGameState ||
    "Scheduled";


  const metsScore =
    metsTeam?.score;

  const opponentScore =
    opponentTeam?.score;


  let resultClass = "";

  if (
    typeof metsScore === "number" &&
    typeof opponentScore === "number"
  ) {

    if (metsScore > opponentScore) {
      resultClass = "win";
    }

    if (metsScore < opponentScore) {
      resultClass = "loss";
    }
  }


  const scoreText =
    typeof metsScore === "number" &&
    typeof opponentScore === "number"
      ? `${metsScore} - ${opponentScore}`
      : "—";


  const opponentName =
    opponentTeam?.team?.name ||
    "Opponent";


  const location =
    metsIsHome
      ? "vs."
      : "@";


  return `
    <div class="game">

      <div class="game-date">
        ${formatDate(game.gameDate)}
      </div>

      <div class="game-teams">

        <span class="team-name mets">
          Mets
        </span>

        <span>
          ${location}
        </span>

        <span class="team-name">
          ${escapeHTML(opponentName)}
        </span>

        <span class="game-score ${resultClass}">
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
    document.getElementById("games-list");

  const homeContainer =
    document.getElementById("home-games");


  container.innerHTML =
    `<div class="loading">Loading games...</div>`;

  if (homeContainer) {
    homeContainer.innerHTML =
      `<div class="loading">Loading Mets games...</div>`;
  }


  try {

    const data =
      await api("/api/mets/games");

    const games =
      data.games || [];


    if (!games.length) {

      container.innerHTML =
        `<div class="loading">No games found.</div>`;

      if (homeContainer) {
        homeContainer.innerHTML =
          `<div class="loading">No games found.</div>`;
      }

      return;
    }


    const html =
      games
        .map(renderGame)
        .join("");


    container.innerHTML =
      html;


    if (homeContainer) {

      homeContainer.innerHTML =
        games
          .slice(0, 5)
          .map(renderGame)
          .join("");

    }

  } catch (error) {

    console.error(error);

    container.innerHTML =
      `<div class="loading">
        Unable to load Mets games.
      </div>`;

    if (homeContainer) {

      homeContainer.innerHTML =
        `<div class="loading">
          Unable to load Mets games.
        </div>`;

    }

  }
}


// ============================================
// ROSTER
// ============================================

async function loadRoster() {

  const container =
    document.getElementById("roster-grid");


  container.innerHTML =
    `<div class="loading">Loading roster...</div>`;


  try {

    const data =
      await api(
        `/api/mets/roster?season=${CURRENT_SEASON}&rosterType=40Man`
      );


    const roster =
      data.roster || [];


    if (!roster.length) {

      container.innerHTML =
        `<div class="loading">
          No roster data found.
        </div>`;

      return;
    }


    container.innerHTML =
      roster
        .map(player => {

          const person =
            player.person || {};

          const position =
            player.position?.abbreviation ||
            player.position?.name ||
            "—";

          const number =
            player.jerseyNumber ||
            person.primaryNumber ||
            "—";


          return `
            <div
              class="player-card"
              data-player-id="${person.id}"
            >

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

        })
        .join("");


    document
      .querySelectorAll(".player-card")
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

    console.error(error);

    container.innerHTML =
      `<div class="loading">
        Unable to load Mets roster.
      </div>`;

  }
}


// ============================================
// PLAYER MODAL
// ============================================

async function openPlayer(playerId) {

  const modal =
    document.getElementById("player-modal");

  const details =
    document.getElementById("player-details");


  modal.classList.remove("hidden");


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
        `/api/player/${playerId}/stats?season=${CURRENT_SEASON}&group=hitting&stats=season`
      );


    const player =
      playerData.player;

    const stat =
      statsData.stats?.[0]?.splits?.[0]?.stat ||
      statsData.stats?.[0]?.stat ||
      {};


    const fullName =
      player?.fullName ||
      "Unknown Player";


    const position =
      player?.primaryPosition?.name ||
      "—";


    details.innerHTML = `

      <div class="player-modal-name">
        ${escapeHTML(fullName)}
      </div>

      <div class="player-modal-info">
        ${escapeHTML(position)}
        ${player?.primaryNumber
          ? ` · #${escapeHTML(player.primaryNumber)}`
          : ""}
      </div>

      <div class="player-stat-grid">

        <div class="player-stat">

          <div class="player-stat-label">
            AVG
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.avg || "—")}
          </div>

        </div>

        <div class="player-stat">

          <div class="player-stat-label">
            HR
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.homeRuns ?? "—")}
          </div>

        </div>

        <div class="player-stat">

          <div class="player-stat-label">
            RBI
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.rbi ?? "—")}
          </div>

        </div>

        <div class="player-stat">

          <div class="player-stat-label">
            OPS
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.ops || "—")}
          </div>

        </div>

        <div class="player-stat">

          <div class="player-stat-label">
            OBP
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.obp || "—")}
          </div>

        </div>

        <div class="player-stat">

          <div class="player-stat-label">
            SLG
          </div>

          <div class="player-stat-value">
            ${escapeHTML(stat.slg || "—")}
          </div>

        </div>

      </div>

    `;

  } catch (error) {

    console.error(error);

    details.innerHTML =
      `<div class="loading">
        Unable to load player information.
      </div>`;

  }

}


document
  .getElementById("close-modal")
  .addEventListener(
    "click",
    () => {

      document
        .getElementById("player-modal")
        .classList.add("hidden");

    }
  );


document
  .querySelector(".modal-backdrop")
  .addEventListener(
    "click",
    () => {

      document
        .getElementById("player-modal")
        .classList.add("hidden");

    }
  );


// ============================================
// STATS
// ============================================

async function loadStats() {

  const container =
    document.getElementById(
      "stats-table-container"
    );


  container.innerHTML =
    `<div class="loading">
      Loading Mets statistics...
    </div>`;


  try {

    const data =
      await api(
        `/api/mets/stats?season=${CURRENT_SEASON}&group=hitting`
      );


    const stats =
      data.stats?.[0]?.splits || [];


    if (!stats.length) {

      container.innerHTML =
        `<div class="loading">
          No hitting statistics available.
        </div>`;

      return;
    }


    container.innerHTML = `

      <table class="stats-table">

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

          ${stats
            .map(split => {

              const player =
                split.player || {};

              const stat =
                split.stat || {};


              return `

                <tr>

                  <td>

                    <button
                      class="player-link"
                      data-player-id="${player.id}"
                    >
                      ${escapeHTML(
                        player.fullName ||
                        "Unknown"
                      )}
                    </button>

                  </td>

                  <td>${escapeHTML(stat.gamesPlayed ?? "—")}</td>

                  <td>${escapeHTML(stat.atBats ?? "—")}</td>

                  <td>${escapeHTML(stat.hits ?? "—")}</td>

                  <td>${escapeHTML(stat.homeRuns ?? "—")}</td>

                  <td>${escapeHTML(stat.rbi ?? "—")}</td>

                  <td>${escapeHTML(stat.avg || "—")}</td>

                  <td>${escapeHTML(stat.obp || "—")}</td>

                  <td>${escapeHTML(stat.slg || "—")}</td>

                  <td>${escapeHTML(stat.ops || "—")}</td>

                </tr>

              `;

            })
            .join("")}

        </tbody>

      </table>

    `;


    document
      .querySelectorAll(".player-link")
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


  } catch (error) {

    console.error(error);

    container.innerHTML =
      `<div class="loading">
        Unable to load Mets statistics.
      </div>`;

  }
}


// ============================================
// TRANSACTIONS
// ============================================

async function loadTransactions() {

  const container =
    document.getElementById(
      "transactions-list"
    );


  container.innerHTML =
    `<div class="loading">
      Loading transactions...
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
        .map(transaction => {

          const player =
            transaction.player?.fullName ||
            transaction.player?.firstName
              ? `${transaction.player.firstName || ""} ${transaction.player.lastName || ""}`.trim()
              : "Team transaction";


          return `

            <div class="transaction">

              <div class="transaction-date">
                ${formatDate(
                  transaction.date
                )}
              </div>

              <div class="transaction-player">
                ${escapeHTML(player)}
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

        })
        .join("");


  } catch (error) {

    console.error(error);

    container.innerHTML =
      `<div class="loading">
        Unable to load transactions.
      </div>`;

  }
}


// ============================================
// BUTTONS
// ============================================

document
  .getElementById("refresh-home")
  .addEventListener(
    "click",
    async () => {

      await loadStandings();
      await loadGames();

    }
  );


document
  .getElementById("refresh-games")
  .addEventListener(
    "click",
    loadGames
  );


document
  .getElementById("refresh-roster")
  .addEventListener(
    "click",
    loadRoster
  );


document
  .getElementById("refresh-stats")
  .addEventListener(
    "click",
    loadStats
  );


document
  .getElementById("refresh-transactions")
  .addEventListener(
    "click",
    loadTransactions
  );


// ============================================
// INITIAL LOAD
// ============================================

async function initialize() {

  console.log("Starting Mets HQ...");

  await Promise.all([
    loadStandings(),
    loadGames()
  ]);

  console.log("Mets HQ ready.");
}


initialize();
