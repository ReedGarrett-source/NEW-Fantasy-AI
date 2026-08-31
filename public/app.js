const CURRENT_SEASON = 2026;
const METS_ID = 121;

let allStats = [];
let currentStatMode = "hitting";

let currentSort = {
  key: null,
  direction: "desc"
};

let allRosterPlayers = [];
let allProspects = [];

let currentGameFilter = "all";

let researchHistory = [];

// ============================================================
// API
// ============================================================

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The server returned invalid JSON."
    );
  }

  if (
    !response.ok ||
    data?.success === false
  ) {
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

  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
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
      p =>
        p.type === "year"
    )?.value;

  const month =
    parts.find(
      p =>
        p.type === "month"
    )?.value;

  const day =
    parts.find(
      p =>
        p.type === "day"
    )?.value;

  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
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
      weekday: "short",
      month: "short",
      day: "numeric"
    }
  );
}

function formatFullDate(
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
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}

function getTeamId(team) {
  if (!team) {
    return null;
  }

  if (
    typeof team ===
    "number"
  ) {
    return team;
  }

  if (
    typeof team ===
    "string"
  ) {
    const numeric =
      Number(team);

    return Number.isFinite(
      numeric
    )
      ? numeric
      : null;
  }

  const possibleIds = [
    team.id,
    team.teamId,
    team.team?.id,
    team.team?.teamId
  ];

  for (
    const value of possibleIds
  ) {
    const numeric =
      Number(value);

    if (
      Number.isFinite(
        numeric
      ) &&
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

  if (
    typeof team ===
    "string"
  ) {
    return team;
  }

  if (
    typeof team ===
    "number"
  ) {
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

  for (
    const candidate of
    candidates
  ) {
    if (
      typeof candidate ===
        "string" &&
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

  for (
    const value of candidates
  ) {
    const numeric =
      Number(value);

    if (
      Number.isFinite(
        numeric
      ) &&
      numeric > 0
    ) {
      return String(
        numeric
      );
    }
  }

  return "";
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

  return [
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
    position.includes("catcher");
}

function isOutfield(player) {
  const position = (
    player?.position?.abbreviation ||
    player?.position?.name ||
    player?.person?.primaryPosition?.abbreviation ||
    ""
  ).toLowerCase();

  return [
    "lf",
    "cf",
    "rf",
    "of"
  ].includes(position) ||
    position.includes("outfield");
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

  if (
    decimals === 0
  ) {
    return String(
      Math.round(
        Number(value)
      )
    );
  }

  return Number(value)
    .toFixed(decimals)
    .replace(/^0\./, ".");
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
    .forEach(section => {
      section.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      ".nav-button"
    )
    .forEach(button => {
      button.classList.remove(
        "active"
      );
    });

  document
    .querySelectorAll(
      `[data-section="${sectionName}"]`
    )
    .forEach(button => {
      if (
        button.classList.contains(
          "nav-button"
        )
      ) {
        button.classList.add(
          "active"
        );
      }
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

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (
    sectionName ===
    "home"
  ) {
    loadStandings();
    loadGames();
  }

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
    "prospects"
  ) {
    loadProspects();
  }

  if (
    sectionName ===
    "transactions"
  ) {
    loadTransactions();
  }
}

document.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        "[data-section]"
      );

    if (!button) {
      return;
    }

    const section =
      button.dataset.section;

    if (section) {
      showSection(
        section
      );
    }
  }
);

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
      data?.mets ||
      data?.team ||
      data?.standings?.find(
        team =>
          Number(
            team?.team?.id
          ) === METS_ID ||
          Number(
            team?.id
          ) === METS_ID
      );

    if (!mets) {
      return;
    }

    const wins =
      numberValue(
        mets.wins ??
        mets.record?.wins ??
        mets.team?.record?.wins
      );

    const losses =
      numberValue(
        mets.losses ??
        mets.record?.losses ??
        mets.team?.record?.losses
      );

    if (
      wins !== null &&
      losses !== null
    ) {
      const record =
        document.getElementById(
          "record"
        );

      const recordSub =
        document.getElementById(
          "record-sub"
        );

      if (record) {
        record.textContent =
          `${wins}-${losses}`;
      }

      if (recordSub) {
        const pct =
          wins + losses > 0
            ? (
                wins /
                (wins + losses)
              ).toFixed(3)
            : "—";

        recordSub.textContent =
          `Win % ${pct}`;
      }
    }

    const divisionRank =
      mets.divisionRank ??
      mets.rank ??
      mets.division?.rank;

    const divisionElement =
      document.getElementById(
        "division-rank"
      );

    if (divisionElement) {
      divisionElement.textContent =
        divisionRank
          ? `#${divisionRank}`
          : "—";
    }

    const gamesBack =
      mets.gamesBack ??
      mets.divisionGamesBack ??
      mets.gamesBackInDivision;

    const gamesBackElement =
      document.getElementById(
        "games-back"
      );

    if (gamesBackElement) {
      gamesBackElement.textContent =
        gamesBack === "0" ||
        gamesBack === "0.0" ||
        gamesBack === 0 ||
        gamesBack === 0.0
          ? "1st place"
          : `${gamesBack ?? "—"} GB`;
    }

    let lastTenText =
      "—";

    const lastTen =
      mets.lastTen ||
      mets.last10 ||
      mets.record?.lastTen ||
      mets.record?.last10;

    if (
      typeof lastTen ===
      "string"
    ) {
      lastTenText =
        lastTen.trim() ||
        "—";
    } else if (
      lastTen
    ) {
      const w =
        numberValue(
          lastTen.wins ??
          lastTen.w
        );

      const l =
        numberValue(
          lastTen.losses ??
          lastTen.l
        );

      if (
        w !== null &&
        l !== null
      ) {
        lastTenText =
          `${w}-${l}`;
      }
    }

    if (
      lastTenText ===
        "—" ||
      lastTenText ===
        "0-0"
    ) {
      lastTenText =
        await calculateLastTen();
    }

    const lastTenElement =
      document.getElementById(
        "last-ten"
      );

    if (lastTenElement) {
      lastTenElement.textContent =
        lastTenText;
    }

    const streak =
      mets.streak?.streakCode ||
      mets.streakCode ||
      mets.streak;

    const streakElement =
      document.getElementById(
        "streak"
      );

    if (streakElement) {
      streakElement.textContent =
        typeof streak ===
        "string"
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

async function calculateLastTen() {
  try {
    const today =
      getEasternDate();

    const start =
      new Date(
        `${today}T12:00:00`
      );

    start.setDate(
      start.getDate() - 30
    );

    const startDate =
      start
        .toISOString()
        .split("T")[0];

    const data =
      await api(
        `/api/mets/games?startDate=${startDate}&endDate=${today}`
      );

    const games =
      Array.isArray(
        data?.games
      )
        ? data.games
        : [];

    const completed =
      games
        .filter(
          game =>
            game?.status?.abstractGameState ===
              "Final" ||
            game?.status?.abstractGameState ===
              "Completed"
        )
        .sort(
          (a, b) =>
            new Date(
              b.gameDate
            ) -
            new Date(
              a.gameDate
            )
        )
        .slice(0, 10);

    let wins = 0;
    let losses = 0;

    for (
      const game of
      completed
    ) {
      const info =
        getGameInfo(
          game
        );

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
        continue;
      }

      if (
        metsScore >
        opponentScore
      ) {
        wins++;
      } else if (
        metsScore <
        opponentScore
      ) {
        losses++;
      }
    }

    return `${wins}-${losses}`;
  } catch {
    return "—";
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
    getTeamId(
      home?.team ||
      home
    );

  const awayId =
    getTeamId(
      away?.team ||
      away
    );

  let metsIsHome =
    null;

  if (
    homeId === METS_ID
  ) {
    metsIsHome = true;
  }

  if (
    awayId === METS_ID
  ) {
    metsIsHome = false;
  }

  const homeName =
    getTeamName(
      home?.team ||
      home
    ).toLowerCase();

  const awayName =
    getTeamName(
      away?.team ||
      away
    ).toLowerCase();

  if (
    metsIsHome === null
  ) {
    if (
      homeName.includes(
        "mets"
      )
    ) {
      metsIsHome = true;
    }

    if (
      awayName.includes(
        "mets"
      )
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
  } =
    getGameInfo(
      game
    );

  const opponentName =
    getTeamName(
      opponent?.team ||
      opponent
    );

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

  let resultClass =
    "";

  if (
    isFinal &&
    metsScore !== null &&
    opponentScore !== null
  ) {
    if (
      metsScore >
      opponentScore
    ) {
      resultClass =
        "win";
    }

    if (
      metsScore <
      opponentScore
    ) {
      resultClass =
        "loss";
    }
  }

  let scoreText =
    "—";

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

  if (
    isFinal
  ) {
    status = "Final";
  }

  const location =
    metsIsHome === true
      ? "vs."
      : metsIsHome === false
      ? "@"
      : "vs.";

  const probablePitcher =
    metsIsHome === true
      ? game?.teams?.home?.probablePitcher?.fullName
      : game?.teams?.away?.probablePitcher?.fullName;

  return `
    <div
      class="game"
      data-game-state="${
        isFinal
          ? "completed"
          : "upcoming"
      }"
    >
      <div class="game-date">
        ${escapeHTML(
          formatDate(
            game?.gameDate
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

      ${
        probablePitcher
          ? `
            <div class="game-pitcher">
              Probable: ${escapeHTML(
                probablePitcher
              )}
            </div>
          `
          : ""
      }
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
        `${today}T12:00:00`
      );

    start.setDate(
      start.getDate() - 21
    );

    const end =
      new Date(
        `${today}T12:00:00`
      );

    end.setDate(
      end.getDate() + 30
    );

    const startDate =
      start
        .toISOString()
        .split("T")[0];

    const endDate =
      end
        .toISOString()
        .split("T")[0];

    const data =
      await api(
        `/api/mets/games?startDate=${startDate}&endDate=${endDate}`
      );

    let games =
      Array.isArray(
        data?.games
      )
        ? data.games
        : [];

    games.sort(
      (a, b) =>
        new Date(
          a.gameDate
        ) -
        new Date(
          b.gameDate
        )
    );

    if (
      !games.length
    ) {
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

    const todayStart =
      new Date(
        `${today}T00:00:00`
      );

    const upcoming =
      games.filter(
        game =>
          new Date(
            game.gameDate
          ) >=
          todayStart
      );

    const recent =
      games
        .filter(
          game =>
            new Date(
              game.gameDate
            ) <
            todayStart
        )
        .sort(
          (a, b) =>
            new Date(
              b.gameDate
            ) -
            new Date(
              a.gameDate
            )
        );

    const homeGames = [
      ...upcoming.slice(
        0,
        5
      )
    ];

    if (
      homeGames.length <
      5
    ) {
      homeGames.push(
        ...recent.slice(
          0,
          5 -
            homeGames.length
        )
      );
    }

    homeGames.sort(
      (a, b) =>
        new Date(
          a.gameDate
        ) -
        new Date(
          b.gameDate
        )
    );

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
        homeGames
          .map(
            renderGame
          )
          .join("");
    }

    applyGameFilter();
  } catch (error) {
    console.error(
      "Games:",
      error
    );

    const message =
      `<div class="error-box">
        Unable to load Mets games right now.
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
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
// GAME FILTERS
// ============================================================

function applyGameFilter() {
  document
    .querySelectorAll(
      "#games-list .game"
    )
    .forEach(game => {
      const state =
        game.dataset.gameState;

      let visible =
        true;

      if (
        currentGameFilter ===
        "completed"
      ) {
        visible =
          state ===
          "completed";
      }

      if (
        currentGameFilter ===
        "upcoming"
      ) {
        visible =
          state ===
          "upcoming";
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

    button.classList.add(
      "active"
    );

    applyGameFilter();
  }
);

// ============================================================
// ROSTER
// ============================================================

function rosterCategory(
  player
) {
  if (
    isPitcher(player)
  ) {
    return "pitchers";
  }

  if (
    isInfield(player)
  ) {
    return "infield";
  }

  if (
    isOutfield(player)
  ) {
    return "outfield";
  }

  return "infield";
}

function renderRosterPlayer(
  player
) {
  const person =
    player?.person ||
    player;

  const playerId =
    getPlayerId(
      player
    );

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
      data-player-id="${escapeHTML(
        playerId
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
              getPlayerName(
                player
              )
            )}
          </div>

          <div class="player-position">
            ${escapeHTML(
              position
            )}
          </div>
        </div>
      </div>

      <div class="player-card-arrow">
        →
      </div>
    </div>
  `;
}

function renderRosterSection(
  title,
  players
) {
  if (
    !players.length
  ) {
    return "";
  }

  return `
    <div class="roster-group">
      <h2 class="roster-group-title">
        ${escapeHTML(
          title
        )}
      </h2>

      <div class="roster-grid-section">
        ${players
          .map(
            renderRosterPlayer
          )
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
      Array.isArray(
        data?.roster
      )
        ? data.roster
        : [];

    const seen =
      new Set();

    roster =
      roster.filter(
        player => {
          const id =
            getPlayerId(
              player
            );

          const name =
            getPlayerName(
              player
            );

          const key =
            id ||
            name;

          if (
            seen.has(
              key
            )
          ) {
            return false;
          }

          seen.add(
            key
          );

          return true;
        }
      );

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
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
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

        return getPlayerName(
          player
        )
          .toLowerCase()
          .includes(
            search
          );
      }
    );

  const pitchers =
    roster.filter(
      p =>
        rosterCategory(
          p
        ) ===
        "pitchers"
    );

  const infield =
    roster.filter(
      p =>
        rosterCategory(
          p
        ) ===
        "infield"
    );

  const outfield =
    roster.filter(
      p =>
        rosterCategory(
          p
        ) ===
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

  if (
    !container.innerHTML.trim()
  ) {
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

    if (
      event.target.id ===
      "stats-search"
    ) {
      renderStats();
    }

    if (
      event.target.id ===
      "prospect-search"
    ) {
      renderProspects();
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
      openPlayer(
        id
      );
    }
  }
);

// ============================================================
// STATS
// ============================================================

function extractStatArray(
  data
) {
  if (
    Array.isArray(
      data?.stats
    )
  ) {
    return data.stats;
  }

  if (
    Array.isArray(
      data?.splits
    )
  ) {
    return data.splits;
  }

  if (
    Array.isArray(
      data
    )
  ) {
    return data;
  }

  return [];
}

function getStatObject(
  split
) {
  return (
    split?.stat ||
    split?.stats ||
    split ||
    {}
  );
}

function getStatPlayer(
  split
) {
  return (
    split?.player ||
    split?.person ||
    split?.playerInfo ||
    {}
  );
}

function prepareStatRecord(
  split
) {
  const stat =
    getStatObject(
      split
    );

  const player =
    getStatPlayer(
      split
    );

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
      split?.active === true ||
      split?.isActive === true,

    G:
      numberValue(
        stat.gamesPlayed ??
        stat.gamesPitched ??
        stat.games
      ),

    AB:
      numberValue(
        stat.atBats ??
        stat.AB
      ),

    H:
      numberValue(
        stat.hits ??
        stat.H
      ),

    HR:
      numberValue(
        stat.homeRuns ??
        stat.HR
      ),

    RBI:
      numberValue(
        stat.rbi ??
        stat.RBI
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
      stat.inningsPitched ??
      stat.IP ??
      null,

    W:
      numberValue(
        stat.wins ??
        stat.W
      ),

    L:
      numberValue(
        stat.losses ??
        stat.L
      ),

    ERA:
      numberValue(
        stat.era ??
        stat.ERA
      ),

    WHIP:
      numberValue(
        stat.whip ??
        stat.WHIP
      ),

    SO:
      numberValue(
        stat.strikeOuts ??
        stat.strikeouts ??
        stat.SO
      ),

    BB:
      numberValue(
        stat.baseOnBalls ??
        stat.walks ??
        stat.BB
      )
  };
}

function renderStatsTable(
  records,
  type,
  title
) {
  if (
    !records.length
  ) {
    return `
      <div class="stats-block">
        <div class="stats-block-title">
          ${escapeHTML(
            title
          )}
        </div>

        <div class="loading">
          No statistics available.
        </div>
      </div>
    `;
  }

  const isHitting =
    type ===
    "hitting";

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
      .map(
        record => `
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
                  ? `
                    <span class="active-badge">
                      ACTIVE
                    </span>
                  `
                  : `
                    <span class="former-badge">
                      FORMER
                    </span>
                  `
              }
            </td>

            ${columns
              .slice(1)
              .map(
                ([key]) => {
                  let value =
                    record[
                      key
                    ];

                  if (
                    [
                      "AVG",
                      "OBP",
                      "SLG",
                      "OPS"
                    ].includes(
                      key
                    )
                  ) {
                    value =
                      formatStat(
                        value,
                        3
                      );
                  } else if (
                    key ===
                      "ERA" ||
                    key ===
                      "WHIP"
                  ) {
                    value =
                      formatStat(
                        value,
                        2
                      );
                  } else {
                    value =
                      formatStat(
                        value,
                        0
                      );
                  }

                  return `
                    <td>
                      ${escapeHTML(
                        value
                      )}
                    </td>
                  `;
                }
              )
              .join("")}
          </tr>
        `
      )
      .join("");

  return `
    <div class="stats-block">
      <div class="stats-block-title">
        ${escapeHTML(
          title
        )}
      </div>

      <div class="table-scroll">
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
                        ? currentSort.direction ===
                          "asc"
                          ? "↑"
                          : "↓"
                        : "";

                    return `
                      <th
                        data-sort-key="${escapeHTML(
                          key
                        )}"
                      >
                        ${escapeHTML(
                          label
                        )}

                        ${
                          arrow
                            ? `
                              <span class="sort-arrow">
                                ${arrow}
                              </span>
                            `
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
    allStats.filter(
      record => {
        if (!search) {
          return true;
        }

        return record.name
          .toLowerCase()
          .includes(
            search
          );
      }
    );

  if (
    currentSort.key
  ) {
    const key =
      currentSort.key;

    records.sort(
      (a, b) => {
        if (
          key ===
          "name"
        ) {
          return currentSort.direction ===
            "asc"
            ? a.name.localeCompare(
                b.name
              )
            : b.name.localeCompare(
                a.name
              );
        }

        const av =
          a[key] === null ||
          a[key] === undefined
            ? -Infinity
            : Number(
                a[key]
              );

        const bv =
          b[key] === null ||
          b[key] === undefined
            ? -Infinity
            : Number(
                b[key]
              );

        return currentSort.direction ===
          "asc"
          ? av - bv
          : bv - av;
      }
    );
  } else {
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
      r =>
        r.active
    );

  const former =
    records.filter(
      r =>
        !r.active
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
        `/api/mets/stats?season=${CURRENT_SEASON}&group=${currentStatMode}`
      );

    const splits =
      extractStatArray(
        data
      );

    allStats =
      splits
        .map(
          prepareStatRecord
        )
        .filter(
          record =>
            record.name !==
            "Unknown Player"
        );

    const activeIds =
      new Set(
        (
          data?.activePlayerIds ||
          []
        ).map(
          String
        )
      );

    allStats =
      allStats.map(
        record => ({
          ...record,

          active:
            activeIds.has(
              String(
                record.id
              )
            )
        })
      );

    if (
      !allStats.length
    ) {
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
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
      </div>`;
  }
}

// ============================================================
// STAT MODE / SORT
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
        .forEach(
          button =>
            button.classList.remove(
              "active"
            )
        );

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
        openPlayer(
          id
        );
      }
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

    const statsData =
      await api(
        `/api/player/${encodeURIComponent(
          playerId
        )}/stats?season=${CURRENT_SEASON}&group=hitting`
      );

    const player =
      playerData?.player ||
      playerData;

    const split =
      statsData?.stats?.[0] ||
      {};

    const stat =
      split?.stat ||
      {};

    const headshot =
      player?.id
        ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_300,q_auto:good,f_auto/v1/people/${player.id}/headshot/silo/current`
        : "";

    details.innerHTML = `
      <div class="player-profile">

        ${
          headshot
            ? `
              <img
                class="player-headshot"
                src="${headshot}"
                alt=""
                onerror="this.style.display='none'"
              >
            `
            : ""
        }

        <div>
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
        </div>
      </div>

      <div class="player-stat-grid">

        ${playerStatCard(
          "AVG",
          stat.avg
        )}

        ${playerStatCard(
          "HR",
          stat.homeRuns
        )}

        ${playerStatCard(
          "RBI",
          stat.rbi
        )}

        ${playerStatCard(
          "OPS",
          stat.ops
        )}

        ${playerStatCard(
          "OBP",
          stat.obp
        )}

        ${playerStatCard(
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
      `<div class="error-box">
        Unable to load player information.
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
      </div>`;
  }
}

function playerStatCard(
  label,
  value
) {
  return `
    <div class="player-stat">
      <div class="player-stat-label">
        ${escapeHTML(
          label
        )}
      </div>

      <div class="player-stat-value">
        ${escapeHTML(
          value ??
          "—"
        )}
      </div>
    </div>
  `;
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

    if (
      !transactions.length
    ) {
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
          }
        )
        .join("");
  } catch (error) {
    console.error(
      "Transactions:",
      error
    );

    container.innerHTML =
      `<div class="error-box">
        Unable to load Mets transactions.
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
      </div>`;
  }
}

// ============================================================
// PROSPECT CENTER
// ============================================================

async function loadProspects() {
  const container =
    document.getElementById(
      "prospect-grid"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    `<div class="loading">
      Loading Mets minor-league players...
    </div>`;

  try {
    const data =
      await api(
        "/api/mets/prospects"
      );

    allProspects =
      Array.isArray(
        data?.prospects
      )
        ? data.prospects
        : [];

    renderProspects();

    updateProspectTeamFilter(
      data?.teams ||
      []
    );
  } catch (error) {
    console.error(
      "Prospects:",
      error
    );

    container.innerHTML =
      `<div class="error-box">
        Unable to load the Mets prospect database.
        <br>
        <small>${escapeHTML(
          error.message
        )}</small>
      </div>`;
  }
}

function updateProspectTeamFilter(
  teams
) {
  const select =
    document.getElementById(
      "prospect-level"
    );

  if (!select) {
    return;
  }

  const current =
    select.value;

  const values =
    [
      ...new Map(
        teams.map(
          team => [
            String(
              team.id
            ),
            team.name
          ]
        )
      )
    ];

  select.innerHTML =
    `
      <option value="all">
        All Levels
      </option>
    ` +
    values
      .map(
        ([id, name]) =>
          `
            <option value="${escapeHTML(
              id
            )}">
              ${escapeHTML(
                name
              )}
            </option>
          `
      )
      .join("");

  if (
    [
      "all",
      ...values.map(
        ([id]) => id
      )
    ].includes(
      current
    )
  ) {
    select.value =
      current;
  }
}

function renderProspects() {
  const container =
    document.getElementById(
      "prospect-grid"
    );

  if (!container) {
    return;
  }

  const search =
    (
      document.getElementById(
        "prospect-search"
      )?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const level =
    document.getElementById(
      "prospect-level"
    )?.value ||
    "all";

  const position =
    document.getElementById(
      "prospect-position"
    )?.value ||
    "all";

  const filtered =
    allProspects.filter(
      player => {
        const matchesSearch =
          !search ||
          player.name
            .toLowerCase()
            .includes(
              search
            );

        const matchesLevel =
          level ===
            "all" ||
          String(
            player.teamId
          ) ===
            String(level);

        const playerPosition =
          String(
            player.position ||
            ""
          ).toLowerCase();

        const matchesPosition =
          position ===
            "all" ||
          (
            position ===
              "pitcher"
              ? playerPosition ===
                  "p" ||
                playerPosition.includes(
                  "pitch"
                )
              : position ===
                "catcher"
              ? playerPosition ===
                  "c" ||
                playerPosition.includes(
                  "catch"
                )
              : position ===
                "infield"
              ? [
                  "1b",
                  "2b",
                  "3b",
                  "ss"
                ].includes(
                  playerPosition
                )
              : position ===
                "outfield"
              ? [
                  "lf",
                  "cf",
                  "rf",
                  "of"
                ].includes(
                  playerPosition
                )
              : true
          );

        return (
          matchesSearch &&
          matchesLevel &&
          matchesPosition
        );
      }
    );

  if (
    !filtered.length
  ) {
    container.innerHTML =
      `<div class="loading">
        No prospects match your filters.
      </div>`;

    return;
  }

  container.innerHTML =
    filtered
      .map(
        player => `
          <button
            class="prospect-card"
            data-prospect-id="${escapeHTML(
              player.id
            )}"
          >
            <div class="prospect-card-top">
              <div class="prospect-avatar">
                ${escapeHTML(
                  player.name
                    .charAt(0)
                    .toUpperCase()
                )}
              </div>

              <div>
                <h3>
                  ${escapeHTML(
                    player.name
                  )}
                </h3>

                <span>
                  ${escapeHTML(
                    player.position
                  )}
                </span>
              </div>
            </div>

            <div class="prospect-meta">
              <span>
                ${escapeHTML(
                  player.teamName
                )}
              </span>

              <span>
                #${escapeHTML(
                  player.jerseyNumber
                )}
              </span>
            </div>

            <div class="prospect-arrow">
              View Player →
            </div>
          </button>
        `
      )
      .join("");
}

document.addEventListener(
  "change",
  event => {
    if (
      event.target.id ===
        "prospect-level" ||
      event.target.id ===
        "prospect-position"
    ) {
      renderProspects();
    }
  }
);

document.addEventListener(
  "click",
  event => {
    const card =
      event.target.closest(
        ".prospect-card"
      );

    if (!card) {
      return;
    }

    const id =
      card.dataset.prospectId;

    if (id) {
      openProspect(
        id
      );
    }
  }
);

async function openProspect(
  id
) {
  try {
    await openPlayer(
      id
    );
  } catch {
    // openPlayer handles errors.
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

  if (
    !allStats.length
  ) {
    return;
  }

  /*
    IMPORTANT:
    Only use hitting data when determining
    a home-run stat.

    This prevents the old bug where a pitcher
    could accidentally become the "HR leader."
  */

  if (
    currentStatMode !==
    "hitting"
  ) {
    element.innerHTML = `
      <div class="stat-big">
        ⚾
      </div>

      <h3>
        Mets pitching spotlight
      </h3>

      <p>
        Switch to hitting to see the
        verified home-run leader.
      </p>
    `;

    return;
  }

  const hitters =
    allStats.filter(
      player =>
        player.HR !== null &&
        player.active
    );

  if (
    !hitters.length
  ) {
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

    <div class="stat-feature-number">
      ${escapeHTML(
        leader.HR
      )}
    </div>

    <p>
      Home runs in the
      ${CURRENT_SEASON}
      season.
    </p>
  `;
}

// ============================================================
// RESEARCH LAB
// ============================================================

function setResearchLoading(
  query
) {
  const results =
    document.getElementById(
      "research-results"
    );

  if (!results) {
    return;
  }

  results.innerHTML = `
    <div class="research-loading">
      <div class="research-spinner">
        🧠
      </div>

      <h3>
        Researching...
      </h3>

      <p>
        Looking through MLB data for
        <strong>
          ${escapeHTML(
            query
          )}
        </strong>
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

  const result =
    data?.result ||
    data;

  if (
    result?.type ===
    "player-stat"
  ) {
    renderPlayerResearch(
      query,
      result
    );

    return;
  }

  if (
    result?.type ===
    "comparison"
  ) {
    renderComparisonResearch(
      query,
      result
    );

    return;
  }

  if (
    result?.type ===
    "leaderboard"
  ) {
    renderLeaderboardResearch(
      query,
      result
    );

    return;
  }

  if (
    result?.type ===
    "search"
  ) {
    renderSearchResearch(
      query,
      result
    );

    return;
  }

  results.innerHTML = `
    <div class="research-empty">
      <div>🔎</div>

      <h3>
        Research result
      </h3>

      <pre class="research-json">${escapeHTML(
        JSON.stringify(
          result,
          null,
          2
        )
      )}</pre>
    </div>
  `;
}

function renderPlayerResearch(
  query,
  result
) {
  const results =
    document.getElementById(
      "research-results"
    );

  const player =
    result.player;

  const stat =
    result.statLabel;

  results.innerHTML = `
    <div class="research-answer">

      <div class="research-answer-header">
        <div>
          <span class="eyebrow">
            RESEARCH RESULT
          </span>

          <h2>
            ${escapeHTML(
              player?.name ||
              "Player"
            )}
          </h2>

          <p>
            ${escapeHTML(
              result.period ||
              ""
            )}
          </p>
        </div>

        <div class="research-big-number">
          ${
            result.formattedValue ??
            "—"
          }
        </div>
      </div>

      ${
        stat
          ? `
            <div class="research-stat-label">
              ${escapeHTML(
                stat
              )}
            </div>
          `
          : ""
      }

      <div class="research-summary">
        ${
          stat
            ? `
              <strong>
                ${escapeHTML(
                  player?.name ||
                  ""
                )}
              </strong>
              recorded
              <strong>
                ${escapeHTML(
                  result.formattedValue
                )}
              </strong>
              in
              <strong>
                ${escapeHTML(
                  stat
                )}
              </strong>
              over
              <strong>
                ${escapeHTML(
                  result.period
                )}
              </strong>.
            `
            : `
              ${escapeHTML(
                player?.name ||
                "Player"
              )}
              was found in the MLB database.
            `
        }
      </div>

      <div class="research-total-grid">
        ${renderResearchTotals(
          result.totals,
          result.group
        )}
      </div>

      <div class="research-footnote">
        Based on MLB game-log data for
        ${CURRENT_SEASON}.
        Games used:
        ${escapeHTML(
          result.gamesUsed
        )}.
      </div>
    </div>
  `;
}

function renderResearchTotals(
  totals,
  group
) {
  if (!totals) {
    return "";
  }

  const keys =
    group ===
    "pitching"
      ? [
          ["IP", "IP"],
          ["W", "W"],
          ["L", "L"],
          ["ERA", "ERA"],
          ["WHIP", "WHIP"],
          ["SO", "SO"],
          ["BB", "BB"]
        ]
      : [
          ["G", "G"],
          ["AB", "AB"],
          ["H", "H"],
          ["HR", "HR"],
          ["RBI", "RBI"],
          ["AVG", "AVG"],
          ["OBP", "OBP"],
          ["SLG", "SLG"],
          ["OPS", "OPS"]
        ];

  return keys
    .map(
      ([key, label]) => `
        <div class="research-total">
          <span>
            ${label}
          </span>

          <strong>
            ${escapeHTML(
              formatResearchValue(
                totals[key],
                key
              )
            )}
          </strong>
        </div>
      `
    )
    .join("");
}

function formatResearchValue(
  value,
  key
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "—";
  }

  if (
    [
      "AVG",
      "OBP",
      "SLG",
      "OPS"
    ].includes(key)
  ) {
    return Number(
      value
    )
      .toFixed(3)
      .replace(
        /^0/,
        ""
      );
  }

  if (
    [
      "ERA",
      "WHIP"
    ].includes(key)
  ) {
    return Number(
      value
    ).toFixed(2);
  }

  return String(
    value
  );
}

function renderComparisonResearch(
  query,
  result
) {
  const results =
    document.getElementById(
      "research-results"
    );

  const rows =
    result.results || [];

  results.innerHTML = `
    <div class="research-answer">

      <span class="eyebrow">
        PLAYER COMPARISON
      </span>

      <h2>
        ${escapeHTML(
          result.statLabel
        )} comparison
      </h2>

      <div class="comparison-list">
        ${rows
          .map(
            (row, index) => `
              <div class="comparison-row">

                <div class="comparison-rank">
                  ${index + 1}
                </div>

                <div class="comparison-player">
                  ${escapeHTML(
                    row.player
                  )}
                </div>

                <div class="comparison-value">
                  ${escapeHTML(
                    row.formattedValue
                  )}
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderLeaderboardResearch(
  query,
  result
) {
  const results =
    document.getElementById(
      "research-results"
    );

  results.innerHTML = `
    <div class="research-answer">

      <span class="eyebrow">
        METS LEADERBOARD
      </span>

      <h2>
        ${escapeHTML(
          result.statLabel
        )} leaders
      </h2>

      <div class="leaderboard-list">
        ${result.players
          .map(
            (player, index) => `
              <button
                class="leaderboard-row"
                data-player-id="${escapeHTML(
                  player.id
                )}"
              >
                <span class="leaderboard-rank">
                  ${index + 1}
                </span>

                <span class="leaderboard-name">
                  ${escapeHTML(
                    player.name
                  )}
                </span>

                <strong>
                  ${escapeHTML(
                    player.formattedValue
                  )}
                </strong>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderSearchResearch(
  query,
  result
) {
  const results =
    document.getElementById(
      "research-results"
    );

  results.innerHTML = `
    <div class="research-answer">

      <span class="eyebrow">
        PLAYER SEARCH
      </span>

      <h2>
        Search results
      </h2>

      <p>
        ${escapeHTML(
          result.message ||
          ""
        )}
      </p>

      <div class="leaderboard-list">
        ${(result.players || [])
          .map(
            player => `
              <button
                class="leaderboard-row"
                data-player-id="${escapeHTML(
                  player.id
                )}"
              >
                <span class="leaderboard-name">
                  ${escapeHTML(
                    player.name
                  )}
                </span>

                <span>
                  ${escapeHTML(
                    player.position
                  )}
                </span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

async function runResearch(
  query
) {
  const input =
    document.getElementById(
      "research-input"
    );

  query =
    String(
      query || ""
    ).trim();

  if (!query) {
    return;
  }

  if (input) {
    input.value =
      query;
  }

  setResearchLoading(
    query
  );

  try {
    const encoded =
      encodeURIComponent(
        query
      );

    const data =
      await api(
        `/api/mlb/query?question=${encoded}`
      );

    researchHistory.unshift({
      query,
      timestamp:
        new Date()
          .toISOString()
    });

    researchHistory =
      researchHistory.slice(
        0,
        10
      );

    renderResearchResult(
      query,
      data
    );
  } catch (error) {
    console.error(
      "Research:",
      error
    );

    const results =
      document.getElementById(
        "research-results"
      );

    if (results) {
      results.innerHTML = `
        <div class="error-box">
          <strong>
            Research failed.
          </strong>

          <br>

          ${escapeHTML(
            error.message
          )}

          <br><br>

          Try a question such as:
          <strong>
            Francisco Lindor OPS in his last 10 games
          </strong>
        </div>
      `;
    }
  }
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

      return;
    }

    const playerButton =
      event.target.closest(
        "[data-player-id]"
      );

    if (
      playerButton &&
      (
        playerButton.classList.contains(
          "leaderboard-row"
        )
      )
    ) {
      openPlayer(
        playerButton.dataset.playerId
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
// REFRESH
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

document
  .getElementById(
    "refresh-prospects"
  )
  ?.addEventListener(
    "click",
    loadProspects
  );

// ============================================================
// DAILY REFRESH
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

  await Promise.allSettled([
    loadStandings(),
    loadGames()
  ]);

  loadStats();

  console.log(
    "Mets HQ ready."
  );
}

initialize();
