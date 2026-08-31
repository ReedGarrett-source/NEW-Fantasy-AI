const CURRENT_SEASON = 2026;
const METS_ID = 121;

let allStats = [];
let currentStatMode = "hitting";
let currentSort = {
  key: null,
  direction: "desc"
};

let allRosterPlayers = [];
let currentGameFilter = "all";

// ============================================================
// API
// ============================================================

async function api(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned invalid JSON.");
  }

  if (!response.ok || data?.success === false) {
    throw new Error(
      data?.error ||
      `Request failed with status ${response.status}`
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

function getEasternDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getTeamId(team) {
  if (!team) {
    return null;
  }

  if (typeof team === "number") {
    return team;
  }

  if (typeof team === "string") {
    const numeric = Number(team);

    return Number.isFinite(numeric)
      ? numeric
      : null;
  }

  const possibleIds = [
    team.id,
    team.teamId,
    team.team?.id,
    team.team?.teamId
  ];

  for (const value of possibleIds) {
    const numeric = Number(value);

    if (
      Number.isFinite(numeric) &&
      numeric > 0
    ) {
      return numeric;
    }
  }

  return null;
}

function getTeamName(team) {
  if (!team) {
    return "Unknown Opponent";
  }

  if (typeof team === "string") {
    return team;
  }

  if (typeof team === "number") {
    return "Unknown Opponent";
  }

  const candidates = [
    team.name,
    team.teamName,
    team.clubName,
    team.shortName,
    team.team?.name,
    team.team?.teamName,
    team.team?.clubName,
    team.team?.shortName
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  return "Unknown Opponent";
}

function getPlayerName(player) {
  return (
    player?.person?.fullName ||
    player?.player?.fullName ||
    player?.fullName ||
    player?.person?.name ||
    player?.name ||
    "Unknown Player"
  );
}

function getPlayerId(player) {
  const candidates = [
    player?.person?.id,
    player?.person?.personId,
    player?.player?.id,
    player?.player?.personId,
    player?.id,
    player?.personId
  ];

  for (const value of candidates) {
    const number = Number(value);

    if (
      Number.isFinite(number) &&
      number > 0
    ) {
      return String(number);
    }
  }

  return "";
}

function numberValue(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function displayValue(value) {
  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? "—"
    : String(value);
}

function normalizeAverage(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric = Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function isPitcher(player) {
  const position = (
    player?.position?.abbreviation ||
    player?.position?.name ||
    player?.person?.primaryPosition?.abbreviation ||
    ""
  ).toLowerCase();

  return (
    position === "p" ||
    position.includes("pitch")
  );
}

function isCatcher(player) {
  const position = (
    player?.position?.abbreviation ||
    player?.position?.name ||
    player?.person?.primaryPosition?.abbreviation ||
    ""
  ).toLowerCase();

  return (
    position === "c" ||
    position.includes("catcher")
  );
}

function isInfield(player) {
  const position = (
    player?.position?.abbreviation ||
    player?.position?.name ||
    player?.person?.primaryPosition?.abbreviation ||
    ""
  ).toLowerCase();

  return (
    [
      "1b",
      "2b",
      "3b",
      "ss",
      "c"
    ].includes(position) ||
    position.includes("first base") ||
    position.includes("second base") ||
    position.includes("third base") ||
    position.includes("shortstop") ||
    position.includes("catcher")
  );
}

function isOutfield(player) {
  const position = (
    player?.position?.abbreviation ||
    player?.position?.name ||
    player?.person?.primaryPosition?.abbreviation ||
    ""
  ).toLowerCase();

  return (
    [
      "lf",
      "cf",
      "rf",
      "of"
    ].includes(position) ||
    position.includes("outfield")
  );
}

// ============================================================
// NAVIGATION
// ============================================================

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

  document
    .querySelectorAll(`[data-section="${sectionName}"]`)
    .forEach(button => {
      if (button.classList.contains("nav-button")) {
        button.classList.add("active");
      }
    });

  const section = document.getElementById(
    `${sectionName}-section`
  );

  if (section) {
    section.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (sectionName === "home") {
    loadStandings();
    loadGames();
  }

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

document.addEventListener("click", event => {
  const button = event.target.closest(
    "[data-section]"
  );

  if (!button) {
    return;
  }

  const section = button.dataset.section;

  if (section) {
    showSection(section);
  }
});

// ============================================================
// STANDINGS
// ============================================================

async function loadStandings() {
  try {
    const data = await api(
      `/api/mets/standings?season=${CURRENT_SEASON}`
    );

    const mets =
      data?.mets ||
      data?.team ||
      data?.standings?.find(team =>
        Number(team?.team?.id) === METS_ID ||
        Number(team?.id) === METS_ID
      );

    if (!mets) {
      console.warn(
        "Could not locate Mets standings object.",
        data
      );
      return;
    }

    const wins = numberValue(
      mets.wins ??
      mets.record?.wins ??
      mets.team?.record?.wins
    );

    const losses = numberValue(
      mets.losses ??
      mets.record?.losses ??
      mets.team?.record?.losses
    );

    const recordElement =
      document.getElementById("record");

    const recordSubElement =
      document.getElementById("record-sub");

    if (
      wins !== null &&
      losses !== null
    ) {
      if (recordElement) {
        recordElement.textContent =
          `${wins}-${losses}`;
      }

      const percentage =
        wins + losses > 0
          ? (wins / (wins + losses)).toFixed(3)
          : "—";

      if (recordSubElement) {
        recordSubElement.textContent =
          `Win % ${percentage}`;
      }
    }

    const divisionRank =
      mets.divisionRank ??
      mets.rank ??
      mets.division?.rank;

    const divisionRankElement =
      document.getElementById("division-rank");

    if (divisionRankElement) {
      divisionRankElement.textContent =
        divisionRank
          ? `#${divisionRank}`
          : "—";
    }

    const gamesBack =
      mets.gamesBack ??
      mets.divisionGamesBack ??
      mets.gamesBackInDivision;

    const gamesBackElement =
      document.getElementById("games-back");

    if (gamesBackElement) {
      gamesBackElement.textContent =
        gamesBack === "0" ||
        gamesBack === "0.0" ||
        gamesBack === 0 ||
        gamesBack === 0.0
          ? "1st place"
          : `${gamesBack ?? "—"} GB`;
    }

    let lastTen =
      mets.lastTen ??
      mets.last10 ??
      mets.record?.lastTen ??
      mets.record?.last10;

    let lastTenText = "—";

    if (typeof lastTen === "string") {
      lastTenText =
        lastTen.trim() || "—";
    } else if (lastTen) {
      const lastTenWins =
        numberValue(
          lastTen.wins ??
          lastTen.winsLastTen ??
          lastTen.w
        );

      const lastTenLosses =
        numberValue(
          lastTen.losses ??
          lastTen.lossesLastTen ??
          lastTen.l
        );

      if (
        lastTenWins !== null &&
        lastTenLosses !== null
      ) {
        lastTenText =
          `${lastTenWins}-${lastTenLosses}`;
      }
    }

    /*
      FALLBACK:
      If standings doesn't provide Last 10,
      calculate it from completed Mets games.
    */

    if (
      lastTenText === "—" ||
      lastTenText === "0-0"
    ) {
      try {
        const today = getEasternDate();

        const end = new Date(
          `${today}T23:59:59`
        );

        const start = new Date(end);

        start.setDate(
          start.getDate() - 30
        );

        const startDate =
          start.toISOString().split("T")[0];

        const dataGames =
          await api(
            `/api/mets/games?startDate=${startDate}&endDate=${today}`
          );

        const games =
          Array.isArray(dataGames?.games)
            ? dataGames.games
            : [];

        const completed =
          games
            .filter(game => {
              const state =
                game?.status?.abstractGameState;

              return (
                state === "Final" ||
                state === "Completed"
              );
            })
            .sort(
              (a, b) =>
                new Date(b.gameDate) -
                new Date(a.gameDate)
            )
            .slice(0, 10);

        let wins10 = 0;
        let losses10 = 0;

        completed.forEach(game => {
          const info =
            getGameInfo(game);

          const metsScore =
            numberValue(
              info.mets?.score
            );

          const opponentScore =
            numberValue(
              info.opponent?.score
            );

          if (
            metsScore === null ||
            opponentScore === null
          ) {
            return;
          }

          if (
            metsScore > opponentScore
          ) {
            wins10++;
          } else if (
            metsScore < opponentScore
          ) {
            losses10++;
          }
        });

        if (completed.length > 0) {
          lastTenText =
            `${wins10}-${losses10}`;
        }
      } catch (fallbackError) {
        console.warn(
          "Last 10 fallback failed:",
          fallbackError
        );
      }
    }

    const lastTenElement =
      document.getElementById("last-ten");

    if (lastTenElement) {
      lastTenElement.textContent =
        lastTenText;
    }

    const streak =
      mets.streak?.streakCode ||
      mets.streakCode ||
      mets.streak;

    const streakElement =
      document.getElementById("streak");

    if (streakElement) {
      streakElement.textContent =
        typeof streak === "string"
          ? streak
          : "—";
    }

  } catch (error) {
    console.error(
      "Standings:",
      error
    );
  }
}

// ============================================================
// GAMES
// ============================================================

function getGameInfo(game) {
  const home =
    game?.teams?.home ||
    game?.home ||
    {};

  const away =
    game?.teams?.away ||
    game?.away ||
    {};

  const homeId =
    getTeamId(home);

  const awayId =
    getTeamId(away);

  let metsIsHome = null;

  if (homeId === METS_ID) {
    metsIsHome = true;
  }

  if (awayId === METS_ID) {
    metsIsHome = false;
  }

  /*
    Some MLB responses put the team object
    inside another nested team object.
  */

  if (metsIsHome === null) {
    const homeName =
      getTeamName(home).toLowerCase();

    const awayName =
      getTeamName(away).toLowerCase();

    if (
      homeName.includes("mets") ||
      homeName.includes("new york")
    ) {
      metsIsHome = true;
    }

    if (
      awayName.includes("mets") ||
      awayName.includes("new york")
    ) {
      metsIsHome = false;
    }
  }

  const mets =
    metsIsHome === true
      ? home
      : metsIsHome === false
      ? away
      : {};

  const opponent =
    metsIsHome === true
      ? away
      : metsIsHome === false
      ? home
      : {};

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

  let opponentName =
    getTeamName(opponent);

  if (
    opponentName === "Unknown Opponent"
  ) {
    opponentName =
      getTeamName(opponent?.team);
  }

  const metsScore =
    numberValue(
      mets?.score ??
      mets?.runs ??
      mets?.team?.score
    );

  const opponentScore =
    numberValue(
      opponent?.score ??
      opponent?.runs ??
      opponent?.team?.score
    );

  const state =
    game?.status?.abstractGameState ||
    game?.status?.statusCode ||
    "";

  const isFinal =
    state === "Final" ||
    state === "Completed";

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

  let scoreText = "—";

  if (
    metsScore !== null &&
    opponentScore !== null
  ) {
    scoreText =
      `${metsScore} - ${opponentScore}`;
  }

  let status =
    game?.status?.detailedState ||
    game?.status?.abstractGameState ||
    "Scheduled";

  if (status === "Final") {
    status = "Final";
  }

  const location =
    metsIsHome === true
      ? "vs."
      : metsIsHome === false
      ? "@"
      : "vs.";

  return `
    <div
      class="game"
      data-game-state="${isFinal ? "completed" : "upcoming"}"
    >
      <div class="game-date">
        ${escapeHTML(
          formatDate(game?.gameDate)
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
          ${escapeHTML(opponentName)}
        </span>

        <span class="game-score ${resultClass}">
          ${escapeHTML(scoreText)}
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

    /*
      Get enough history to support:
      - recent results
      - Last 10
      - upcoming schedule
    */

    const startDateObj =
      new Date(`${today}T00:00:00`);

    startDateObj.setDate(
      startDateObj.getDate() - 14
    );

    const endDateObj =
      new Date(`${today}T00:00:00`);

    endDateObj.setDate(
      endDateObj.getDate() + 21
    );

    const startDate =
      startDateObj
        .toISOString()
        .split("T")[0];

    const endDate =
      endDateObj
        .toISOString()
        .split("T")[0];

    const data =
      await api(
        `/api/mets/games?startDate=${startDate}&endDate=${endDate}`
      );

    let games =
      Array.isArray(data?.games)
        ? data.games
        : [];

    games = games.filter(game => {
      if (!game?.gameDate) {
        return false;
      }

      return (
        new Date(game.gameDate) >=
        startDateObj
      );
    });

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
        container.innerHTML = message;
      }

      if (homeContainer) {
        homeContainer.innerHTML = message;
      }

      return;
    }

    /*
      Home page gets the next/recent five
      most relevant games.
    */

    const todayStart =
      new Date(`${today}T00:00:00`);

    const upcoming =
      games.filter(
        game =>
          new Date(game.gameDate) >=
          todayStart
      );

    const recent =
      games
        .filter(
          game =>
            new Date(game.gameDate) <
            todayStart
        )
        .sort(
          (a, b) =>
            new Date(b.gameDate) -
            new Date(a.gameDate)
        );

    const homeGames = [
      ...upcoming.slice(0, 5)
    ];

    if (homeGames.length < 5) {
      homeGames.push(
        ...recent.slice(
          0,
          5 - homeGames.length
        )
      );
    }

    homeGames.sort(
      (a, b) =>
        new Date(a.gameDate) -
        new Date(b.gameDate)
    );

    if (container) {
      container.innerHTML =
        games
          .map(renderGame)
          .join("");
    }

    if (homeContainer) {
      homeContainer.innerHTML =
        homeGames
          .map(renderGame)
          .join("");
    }

    applyGameFilter();
    createStatOfDay(games);

  } catch (error) {
    console.error(
      "Games:",
      error
    );

    const message =
      `<div class="error-box">
        Unable to load Mets games right now.
      </div>`;

    if (container) {
      container.innerHTML = message;
    }

    if (homeContainer) {
      homeContainer.innerHTML = message;
    }
  }
}

// ============================================================
// GAME FILTERS
// ============================================================

function applyGameFilter() {
  document
    .querySelectorAll("#games-list .game")
    .forEach(game => {
      const state =
        game.dataset.gameState;

      let visible = true;

      if (
        currentGameFilter ===
        "completed"
      ) {
        visible =
          state === "completed";
      }

      if (
        currentGameFilter ===
        "upcoming"
      ) {
        visible =
          state === "upcoming";
      }

      game.style.display =
        visible
          ? ""
          : "none";
    });
}

document.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "[data-game-filter]"
      );

    if (!button) {
      return;
    }

    currentGameFilter =
      button.dataset.gameFilter;

    document
      .querySelectorAll(
        "[data-game-filter]"
      )
      .forEach(item => {
        item.classList.remove(
          "active"
        );
      });

    button.classList.add("active");

    applyGameFilter();
  }
);

// ============================================================
// ROSTER
// ============================================================

function rosterCategory(player) {
  if (isPitcher(player)) {
    return "pitchers";
  }

  if (isInfield(player)) {
    return "infield";
  }

  if (isOutfield(player)) {
    return "outfield";
  }

  return "infield";
}

function renderRosterPlayer(player) {
  const person =
    player?.person || player;

  const playerId =
    getPlayerId(player);

  const number =
    player?.jerseyNumber ||
    person?.primaryNumber ||
    "—";

  const position =
    player?.position?.abbreviation ||
    player?.position?.name ||
    person?.primaryPosition?.abbreviation ||
    "—";

  return `
    <div
      class="player-card"
      data-player-id="${escapeHTML(playerId)}"
      data-player-name="${escapeHTML(
        getPlayerName(player).toLowerCase()
      )}"
    >
      <div class="player-top">
        <div class="player-number">
          ${escapeHTML(number)}
        </div>

        <div>
          <div class="player-name">
            ${escapeHTML(
              getPlayerName(player)
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

    let roster =
      Array.isArray(data?.roster)
        ? data.roster
        : [];

    /*
      Remove obvious duplicates.
    */

    const seen =
      new Set();

    roster =
      roster.filter(player => {
        const id =
          getPlayerId(player);

        const name =
          getPlayerName(player);

        const key =
          id || name;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });

    allRosterPlayers =
      roster;

    renderRoster();

  } catch (error) {
    console.error(
      "Roster:",
      error
    );

    container.innerHTML =
      `<div class="error-box">
        Unable to load active Mets roster.
      </div>`;
  }
}

function renderRoster() {
  const container =
    document.getElementById(
      "roster-grid"
    );

  if (!container) {
    return;
  }

  const search =
    (
      document.getElementById(
        "roster-search"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const roster =
    allRosterPlayers.filter(
      player => {
        if (!search) {
          return true;
        }

        return getPlayerName(player)
          .toLowerCase()
          .includes(search);
      }
    );

  const pitchers =
    roster.filter(
      player =>
        rosterCategory(player) ===
        "pitchers"
    );

  const infield =
    roster.filter(
      player =>
        rosterCategory(player) ===
        "infield"
    );

  const outfield =
    roster.filter(
      player =>
        rosterCategory(player) ===
        "outfield"
    );

  container.innerHTML =
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

  if (!container.innerHTML.trim()) {
    container.innerHTML =
      `<div class="loading">
        No players match your search.
      </div>`;
  }
}

document.addEventListener(
  "input",
  event => {
    if (
      event.target.id ===
      "roster-search"
    ) {
      renderRoster();
    }
  }
);

document.addEventListener(
  "click",
  event => {
    const card =
      event.target.closest(
        ".player-card"
      );

    if (!card) {
      return;
    }

    const id =
      card.dataset.playerId;

    if (id) {
      openPlayer(id);
    }
  }
);

// ============================================================
// STATS
// ============================================================

function extractStatArray(data) {
  if (Array.isArray(data?.stats)) {
    return data.stats;
  }

  if (Array.isArray(data?.splits)) {
    return data.splits;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

function getStatObject(split) {
  return (
    split?.stat ||
    split?.stats ||
    split ||
    {}
  );
}

function getStatPlayer(split) {
  return (
    split?.player ||
    split?.person ||
    split?.playerInfo ||
    {}
  );
}

function isFormerPlayer(split) {
  /*
    Prefer explicit API information.
  */

  if (
    split?.isFormer === true ||
    split?.former === true ||
    split?.active === false
  ) {
    return true;
  }

  const team =
    split?.team ||
    split?.teamInfo;

  if (
    team &&
    Number(team.id) &&
    Number(team.id) !== METS_ID
  ) {
    return true;
  }

  /*
    If stats endpoint only returns current
    Mets players, this defaults to Active.
  */

  return false;
}

function statNumber(
  stat,
  keys
) {
  for (const key of keys) {
    if (
      stat?.[key] !== undefined &&
      stat?.[key] !== null &&
      stat?.[key] !== ""
    ) {
      const number =
        Number(stat[key]);

      if (Number.isFinite(number)) {
        return number;
      }
    }
  }

  return null;
}

function prepareStatRecord(split) {
  const stat =
    getStatObject(split);

  const player =
    getStatPlayer(split);

  const name =
    getPlayerName({
      ...split,
      player
    });

  const id =
    getPlayerId({
      ...split,
      player
    });

  return {
    raw: split,

    player,

    id,

    name,

    active:
      !isFormerPlayer(split),

    G:
      statNumber(
        stat,
        [
          "gamesPlayed",
          "games",
          "G"
        ]
      ),

    AB:
      statNumber(
        stat,
        [
          "atBats",
          "AB"
        ]
      ),

    H:
      statNumber(
        stat,
        [
          "hits",
          "H"
        ]
      ),

    HR:
      statNumber(
        stat,
        [
          "homeRuns",
          "HR"
        ]
      ),

    RBI:
      statNumber(
        stat,
        [
          "rbi",
          "RBI"
        ]
      ),

    AVG:
      normalizeAverage(
        stat.avg ??
        stat.AVG
      ),

    OBP:
      normalizeAverage(
        stat.obp ??
        stat.OBP
      ),

    SLG:
      normalizeAverage(
        stat.slg ??
        stat.SLG
      ),

    OPS:
      normalizeAverage(
        stat.ops ??
        stat.OPS
      ),

    IP:
      statNumber(
        stat,
        [
          "inningsPitched",
          "IP"
        ]
      ),

    W:
      statNumber(
        stat,
        [
          "wins",
          "W"
        ]
      ),

    L:
      statNumber(
        stat,
        [
          "losses",
          "L"
        ]
      ),

    ERA:
      statNumber(
        stat,
        [
          "era",
          "ERA"
        ]
      ),

    WHIP:
      statNumber(
        stat,
        [
          "whip",
          "WHIP"
        ]
      ),

    SO:
      statNumber(
        stat,
        [
          "strikeOuts",
          "strikeouts",
          "SO"
        ]
      ),

    BB:
      statNumber(
        stat,
        [
          "baseOnBalls",
          "walks",
          "BB"
        ]
      )
  };
}

function formatStat(
  value,
  decimals = 0
) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "—";
  }

  if (decimals === 0) {
    return String(
      Math.round(value)
    );
  }

  return Number(value)
    .toFixed(decimals)
    .replace(/^0\./, ".");
}

function renderStatsTable(
  records,
  type,
  title
) {
  if (!records.length) {
    return `
      <div class="stats-block">
        <div class="stats-block-title">
          ${escapeHTML(title)}
        </div>

        <div class="loading">
          No statistics available.
        </div>
      </div>
    `;
  }

  const isHitting =
    type === "hitting";

  const columns =
    isHitting
      ? [
          ["name", "PLAYER"],
          ["G", "G"],
          ["AB", "AB"],
          ["H", "H"],
          ["HR", "HR"],
          ["RBI", "RBI"],
          ["AVG", "AVG"],
          ["OBP", "OBP"],
          ["SLG", "SLG"],
          ["OPS", "OPS"]
        ]
      : [
          ["name", "PLAYER"],
          ["G", "G"],
          ["IP", "IP"],
          ["W", "W"],
          ["L", "L"],
          ["ERA", "ERA"],
          ["WHIP", "WHIP"],
          ["SO", "SO"],
          ["BB", "BB"]
        ];

  const rows =
    records
      .map(record => {
        return `
          <tr>
            <td>
              ${
                record.id
                  ? `
                    <button
                      class="player-link"
                      data-player-id="${escapeHTML(
                        record.id
                      )}"
                    >
                      ${escapeHTML(
                        record.name
                      )}
                    </button>
                  `
                  : escapeHTML(
                      record.name
                    )
              }

              ${
                record.active
                  ? `<span class="active-badge">ACTIVE</span>`
                  : ""
              }
            </td>

            ${columns
              .slice(1)
              .map(([key]) => {
                let value =
                  record[key];

                if (
                  [
                    "AVG",
                    "OBP",
                    "SLG",
                    "OPS"
                  ].includes(key)
                ) {
                  value =
                    formatStat(
                      value,
                      3
                    );
                } else if (
                  key === "ERA" ||
                  key === "WHIP"
                ) {
                  value =
                    formatStat(
                      value,
                      2
                    );
                } else if (
                  key === "IP"
                ) {
                  value =
                    value === null
                      ? "—"
                      : String(value);
                } else {
                  value =
                    formatStat(
                      value,
                      0
                    );
                }

                return `
                  <td>
                    ${escapeHTML(value)}
                  </td>
                `;
              })
              .join("")}
          </tr>
        `;
      })
      .join("");

  return `
    <div class="stats-block">
      <div class="stats-block-title">
        ${escapeHTML(title)}
      </div>

      <table class="stats-table">
        <thead>
          <tr>
            ${columns
              .map(
                ([key, label]) => {
                  const active =
                    currentSort.key ===
                    key;

                  const arrow =
                    active
                      ? (
                          currentSort.direction ===
                          "asc"
                            ? "↑"
                            : "↓"
                        )
                      : "";

                  return `
                    <th
                      data-sort-key="${escapeHTML(
                        key
                      )}"
                    >
                      ${escapeHTML(label)}

                      ${
                        arrow
                          ? `<span class="sort-arrow">${arrow}</span>`
                          : ""
                      }
                    </th>
                  `;
                }
              )
              .join("")}
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

function renderStats() {
  const container =
    document.getElementById(
      "stats-table-container"
    );

  if (!container) {
    return;
  }

  const search =
    (
      document.getElementById(
        "stats-search"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  let records =
    allStats.filter(record => {
      if (!search) {
        return true;
      }

      return record.name
        .toLowerCase()
        .includes(search);
    });

  if (currentSort.key) {
    const key =
      currentSort.key;

    records.sort(
      (a, b) => {
        if (key === "name") {
          return currentSort.direction ===
            "asc"
            ? a.name.localeCompare(b.name)
            : b.name.localeCompare(a.name);
        }

        const av =
          a[key] === null ||
          a[key] === undefined
            ? -Infinity
            : Number(a[key]);

        const bv =
          b[key] === null ||
          b[key] === undefined
            ? -Infinity
            : Number(b[key]);

        return currentSort.direction ===
          "asc"
          ? av - bv
          : bv - av;
      }
    );
  }

  /*
    Put active players before former players
    when there is no explicit numeric sort.
  */

  if (!currentSort.key) {
    records.sort(
      (a, b) => {
        if (
          a.active !==
          b.active
        ) {
          return a.active
            ? -1
            : 1;
        }

        return a.name.localeCompare(
          b.name
        );
      }
    );
  }

  const active =
    records.filter(
      record =>
        record.active
    );

  const former =
    records.filter(
      record =>
        !record.active
    );

  container.innerHTML =
    renderStatsTable(
      active,
      currentStatMode,
      "Active Mets"
    ) +
    renderStatsTable(
      former,
      currentStatMode,
      "Former Mets"
    );
}

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
      Loading Mets statistics...
    </div>`;

  try {
    const data =
      await api(
        `/api/mets/stats?season=${CURRENT_SEASON}&group=${encodeURIComponent(
          currentStatMode
        )}`
      );

    const splits =
      extractStatArray(data);

    allStats =
      splits
        .map(prepareStatRecord)
        .filter(
          record =>
            record.name !==
            "Unknown Player"
        );

    if (!allStats.length) {
      container.innerHTML =
        `<div class="loading">
          No Mets player statistics found.
        </div>`;

      return;
    }

    currentSort = {
      key: null,
      direction: "desc"
    };

    renderStats();

    createStatOfDayFromStats();

  } catch (error) {
    console.error(
      "Stats:",
      error
    );

    container.innerHTML =
      `<div class="error-box">
        Unable to load Mets statistics.
      </div>`;
  }
}

// ============================================================
// STAT MODE / SORTING
// ============================================================

document.addEventListener(
  "click",
  event => {
    const modeButton =
      event.target.closest(
        "[data-stat-mode]"
      );

    if (modeButton) {
      currentStatMode =
        modeButton.dataset.statMode;

      document
        .querySelectorAll(
          ".stats-mode-button"
        )
        .forEach(button => {
          button.classList.remove(
            "active"
          );
        });

      modeButton.classList.add(
        "active"
      );

      loadStats();

      return;
    }

    const header =
      event.target.closest(
        "[data-sort-key]"
      );

    if (header) {
      const key =
        header.dataset.sortKey;

      if (
        currentSort.key ===
        key
      ) {
        currentSort.direction =
          currentSort.direction ===
          "desc"
            ? "asc"
            : "desc";
      } else {
        currentSort.key =
          key;

        currentSort.direction =
          "desc";
      }

      renderStats();

      return;
    }

    const playerButton =
      event.target.closest(
        ".player-link"
      );

    if (playerButton) {
      const id =
        playerButton.dataset.playerId;

      if (id) {
        openPlayer(id);
      }
    }
  }
);

document.addEventListener(
  "input",
  event => {
    if (
      event.target.id ===
      "stats-search"
    ) {
      renderStats();
    }
  }
);

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
        `/api/player/${encodeURIComponent(
          playerId
        )}`
      );

    let statsData;

    try {
      statsData =
        await api(
          `/api/player/${encodeURIComponent(
            playerId
          )}/stats?season=${CURRENT_SEASON}&group=hitting`
        );
    } catch {
      statsData = {
        stats: []
      };
    }

    const player =
      playerData?.player ||
      playerData;

    const split =
      statsData?.stats?.[0]?.splits?.[0] ||
      statsData?.splits?.[0] ||
      {};

    const stat =
      split?.stat ||
      {};

    details.innerHTML = `
      <div class="player-modal-name">
        ${escapeHTML(
          player?.fullName ||
          player?.name ||
          "Unknown Player"
        )}
      </div>

      <div class="player-modal-info">
        ${escapeHTML(
          player?.primaryPosition?.name ||
          player?.position?.name ||
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
              stat.avg ??
              "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            HR
          </div>

          <div class="player-stat-value">
            ${escapeHTML(
              stat.homeRuns ??
              "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            RBI
          </div>

          <div class="player-stat-value">
            ${escapeHTML(
              stat.rbi ??
              "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            OPS
          </div>

          <div class="player-stat-value">
            ${escapeHTML(
              stat.ops ??
              "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            OBP
          </div>

          <div class="player-stat-value">
            ${escapeHTML(
              stat.obp ??
              "—"
            )}
          </div>
        </div>

        <div class="player-stat">
          <div class="player-stat-label">
            SLG
          </div>

          <div class="player-stat-value">
            ${escapeHTML(
              stat.slg ??
              "—"
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
      `<div class="error-box">
        Unable to load player information.
      </div>`;
  }
}

function closePlayerModal() {
  document
    .getElementById(
      "player-modal"
    )
    ?.classList.add(
      "hidden"
    );
}

document
  .getElementById(
    "close-modal"
  )
  ?.addEventListener(
    "click",
    closePlayerModal
  );

document
  .querySelector(
    ".modal-backdrop"
  )
  ?.addEventListener(
    "click",
    closePlayerModal
  );

document.addEventListener(
  "keydown",
  event => {
    if (
      event.key ===
      "Escape"
    ) {
      closePlayerModal();
    }
  }
);

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
      Array.isArray(
        data?.transactions
      )
        ? data.transactions
        : [];

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
          const playerName =
            getPlayerName(
              transaction
            );

          const finalName =
            playerName ===
            "Unknown Player"
              ? "Team transaction"
              : playerName;

          return `
            <div class="transaction">

              <div class="transaction-date">
                ${escapeHTML(
                  formatDate(
                    transaction.date
                  )
                )}
              </div>

              <div class="transaction-player">
                ${escapeHTML(
                  finalName
                )}
              </div>

              <div class="transaction-type">
                ${escapeHTML(
                  transaction.description ||
                  transaction.typeDesc ||
                  transaction.type ||
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
      `<div class="error-box">
        Unable to load Mets transactions.
      </div>`;
  }
}

// ============================================================
// STAT OF THE DAY
// ============================================================

function createStatOfDayFromStats() {
  const element =
    document.getElementById(
      "stat-of-day"
    );

  if (!element) {
    return;
  }

  if (!allStats.length) {
    return;
  }

  /*
    Only use hitting records for the
    home-page HR stat.
  */

  const hitters =
    allStats.filter(
      player =>
        player.HR !== null
    );

  if (!hitters.length) {
    return;
  }

  const leader =
    [...hitters].sort(
      (a, b) =>
        (b.HR || 0) -
        (a.HR || 0)
    )[0];

  element.innerHTML = `
    <div class="stat-big">
      🏆
    </div>

    <h3>
      ${escapeHTML(
        leader.name
      )}
    </h3>

    <p>
      Leads the available Mets hitting
      data with ${escapeHTML(
        leader.HR
      )} home runs.
    </p>
  `;
}

function createStatOfDay(games) {
  if (!games?.length) {
    return;
  }

  const element =
    document.getElementById(
      "stat-of-day"
    );

  if (!element) {
    return;
  }

  /*
    Keep the actual player-based stat
    if stats are already available.
  */

  if (allStats.length) {
    createStatOfDayFromStats();
  }
}

// ============================================================
// RESEARCH LAB
// ============================================================

async function runResearch(
  query
) {
  const input =
    document.getElementById(
      "research-input"
    );

  const results =
    document.getElementById(
      "research-results"
    );

  if (!results) {
    return;
  }

  query =
    String(query || "").trim();

  if (!query) {
    results.innerHTML = `
      <div class="research-empty">
        <div>🔎</div>

        <h3>
          Enter a search
        </h3>

        <p>
          Search for a player or baseball statistic.
        </p>
      </div>
    `;

    return;
  }

  if (input) {
    input.value = query;
  }

  results.innerHTML = `
    <div class="loading">
      Searching Mets data for
      <strong>${escapeHTML(
        query
      )}</strong>...
    </div>
  `;

  /*
    First try the existing MLB research endpoint.
  */

  try {
    const encoded =
      encodeURIComponent(
        query
      );

    const data =
      await api(
        `/api/mlb/query?question=${encoded}`
      );

    renderResearchResult(
      query,
      data
    );

    return;

  } catch (error) {
    console.info(
      "Research endpoint unavailable:",
      error
    );
  }

  /*
    Front-end fallback.

    This lets Research Lab search the stats
    already loaded into the page.
  */

  const lower =
    query.toLowerCase();

  const matches =
    allStats.filter(
      record =>
        record.name
          .toLowerCase()
          .includes(lower)
    );

  if (matches.length) {
    results.innerHTML = `
      <div class="stats-block">

        <div class="stats-block-title">
          Search Results
        </div>

        <table class="stats-table">

          <thead>
            <tr>
              <th>PLAYER</th>
              <th>G</th>
              <th>HR</th>
              <th>RBI</th>
              <th>AVG</th>
              <th>OBP</th>
              <th>SLG</th>
              <th>OPS</th>
            </tr>
          </thead>

          <tbody>
            ${matches
              .map(record => `
                <tr>

                  <td>
                    ${
                      record.id
                        ? `
                          <button
                            class="player-link"
                            data-player-id="${escapeHTML(
                              record.id
                            )}"
                          >
                            ${escapeHTML(
                              record.name
                            )}
                          </button>
                        `
                        : escapeHTML(
                            record.name
                          )
                    }
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.G
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.HR
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.RBI
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.AVG,
                        3
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.OBP,
                        3
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.SLG,
                        3
                      )
                    )}
                  </td>

                  <td>
                    ${escapeHTML(
                      formatStat(
                        record.OPS,
                        3
                      )
                    )}
                  </td>

                </tr>
              `)
              .join("")}
          </tbody>

        </table>
      </div>
    `;

    return;
  }

  results.innerHTML = `
    <div class="research-empty">

      <div>🧠</div>

      <h3>
        Research Engine Ready
      </h3>

      <p>
        No matching loaded player data was found.
        The Research Lab is ready to connect to
        the full MLB Research Engine.
      </p>

    </div>
  `;
}

