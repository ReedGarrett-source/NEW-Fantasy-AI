const CURRENT_SEASON = 2026;
// ============================================
// API
// ============================================
async function api(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || "Request failed"
    );
  }
  return data;
}
// ============================================
// HELPERS
// ============================================
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
      mets.wins ?? 0;
    const losses =
      mets.losses ?? 0;
    const record =
      document.getElementById("record");
    if (record) {
      record.textContent =
        `${wins}-${losses}`;
    }
    const recordSub =
      document.getElementById("record-sub");
    if (recordSub) {
      recordSub.textContent =
        `Win % ${mets.winningPercentage || "—"}`;
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
        mets.gamesBack === "0.0"
          ? "1st place"
          : `${mets.gamesBack || "—"} GB`;
    }
    const lastTen =
      document.getElementById(
        "last-ten"
      );
    if (lastTen) {
      lastTen.textContent =
        mets.lastTen || "—";
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
  } catch (error) {
    console.error(
      "Standings:",
      error
    );
  }
}
// ============================================
// GAMES
// ============================================
function renderGame(game) {
  const opponentName =
    game.opponent?.name ||
    "Unknown Opponent";
  const metsScore =
    game.mets?.score;
  const opponentScore =
    game.opponent?.score;
  const isFinal =
    game.abstractGameState === "Final" ||
    game.status === "Final";
  let resultClass = "";
  if (
    isFinal &&
    typeof metsScore === "number" &&
    typeof opponentScore === "number"
  ) {
    if (metsScore > opponentScore) {
      resultClass = "win";
    }
    else if (metsScore < opponentScore) {
      resultClass = "loss";
    }
  }
  let scoreText = "—";
  if (
    typeof metsScore === "number" &&
    typeof opponentScore === "number"
  ) {
    scoreText =
      `${metsScore} - ${opponentScore}`;
  }
  const location =
    game.metsIsHome
      ? "vs."
      : "@";
  let status =
    game.detailedState ||
    game.status ||
    "Scheduled";
  /*
    Make MLB's status a little cleaner.
  */
  if (
    status === "Scheduled" ||
    status === "Pre-Game"
  ) {
    status = "Scheduled";
  }
  if (
    isFinal &&
    game.result
  ) {
    status =
      game.result === "W"
        ? "Final — W"
        : game.result === "L"
          ? "Final — L"
          : "Final";
  }
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
async function loadGames() {
  const container =
    document.getElementById(
      "games-list"
    );
  const homeContainer =
    document.getElementById(
      "home-games"
    );
  if (!container) {
    return;
  }
  container.innerHTML =
    `<div class="loading">
      Loading games...
    </div>`;
  if (homeContainer) {
    homeContainer.innerHTML =
      `<div class="loading">
        Loading Mets games...
      </div>`;
  }
  try {
    const data =
      await api(
        "/api/mets/games"
      );
    const games =
      data.games || [];
    if (!games.length) {
      container.innerHTML =
        `<div class="loading">
          No games found.
        </div>`;
      if (homeContainer) {
        homeContainer.innerHTML =
          `<div class="loading">
            No games found.
          </div>`;
      }
      return;
    }
    container.innerHTML =
      games
        .map(renderGame)
        .join("");
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
// ACTIVE ROSTER
// ============================================
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
    container.innerHTML =
      roster
        .map(player => {
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
              data-player-id="${person.id}"
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
// ============================================
// PLAYER
// ============================================
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
// ============================================
// STATS
// ============================================
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
      Loading Mets player statistics...
    </div>`;
  try {
    const data =
      await api(
        `/api/mets/stats?season=${CURRENT_SEASON}`
      );
    const stats =
      data.stats || [];
    if (!stats.length) {
      container.innerHTML =
        `<div class="loading">
          No Mets player statistics found.
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
            .map(playerStat => {
              const player =
                playerStat.player ||
                {};
              return `
                <tr>
                  <td>
                    <button
                      class="player-link"
                      data-player-id="${escapeHTML(
                        player.id
                      )}"
                    >
                      ${escapeHTML(
                        player.fullName ||
                        "Unknown Player"
                      )}
                    </button>
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.games ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.atBats ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.hits ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.homeRuns ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.rbi ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.avg ||
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.obp ||
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.slg ||
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      playerStat.ops ||
                      "—"
                    )}
                  </td>
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
// ============================================
// TRANSACTIONS
// ============================================
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
        .map(transaction => {
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
        })
        .join("");
  } catch (error) {
    console.error(
      "Transactions:",
      error
    );
    container.innerHTML =
      `<div class="loading">
        Unable to load recent Mets transactions.
      </div>`;
  }
}
// ============================================
// MODAL
// ============================================
const closeModal =
  document.getElementById(
    "close-modal"
  );
if (closeModal) {
  closeModal.addEventListener(
    "click",
    () => {
      document
        .getElementById(
          "player-modal"
        )
        ?.classList.add(
          "hidden"
        );
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
      document
        .getElementById(
          "player-modal"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );
}
// ============================================
// REFRESH BUTTONS
// ============================================
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
// ============================================
// START
// ============================================
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
