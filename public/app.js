const CURRENT_SEASON = 2026;
const METS_ID = 121;

// ============================================
// API
// ============================================

async function api(url) {

const response = await fetch(url);

const data = await response.json();

if (!response.ok || data.success === false) {
throw new Error(
data.error || “Request failed”
);
}

return data;
}

// ============================================
// HELPERS
// ============================================

function escapeHTML(value) {

return String(value ?? “”)
.replaceAll(”&”, “&”)
.replaceAll(”<”, “<”)
.replaceAll(”>”, “>”)
.replaceAll(’”’, “"”)
.replaceAll(”’”, “'”);
}

// Get today’s date in Eastern Time.
// This makes the schedule automatically roll over
// each day based on New York time.

function getEasternDate() {

const parts = new Intl.DateTimeFormat(
“en-US”,
{
timeZone: “America/New_York”,
year: “numeric”,
month: “2-digit”,
day: “2-digit”
}
).formatToParts(new Date());

const year =
parts.find(p => p.type === “year”).value;

const month =
parts.find(p => p.type === “month”).value;

const day =
parts.find(p => p.type === “day”).value;

return ${year}-${month}-${day};

}

function formatDate(dateString) {

if (!dateString) {
return “—”;
}

const date = new Date(dateString);

return date.toLocaleDateString(
“en-US”,
{
timeZone: “America/New_York”,
weekday: “short”,
month: “short”,
day: “numeric”
}
);

}

// Safely turn an MLB team object into a name.

function getTeamName(team) {

if (!team) {
return “Unknown Opponent”;
}

if (typeof team === “string”) {
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

return “Unknown Opponent”;

}

// ============================================
// NAVIGATION
// ============================================

function showSection(sectionName) {

document
.querySelectorAll(”.section”)
.forEach(section => {

  section.classList.remove("active");
});

document
.querySelectorAll(”.nav-button”)
.forEach(button => {

  button.classList.remove("active");
});

const section =
document.getElementById(
${sectionName}-section
);

if (section) {
section.classList.add(“active”);
}

document
.querySelectorAll(
[data-section="${sectionName}"]
)
.forEach(button => {

  button.classList.add("active");
});

window.scrollTo({
top: 0,
behavior: “smooth”
});

if (sectionName === “games”) {
loadGames();
}

if (sectionName === “roster”) {
loadRoster();
}

if (sectionName === “stats”) {
loadStats();
}

if (sectionName === “transactions”) {
loadTransactions();
}

}

document
.querySelectorAll(”[data-section]”)
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
  Number(mets.wins) || 0;
const losses =
  Number(mets.losses) || 0;
document.getElementById(
  "record"
).textContent =
  `${wins}-${losses}`;
document.getElementById(
  "record-sub"
).textContent =
  `Win % ${mets.winningPercentage || "—"}`;
document.getElementById(
  "division-rank"
).textContent =
  mets.divisionRank
    ? `#${mets.divisionRank}`
    : "—";
const gamesBack =
  mets.gamesBack;
document.getElementById(
  "games-back"
).textContent =
  gamesBack === "0.0" ||
  gamesBack === "0"
    ? "1st place"
    : `${gamesBack || "—"} GB`;
// MLB sometimes returns lastTen as an object
// instead of a string.
let lastTen = "—";
if (typeof mets.lastTen === "string") {
  lastTen = mets.lastTen;
} else if (mets.lastTen) {
  const wins10 =
    Number(
      mets.lastTen.wins ??
      mets.lastTen.winsLastTen
    );
  const losses10 =
    Number(
      mets.lastTen.losses ??
      mets.lastTen.lossesLastTen
    );
  if (
    Number.isFinite(wins10) &&
    Number.isFinite(losses10)
  ) {
    lastTen =
      `${wins10}-${losses10}`;
  }
}
document.getElementById(
  "last-ten"
).textContent =
  lastTen;
document.getElementById(
  "streak"
).textContent =
  mets.streak?.streakCode ||
  "—";

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
} =
getGameInfo(game);

const opponentName =
getTeamName(
opponent?.team || opponent
);

const metsScore =
Number.isFinite(Number(mets?.score))
? Number(mets.score)
: null;

const opponentScore =
Number.isFinite(Number(opponent?.score))
? Number(opponent.score)
: null;

const abstractState =
game.status?.abstractGameState;

const isFinal =
abstractState === “Final”;

let resultClass = “”;

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
“Scheduled”;

const location =
metsIsHome
? “vs.”
: “@”;

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
“games-list”
);

const homeContainer =
document.getElementById(
“home-games”
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

// Start TODAY in Eastern Time.
// This automatically changes every day.
const today =
  getEasternDate();
const start =
  new Date(
    `${today}T00:00:00-04:00`
  );
// Show the next 21 days.
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
// Make absolutely sure no games before
// today appear.
games =
  games.filter(game => {
    const gameDate =
      game.gameDate
        ? new Date(game.gameDate)
        : null;
    if (!gameDate) {
      return false;
    }
    return gameDate >= start;
  });
// Sort chronological.
games.sort((a, b) =>
  new Date(a.gameDate) -
  new Date(b.gameDate)
);
if (!games.length) {
  const message =
    `<div class="loading">
      No upcoming Mets games found.
    </div>`;
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

console.error(
  "Games:",
  error
);
const message =
  `<div class="loading">
    Unable to load Mets games.
  </div>`;
if (container) {
  container.innerHTML = message;
}
if (homeContainer) {
  homeContainer.innerHTML = message;
}

}

}

// ============================================
// ACTIVE ROSTER
// ============================================

function rosterCategory(player) {

const position =
(
player.position?.abbreviation ||
player.position?.name ||
“”
).toLowerCase();

// Pitchers

if (
position === “p” ||
position.includes(“pitcher”)
) {

const type =
  (
    player.pitchHand?.description ||
    ""
  ).toLowerCase();
// Keep pitchers in a simple pitcher group.
// The heading will separate starters/relievers
// using roster status when available.
if (
  player.status?.code === "A" &&
  player.person?.primaryPosition?.abbreviation === "P"
) {
  return "pitcher";
}
return "pitcher";

}

// Catchers are grouped with infield.

if (
position === “c” ||
position.includes(“catcher”)
) {

return "infield";

}

// Infield

if (
[
“1b”,
“2b”,
“3b”,
“ss”
].includes(position) ||
position.includes(“first base”) ||
position.includes(“second base”) ||
position.includes(“third base”) ||
position.includes(“shortstop”)
) {

return "infield";

}

// Outfield

if (
[
“lf”,
“cf”,
“rf”,
“of”
].includes(position) ||
position.includes(“outfield”)
) {

return "outfield";

}

return “infield”;

}

function renderRosterPlayer(player) {

const person =
player.person || {};

const number =
player.jerseyNumber ||
person.primaryNumber ||
“—”;

const position =
player.position?.abbreviation ||
player.position?.name ||
“—”;

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

function renderRosterSection(
title,
players
) {

if (!players.length) {
return “”;
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
document.getElementById(
“roster-grid”
);

container.innerHTML =
<div class="loading"> Loading active Mets roster... </div>;

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
const pitchers =
  roster.filter(
    p =>
      rosterCategory(p) === "pitcher"
  );
const infield =
  roster.filter(
    p =>
      rosterCategory(p) === "infield"
  );
const outfield =
  roster.filter(
    p =>
      rosterCategory(p) === "outfield"
  );
// Try to distinguish starters and relievers
// using MLB roster position/status information.
const starters =
  pitchers.filter(player => {
    const fullName =
      (
        player.person?.fullName ||
        ""
      ).toLowerCase();
    const positionName =
      (
        player.position?.name ||
        ""
      ).toLowerCase();
    return (
      positionName.includes("starting") ||
      player.rosterType === "starting" ||
      fullName === ""
    );
  });
const relievers =
  pitchers.filter(player =>
    !starters.includes(player)
  );
let html = "";
html += renderRosterSection(
  "Starters",
  starters
);
html += renderRosterSection(
  "Relievers",
  relievers
);
html += renderRosterSection(
  "Infield",
  infield
);
html += renderRosterSection(
  "Outfield",
  outfield
);
// If MLB doesn't identify starters,
// don't hide pitchers.
if (!starters.length && relievers.length) {
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
“player-modal”
);

const details =
document.getElementById(
“player-details”
);

modal.classList.remove(
“hidden”
);

details.innerHTML =
<div class="loading"> Loading player... </div>;

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
“stats-table-container”
);

container.innerHTML =
<div class="loading"> Loading Mets player statistics... </div>;

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
        .map(split => {
          // MLB Stats API normally returns
          // player information in split.player
          // when person hydration is requested.
          const player =
            split.player ||
            split.person ||
            {};
          const stat =
            split.stat ||
            {};
          const playerName =
            player.fullName ||
            player.name ||
            "Unknown Player";
          const playerId =
            player.id ||
            player.personId ||
            "";
          return `
            <tr>
              <td>
                ${
                  playerId
                    ? `
                      <button
                        class="player-link"
                        data-player-id="${escapeHTML(playerId)}"
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
“transactions-list”
);

container.innerHTML =
<div class="loading"> Loading recent Mets transactions... </div>;

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
    Unable to load Mets transactions.
  </div>`;

}

}

// ============================================
// MODAL
// ============================================

const closeModal =
document.getElementById(
“close-modal”
);

if (closeModal) {

closeModal.addEventListener(
“click”,
() => {

  document
    .getElementById(
      "player-modal"
    )
    .classList.add(
      "hidden"
    );
}

);

}

const modalBackdrop =
document.querySelector(
“.modal-backdrop”
);

if (modalBackdrop) {

modalBackdrop.addEventListener(
“click”,
() => {

  document
    .getElementById(
      "player-modal"
    )
    .classList.add(
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
“refresh-home”
);

if (refreshHome) {

refreshHome.addEventListener(
“click”,
async () => {

  await loadStandings();
  await loadGames();
}

);

}

const refreshGames =
document.getElementById(
“refresh-games”
);

if (refreshGames) {

refreshGames.addEventListener(
“click”,
loadGames
);

}

const refreshRoster =
document.getElementById(
“refresh-roster”
);

if (refreshRoster) {

refreshRoster.addEventListener(
“click”,
loadRoster
);

}

const refreshStats =
document.getElementById(
“refresh-stats”
);

if (refreshStats) {

refreshStats.addEventListener(
“click”,
loadStats
);

}

const refreshTransactions =
document.getElementById(
“refresh-transactions”
);

if (refreshTransactions) {

refreshTransactions.addEventListener(
“click”,
loadTransactions
);

}

// ============================================
// START
// ============================================

async function initialize() {

console.log(
“Starting Mets HQ…”
);

await Promise.all([
loadStandings(),
loadGames()
]);

console.log(
“Mets HQ ready.”
);

}

initialize();