function renderResearchResult(
  query,
  data
) {
  const results =
    document.getElementById(
      "research-results"
    );

  if (!results) {
    return;
  }

  const stats =
    data?.stats ||
    data;

  results.innerHTML = `
    <div class="stats-block">

      <div class="stats-block-title">
        Research Result
      </div>

      <div style="
        padding: 10px 0;
        line-height: 1.7;
      ">

        <strong>
          ${escapeHTML(query)}
        </strong>

        <pre style="
          white-space: pre-wrap;
          margin-top: 12px;
          color: #667085;
          font-family: inherit;
          font-size: 13px;
        ">${escapeHTML(
          JSON.stringify(
            stats,
            null,
            2
          )
        )}</pre>

      </div>

    </div>
  `;
}

document.addEventListener(
  "click",
  event => {
    const suggestion =
      event.target.closest(
        "[data-research]"
      );

    if (suggestion) {
      runResearch(
        suggestion.dataset.research
      );

      return;
    }

    if (
      event.target.id ===
      "research-button"
    ) {
      runResearch(
        document.getElementById(
          "research-input"
        )?.value
      );
    }
  }
);

document
  .getElementById(
    "research-input"
  )
  ?.addEventListener(
    "keydown",
    event => {
      if (
        event.key ===
        "Enter"
      ) {
        runResearch(
          event.target.value
        );
      }
    }
  );

