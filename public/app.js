const CURRENT_SEASON = 2026;
const METS_ID = 121;
// ============================================
// API
// ============================================
async function api(url) {
  const response = await fetch(url);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Server returned invalid JSON.");
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Request failed");
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
// Get today's date in Eastern Time.
// This automatically rolls over at midnight New York time.
function getEasternDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const year =
    parts.find(p => p.type === "year")?.value;
  const month =
    parts.find(p => p.type === "month")?.value;
  const day =
    parts.find(p => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}
// ============================================
// TEAM NAME
// ============================================
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
    return getTeamName(team.team);
  }
  return "Unknown Opponent";
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
    document.getElementById(`${sectionName}-section`);
  if (section) {
    section.classList.add("active");
  }
  document
    .querySelectorAll(`[data-section="${sectionName}"]`)
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
    button.addEventListener("click", () => {
      showSection(button.dataset.section);
    });
  });
// ============================================
// STANDINGS
// ============================================
async function loadStandings() {
  try {
    const data = await api(
      `/api/mets/standings?season=${CURRENT_SEASON}`
    );
    const mets = data.mets;
    if (!mets) {
      return;
    }
    const wins = Number(mets.wins) || 0;
    const losses = Number(mets.losses) || 0;
    const recordElement =
      document.getElementById("record");
    if (recordElement) {
      recordElement.textContent =
        `${wins}-${losses}`;
    }
    const recordSub =
      document.getElementById("record-sub");
    if (recordSub) {
      recordSub.textContent =
        `Win % ${mets.winningPercentage || "—"}`;
    }
    const divisionRank =
      document.getElementById("division-rank");
    if (divisionRank) {
      divisionRank.textContent =
        mets.divisionRank
          ? `#${mets.divisionRank}`
          : "—";
    }
    const gamesBack =
      document.getElementById("games-back");
    if (gamesBack) {
      gamesBack.textContent =
        mets.gamesBack === "0.0" ||
        mets.gamesBack === "0"
          ? "1st place"
          : `${mets.gamesBack || "—"} GB`;
    }
    // Do NOT trust MLB's lastTen field.
    // We calculate the actual last 10 below.
    const streak =
      document.getElementById("streak");
    if (streak) {
      streak.textContent =
        mets.streak?.streakCode || "—";
    }
    await loadLastTen();
  } catch (error) {
    console.error("Standings:", error);
  }
}
// ============================================
// LAST 10
// ============================================
async function loadLastTen() {
  const element =
    document.getElementById("last-ten");
  if (!element) {
    return;
  }
  try {
    const today = getEasternDate();
    const start =
      new Date(`${today}T00:00:00`);
    start.setDate(
      start.getDate() - 35
    );
    const startDate =
      start.toISOString().split("T")[0];
    const data = await api(
      `/api/mets/games?startDate=${startDate}&endDate=${today}`
    );
    const games =
      (data.games || [])
        .filter(game =>
          game.status?.abstractGameState === "Final"
        )
        .sort(
          (a, b) =>
            new Date(b.gameDate) -
            new Date(a.gameDate)
        )
        .slice(0, 10);
    let wins = 0;
    let losses = 0;
    for (const game of games) {
      const home = game.teams?.home;
      const away = game.teams?.away;
      const homeId =
        Number(home?.team?.id);
      const awayId =
        Number(away?.team?.id);
      if (
        homeId !== METS_ID &&
        awayId !== METS_ID
      ) {
        continue;
      }
      const mets =
        homeId === METS_ID
          ? home
          : away;
      const opponent =
        homeId === METS_ID
          ? away
          : home;
      const metsScore =
        Number(mets?.score);
      const opponentScore =
        Number(opponent?.score);
      if (
        Number.isFinite(metsScore) &&
        Number.isFinite(opponentScore)
      ) {
        if (metsScore > opponentScore) {
          wins++;
        } else if (metsScore < opponentScore) {
          losses++;
        }
      }
    }
    element.textContent =
      games.length
        ? `${wins}-${losses}`
        : "—";
  } catch (error) {
    console.error("Last 10:", error);
    element.textContent = "—";
  }
}
// ============================================
// GAMES
// ============================================
function getGameInfo(game) {
  const home =
    game?.teams?.home || {};
  const away =
    game?.teams?.away || {};
  const homeId =
    Number(
      home?.team?.id ??
      home?.team?.teamId ??
      home?.teamId
    );
  const awayId =
    Number(
      away?.team?.id ??
      away?.team?.teamId ??
      away?.teamId
    );
  let metsIsHome = false;
  if (homeId === METS_ID) {
    metsIsHome = true;
  } else if (awayId === METS_ID) {
    metsIsHome = false;
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
function renderGame(game) {
  const {
    metsIsHome,
    mets,
    opponent
  } = getGameInfo(game);
  const opponentName =
    getTeamName(opponent?.team || opponent);
  const metsScore =
    Number.isFinite(Number(mets?.score))
      ? Number(mets.score)
      : null;
  const opponentScore =
    Number.isFinite(Number(opponent?.score))
      ? Number(opponent.score)
      : null;
  const isFinal =
    game.status?.abstractGameState === "Final";
  let resultClass = "";
  if (
    isFinal &&
    metsScore !== null &&
    opponentScore !== null
  ) {
    if (metsScore > opponentScore) {
      resultClass = "win";
    }
    if (metsScore < opponentScore) {
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
  if (container) {
    container.innerHTML = `
      <div class="loading">
        Loading games...
      </div>
    `;
  }
  if (homeContainer) {
    homeContainer.innerHTML = `
      <div class="loading">
        Loading Mets games...
      </div>
    `;
  }
  try {
    // ALWAYS begin with the current Eastern date.
    const today = getEasternDate();
    const start =
      new Date(`${today}T00:00:00`);
    const end =
      new Date(start);
    // Show the next 21 days.
    end.setDate(
      end.getDate() + 21
    );
    const endDate =
      end.toISOString().split("T")[0];
    const data =
      await api(
        `/api/mets/games?startDate=${today}&endDate=${endDate}`
      );
    let games =
      data.games || [];
    // Never display a game before today.
    games =
      games.filter(game => {
        if (!game.gameDate) {
          return false;
        }
        const gameDate =
          new Date(game.gameDate);
        return gameDate >= start;
      });
    // Chronological order.
    games.sort(
      (a, b) =>
        new Date(a.gameDate) -
        new Date(b.gameDate)
    );
    if (!games.length) {
      const message = `
        <div class="loading">
          No Mets games found.
        </div>
      `;
      if (container) {
        container.innerHTML = message;
      }
      if (homeContainer) {
        homeContainer.innerHTML = message;
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
    console.error("Games:", error);
    const message = `
      <div class="loading">
        Unable to load Mets games.
      </div>
    `;
    if (container) {
      container.innerHTML = message;
    }
    if (homeContainer) {
      homeContainer.innerHTML = message;
    }
  }
}
// ============================================
// ROSTER
// ============================================
function getPosition(player) {
  return (
    player.position?.abbreviation ||
    player.position?.name ||
    player.person?.primaryPosition?.abbreviation ||
    player.person?.primaryPosition?.name ||
    ""
  ).toLowerCase();
}
function isPitcher(player) {
  const position =
    getPosition(player);
  return (
    position === "p" ||
    position.includes("pitcher")
  );
}
function isCatcher(player) {
  const position =
    getPosition(player);
  return (
    position === "c" ||
    position.includes("catcher")
  );
}
function isInfielder(player) {
  const position =
    getPosition(player);
  return [
    "1b",
    "2b",
    "3b",
    "ss"
  ].includes(position) ||
  position.includes("first base") ||
  position.includes("second base") ||
  position.includes("third base") ||
  position.includes("shortstop");
}
function isOutfielder(player) {
  const position =
    getPosition(player);
  return [
    "lf",
    "cf",
    "rf",
    "of"
  ].includes(position) ||
  position.includes("outfield");
}
function renderRosterPlayer(player) {
  const person =
    player.person || {};
  const number =
    player.jerseyNumber ||
    person.primaryNumber ||
    "—";
  const position =
    player.position?.abbreviation ||
    player.position?.name ||
    person.primaryPosition?.abbreviation ||
    person.primaryPosition?.name ||
    "—";
  return `
    <div
      class="player-card"
      data-player-id="${escapeHTML(person.id)}"
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
}
function renderRosterSection(title, players) {
  if (!players.length) {
    return "";
  }
  return `
    <div class="roster-group">
      <h2 class="roster-group-title">
        ${escapeHTML(title)}
      </h2>
      <div class="roster-grid-section">
        ${players
          .map(renderRosterPlayer)
          .join("")}
      </div>
    </div>
  `;
}
async function loadRoster() {
  const container =
    document.getElementById("roster-grid");
  if (!container) {
    return;
  }
  container.innerHTML = `
    <div class="loading">
      Loading active Mets roster...
    </div>
  `;
  try {
    const data =
      await api(
        `/api/mets/roster?season=${CURRENT_SEASON}`
      );
    const roster =
      data.roster || [];
    if (!roster.length) {
      container.innerHTML = `
        <div class="loading">
          No active roster found.
        </div>
      `;
      return;
    }
    const pitchers =
      roster.filter(isPitcher);
    const infield =
      roster.filter(player =>
        !isPitcher(player) &&
        (isCatcher(player) ||
         isInfielder(player))
      );
    const outfield =
      roster.filter(player =>
        !isPitcher(player) &&
        isOutfielder(player)
      );
    /*
      MLB does not reliably provide "starter" vs.
      "reliever" as a roster field.
      We therefore use the pitching role supplied
      by the API when available, and otherwise keep
      all pitchers together rather than incorrectly
      guessing.
    */
    const starters =
      pitchers.filter(player => {
        const role =
          (
            player.pitchingRole ||
            player.rosterRole ||
            player.role ||
            ""
          ).toLowerCase();
        return (
          role.includes("starter") ||
          role.includes("starting")
        );
      });
    const relievers =
      pitchers.filter(player => {
        const role =
          (
            player.pitchingRole ||
            player.rosterRole ||
            player.role ||
            ""
          ).toLowerCase();
        return !(
          role.includes("starter") ||
          role.includes("starting")
        );
      });
    let html = "";
    if (starters.length) {
      html += renderRosterSection(
        "Starters",
        starters
      );
    }
    if (relievers.length) {
      html += renderRosterSection(
        "Relievers",
        relievers
      );
    }
    html += renderRosterSection(
      "Infield",
      infield
    );
    html += renderRosterSection(
      "Outfield",
      outfield
    );
    // Fallback so no pitcher disappears.
    if (
      !starters.length &&
      !relievers.length &&
      pitchers.length
    ) {
      html =
        renderRosterSection(
          "Pitchers",
          pitchers
        ) +
        renderRosterSection(
          "Infield",
          infield
        ) +
        renderRosterSection(
          "Outfield",
          outfield
        );
    }
    container.innerHTML = html;
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
    console.error("Roster:", error);
    container.innerHTML = `
      <div class="loading">
        Unable to load active Mets roster.
      </div>
    `;
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
  if (!modal || !details) {
    return;
  }
  modal.classList.remove("hidden");
  details.innerHTML = `
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
              stat.avg ?? "—"
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
              stat.ops ?? "—"
            )}
          </div>
        </div>
        <div class="player-stat">
          <div class="player-stat-label">
            OBP
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.obp ?? "—"
            )}
          </div>
        </div>
        <div class="player-stat">
          <div class="player-stat-label">
            SLG
          </div>
          <div class="player-stat-value">
            ${escapeHTML(
              stat.slg ?? "—"
            )}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Player:", error);
    details.innerHTML = `
      <div class="loading">
        Unable to load player information.
      </div>
    `;
  }
}
// ============================================
// STATS
// ============================================
function getStatObject(split) {
  if (!split) {
    return {};
  }
  // Normal MLB Stats API format.
  if (split.stat) {
    return split.stat;
  }
  // Some API responses may place stats elsewhere.
  if (split.stats) {
    return split.stats;
  }
  return {};
}
function getPlayerObject(split) {
  if (!split) {
    return {};
  }
  if (split.player) {
    return split.player;
  }
  if (split.person) {
    return split.person;
  }
  return {};
}
async function loadStats() {
  const container =
    document.getElementById(
      "stats-table-container"
    );
  if (!container) {
    return;
  }
  container.innerHTML = `
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
      container.innerHTML = `
        <div class="loading">
          No Mets player statistics found.
        </div>
      `;
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
                getPlayerObject(split);
              const stat =
                getStatObject(split);
              const playerName =
                player.fullName ||
                player.name ||
                "Unknown Player";
              const playerId =
                player.id ||
                player.personId ||
                split.playerId ||
                "";
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
                              playerName
                            )}
                          </button>
                        `
                        : escapeHTML(
                            playerName
                          )
                    }
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.gamesPlayed ??
                      stat.games ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.atBats ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.hits ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.homeRuns ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.rbi ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.avg ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.obp ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.slg ??
                      "—"
                    )}
                  </td>
                  <td>
                    ${escapeHTML(
                      stat.ops ??
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
    console.error("Stats:", error);
    container.innerHTML = `
      <div class="loading">
        Unable to load Mets statistics.
      </div>
    `;
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
  container.innerHTML = `
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
      container.innerHTML = `
        <div class="loading">
          No recent transactions found.
        </div>
      `;
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
    container.innerHTML = `
      <div class="loading">
        Unable to load Mets transactions.
      </div>
    `;
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
      const modal =
        document.getElementById(
          "player-modal"
        );
      if (modal) {
        modal.classList.add("hidden");
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
        modal.classList.add("hidden");
      }
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