// ============================================================
// REFRESH BUTTONS
// ============================================================

document
  .getElementById(
    "refresh-home"
  )
  ?.addEventListener(
    "click",
    async () => {
      await loadStandings();
      await loadGames();
    }
  );

document
  .getElementById(
    "refresh-games"
  )
  ?.addEventListener(
    "click",
    loadGames
  );

document
  .getElementById(
    "refresh-roster"
  )
  ?.addEventListener(
    "click",
    loadRoster
  );

document
  .getElementById(
    "refresh-stats"
  )
  ?.addEventListener(
    "click",
    loadStats
  );

document
  .getElementById(
    "refresh-transactions"
  )
  ?.addEventListener(
    "click",
    loadTransactions
  );

// ============================================================
// AUTOMATIC EASTERN-TIME DAILY REFRESH
// ============================================================

let lastEasternDate =
  getEasternDate();

setInterval(
  () => {
    const currentEasternDate =
      getEasternDate();

    if (
      currentEasternDate !==
      lastEasternDate
    ) {
      lastEasternDate =
        currentEasternDate;

      /*
        The date has changed in New York.
        Refresh schedule and standings.
      */

      loadStandings();
      loadGames();
      loadStats();
    }
  },
  60 * 1000
);

// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {
  console.log(
    "Starting Mets HQ..."
  );

  /*
    Load the most important dashboard
    data first.
  */

  await Promise.allSettled([
    loadStandings(),
    loadGames()
  ]);

  /*
    Stats aren't necessary for the first
    paint, but load them after dashboard.
  */

  await loadStats();

  console.log(
    "Mets HQ ready."
  );
}

initialize();
