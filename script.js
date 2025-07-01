// Constants
const CONFIG = {
  MAX_COMPETITORS: 50,
  MAX_ATTEMPTS: 50,
  DECIMAL_PRECISION: 1,
  TOP_SCORE: 25,
  ZONE_SCORE: 10,
  ATTEMPT_DEDUCTION: 0.1,
  DEBOUNCE_DELAY: 100,
  MESSAGE_DURATION: 5000,
};

// State
let state = {
  competitors: [],
  competitorId: 0,
  isUpdating: false,
};

// Utility functions
const utils = {
  sanitizeInput(input) {
    return input.trim().replace(/[<>'"&]/g, "");
  },

  showMessage(message, type = "error") {
    const messageDiv = document.getElementById(`${type}Message`);
    if (messageDiv) {
      messageDiv.textContent = message;
      messageDiv.style.display = "block";
      messageDiv.classList.add("fade-in");
      setTimeout(() => {
        messageDiv.style.display = "none";
        messageDiv.classList.remove("fade-in");
      }, CONFIG.MESSAGE_DURATION);
    }
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  announceToScreenReader(message) {
    const announcement = document.createElement("div");
    announcement.setAttribute("aria-live", "polite");
    announcement.setAttribute("aria-atomic", "true");
    announcement.style.position = "absolute";
    announcement.style.left = "-9999px";
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  },

  getPositionSuffix(position) {
    const suffixes = { 1: "st", 2: "nd", 3: "rd" };
    return suffixes[position] || "th";
  },
};

// Validation
const validation = {
  competitorName(name) {
    if (!name || name.length === 0) {
      return "Please enter a competitor name";
    }
    if (name.length > 50) {
      return "Name must be 50 characters or less";
    }
    if (
      state.competitors.some(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return "A competitor with this name already exists";
    }
    return null;
  },

  attempts(value) {
    const attempts = parseInt(value) || 1;
    if (attempts < 1 || attempts > CONFIG.MAX_ATTEMPTS) {
      return `Attempts must be between 1 and ${CONFIG.MAX_ATTEMPTS}`;
    }
    return null;
  },
};

// Boulder management
const boulderManager = {
  createBoulder() {
    return {
      zone: null,
      top: false,
      zoneAttempts: 1,
      topAttempts: 1,
      attempted: false,
    };
  },

  calculateScore(boulder) {
    if (!boulder.attempted || boulder.zone === null) return 0;
    if (boulder.zone === false && !boulder.top) return 0;

    let score = 0;
    let attemptsToDeduct = 0;

    if (boulder.top) {
      score = CONFIG.TOP_SCORE;
      attemptsToDeduct = boulder.topAttempts;
    } else if (boulder.zone === true) {
      score = CONFIG.ZONE_SCORE;
      attemptsToDeduct = boulder.zoneAttempts;
    }

    const deduction = (attemptsToDeduct - 1) * CONFIG.ATTEMPT_DEDUCTION;
    return Math.max(0, Math.round((score - deduction) * 10) / 10);
  },

  updateZone(competitorId, boulderIndex) {
    const competitor = state.competitors.find(
      (c) => c.id === competitorId
    );
    if (!competitor) return;

    const boulder = competitor.boulders[boulderIndex];

    if (boulder.zone === null) {
      boulder.zone = true;
      boulder.attempted = true;
    } else if (boulder.zone === true) {
      boulder.zone = false;
      if (boulder.top) {
        boulder.top = false;
      }
    } else {
      boulder.zone = null;
      boulder.attempted = false;
      boulder.top = false;
      boulder.zoneAttempts = 1;
      boulder.topAttempts = 1;
    }

    debouncedUpdateDisplay();
  },

  updateTop(competitorId, boulderIndex) {
    const competitor = state.competitors.find(
      (c) => c.id === competitorId
    );
    if (!competitor) return;

    const boulder = competitor.boulders[boulderIndex];
    boulder.top = !boulder.top;
    boulder.attempted = true;

    if (boulder.top) {
      boulder.zone = true;
      if (boulder.topAttempts < boulder.zoneAttempts) {
        boulder.topAttempts = boulder.zoneAttempts;
      }
    }

    debouncedUpdateDisplay();
  },

  updateAttempts(competitorId, boulderIndex, type, value) {
    const competitor = state.competitors.find(
      (c) => c.id === competitorId
    );
    if (!competitor) return;

    const error = validation.attempts(value);
    if (error) {
      utils.showMessage(error);
      return;
    }

    const boulder = competitor.boulders[boulderIndex];
    const attempts = parseInt(value) || 1;

    if (type === "zone") {
      boulder.zoneAttempts = attempts;
      if (boulder.topAttempts < attempts) {
        boulder.topAttempts = attempts;
      }
    } else {
      if (boulder.zone === true && attempts < boulder.zoneAttempts) {
        utils.showMessage(
          `Top attempts (${attempts}) cannot be less than zone attempts (${boulder.zoneAttempts})`
        );
        return;
      }
      boulder.topAttempts = attempts;
    }

    debouncedUpdateDisplay();
  },

  changeAttempts(competitorId, boulderIndex, type, delta) {
    const competitor = state.competitors.find(
      (c) => c.id === competitorId
    );
    if (!competitor) return;

    const boulder = competitor.boulders[boulderIndex];
    let newAttempts;

    if (type === "zone") {
      newAttempts = Math.max(
        1,
        Math.min(CONFIG.MAX_ATTEMPTS, boulder.zoneAttempts + delta)
      );
      boulder.zoneAttempts = newAttempts;
      if (boulder.topAttempts < newAttempts) {
        boulder.topAttempts = newAttempts;
      }
    } else {
      newAttempts = Math.max(
        1,
        Math.min(CONFIG.MAX_ATTEMPTS, boulder.topAttempts + delta)
      );
      if (boulder.zone === true) {
        newAttempts = Math.max(newAttempts, boulder.zoneAttempts);
      }
      boulder.topAttempts = newAttempts;
    }

    debouncedUpdateDisplay();
  },
};

// Competitor management
const competitorManager = {
  create(name) {
    return {
      id: state.competitorId++,
      name: name,
      boulders: Array(4)
        .fill(null)
        .map(() => boulderManager.createBoulder()),
    };
  },

  add(name) {
    const validationError = validation.competitorName(name);
    if (validationError) {
      utils.showMessage(validationError);
      return false;
    }

    if (state.competitors.length >= CONFIG.MAX_COMPETITORS) {
      utils.showMessage(
        `Maximum ${CONFIG.MAX_COMPETITORS} competitors allowed`
      );
      return false;
    }

    const competitor = this.create(name);
    state.competitors.push(competitor);

    utils.showMessage(`Added ${name} to the competition`, "success");
    utils.announceToScreenReader(
      `Added competitor ${name}. Total: ${state.competitors.length} competitors.`
    );

    return true;
  },

  remove(id) {
    const competitor = state.competitors.find((c) => c.id === id);
    if (!competitor) return;

    if (confirm(`Are you sure you want to remove ${competitor.name}?`)) {
      state.competitors = state.competitors.filter((c) => c.id !== id);
      utils.showMessage(
        `Removed ${competitor.name} from the competition`,
        "success"
      );
      utils.announceToScreenReader(
        `Removed competitor ${competitor.name}`
      );
      updateDisplay();
    }
  },

  calculateTotalScore(competitor) {
    const total = competitor.boulders.reduce((sum, boulder) => {
      return sum + boulderManager.calculateScore(boulder);
    }, 0);
    return Math.round(total * 10) / 10;
  },
};

// UI Rendering
const renderer = {
  createBoulderCell(competitor, boulderIndex) {
    const boulder = competitor.boulders[boulderIndex];
    const cell = document.createElement("td");
    cell.setAttribute("data-label", `Boulder ${boulderIndex + 1}`);

    const section = document.createElement("div");
    section.className = "boulder-section";

    const controls = document.createElement("div");
    controls.className = "boulder-controls";

    // Zone row
    const zoneRow = this.createZoneRow(competitor, boulderIndex, boulder);
    controls.appendChild(zoneRow);

    // Top row
    const topRow = this.createTopRow(competitor, boulderIndex, boulder);
    controls.appendChild(topRow);

    section.appendChild(controls);

    // Score display
    const score = boulderManager.calculateScore(boulder);
    const scoreDiv = document.createElement("div");
    scoreDiv.className = "score";
    scoreDiv.textContent = `Score: ${score.toFixed(1)}`;
    scoreDiv.setAttribute(
      "aria-label",
      `Boulder ${boulderIndex + 1} score: ${score.toFixed(1)} points`
    );
    section.appendChild(scoreDiv);

    cell.appendChild(section);
    return cell;
  },

  createZoneRow(competitor, boulderIndex, boulder) {
    const row = document.createElement("div");
    row.className = "boulder-row";

    // Zone button
    const button = document.createElement("button");
    button.className = "ternary-button";
    button.setAttribute(
      "aria-label",
      `Toggle zone status for boulder ${boulderIndex + 1}`
    );

    if (boulder.zone === true) {
      button.className += " success";
      button.setAttribute("aria-pressed", "true");
    } else if (boulder.zone === false) {
      button.className += " failed";
      button.setAttribute("aria-pressed", "false");
    } else {
      button.setAttribute("aria-pressed", "mixed");
    }

    button.textContent = "Zone";
    button.onclick = () =>
      boulderManager.updateZone(competitor.id, boulderIndex);

    // Attempts control
    const attemptsControl = this.createAttemptsControl(
      competitor.id,
      boulderIndex,
      "zone",
      boulder.zoneAttempts,
      `Attempts to achieve zone for boulder ${boulderIndex + 1}`
    );

    row.appendChild(button);
    row.appendChild(attemptsControl);
    return row;
  },

  createTopRow(competitor, boulderIndex, boulder) {
    const row = document.createElement("div");
    row.className = "boulder-row";

    // Top button
    const button = document.createElement("button");
    button.className = "ternary-button";
    button.setAttribute(
      "aria-label",
      `Toggle top status for boulder ${boulderIndex + 1}`
    );

    if (boulder.top) {
      button.className += " success";
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.textContent = "Top";
    button.onclick = () =>
      boulderManager.updateTop(competitor.id, boulderIndex);

    // Attempts control
    const attemptsControl = this.createAttemptsControl(
      competitor.id,
      boulderIndex,
      "top",
      boulder.topAttempts,
      `Total attempts to achieve top for boulder ${boulderIndex + 1}`
    );

    row.appendChild(button);
    row.appendChild(attemptsControl);
    return row;
  },

  createAttemptsControl(
    competitorId,
    boulderIndex,
    type,
    value,
    ariaLabel
  ) {
    const control = document.createElement("div");
    control.className = "attempts-control";
    control.setAttribute("role", "group");
    control.setAttribute("aria-label", ariaLabel);

    const minusBtn = document.createElement("button");
    minusBtn.textContent = "-";
    minusBtn.setAttribute("aria-label", `Decrease ${type} attempts`);
    minusBtn.onclick = () =>
      boulderManager.changeAttempts(competitorId, boulderIndex, type, -1);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = CONFIG.MAX_ATTEMPTS.toString();
    input.value = value;
    input.setAttribute("aria-label", `Number of ${type} attempts`);
    input.onchange = (e) =>
      boulderManager.updateAttempts(
        competitorId,
        boulderIndex,
        type,
        e.target.value
      );

    const plusBtn = document.createElement("button");
    plusBtn.textContent = "+";
    plusBtn.setAttribute("aria-label", `Increase ${type} attempts`);
    plusBtn.onclick = () =>
      boulderManager.changeAttempts(competitorId, boulderIndex, type, 1);

    control.appendChild(minusBtn);
    control.appendChild(input);
    control.appendChild(plusBtn);
    return control;
  },
};

// Analysis functions
const analysis = {
  generatePodiumAnalysis() {
    try {
      const competitorAnalysis = state.competitors.map((c) => {
        const currentScore = competitorManager.calculateTotalScore(c);
        const unattemptedBoulders = c.boulders.filter(
          (b) => !b.attempted
        );
        const remainingBoulders = unattemptedBoulders.length;
        const maxPossibleScore =
          currentScore + remainingBoulders * CONFIG.TOP_SCORE;
        const isFinished = remainingBoulders === 0;

        return {
          ...c,
          currentScore,
          remainingBoulders,
          unattemptedBoulders,
          maxPossibleScore,
          isFinished,
        };
      });

      const currentStandings = [...competitorAnalysis].sort(
        (a, b) => b.currentScore - a.currentScore
      );

      // Calculate positions
      let currentPosition = 1;
      let previousScore = null;
      let tiedCount = 0;

      currentStandings.forEach((comp) => {
        if (
          previousScore !== null &&
          Math.abs(comp.currentScore - previousScore) > 0.01
        ) {
          currentPosition += tiedCount;
          tiedCount = 1;
        } else {
          tiedCount++;
        }
        comp.currentPosition = currentPosition;
        previousScore = comp.currentScore;
      });

      // Update analysis with positions
      competitorAnalysis.forEach((comp) => {
        const standingComp = currentStandings.find(
          (c) => c.id === comp.id
        );
        comp.currentPosition = standingComp.currentPosition;
      });

      const sortedByPosition = [...competitorAnalysis].sort(
        (a, b) => a.currentPosition - b.currentPosition
      );

      let html = "";
      sortedByPosition.forEach((competitor) => {
        const messages = this.analyzePodiumChances(
          competitor,
          competitorAnalysis
        );
        const competitorsAtSameScore = competitorAnalysis.filter(
          (c) => Math.abs(c.currentScore - competitor.currentScore) < 0.01
        ).length;

        const positionSuffix = utils.getPositionSuffix(
          competitor.currentPosition
        );
        let positionText =
          competitorsAtSameScore > 1
            ? `tied for ${competitor.currentPosition}${positionSuffix} place`
            : `${competitor.currentPosition}${positionSuffix} place`;

        html += `<div class="competitor-analysis">`;
        html += `<h3>${
          competitor.name
        } - Currently ${positionText} (${competitor.currentScore.toFixed(
          1
        )} points)</h3>`;
        html += `<div class="analysis-list">`;
        messages.forEach((message) => {
          html += `<p>• ${message}</p>`;
        });
        html += `</div></div>`;
      });

      return html;
    } catch (error) {
      console.error("Error generating podium analysis:", error);
      return `<p style="color: var(--danger-color);">Error generating analysis. Please try again.</p>`;
    }
  },

  analyzePodiumChances(competitor, allCompetitors) {
    const messages = [];

    if (competitor.isFinished) {
      messages.push(
        `All boulders completed - Final score: ${competitor.currentScore.toFixed(
          1
        )} points`
      );
      
      // Check if finished competitor has guaranteed podium
      const podiumGuarantee = this.checkPodiumGuarantee(competitor, allCompetitors);
      if (podiumGuarantee) {
        messages.push(podiumGuarantee);
      }
      
      return messages;
    }

    // Show max possible score
    messages.push(
      `Max possible score: ${competitor.maxPossibleScore.toFixed(1)} points (${competitor.remainingBoulders} boulders left)`
    );

    // Simple podium analysis
    const podiumAnalysis = this.getSimplePodiumAnalysis(competitor, allCompetitors);
    messages.push(...podiumAnalysis);

    return messages;
  },

  checkPodiumGuarantee(competitor, allCompetitors) {
    // First, check if they're currently in podium position
    if (competitor.currentPosition > 3) {
      return null; // Not in podium, can't guarantee podium
    }

    // Count how many competitors (finished + unfinished) could potentially beat this competitor
    const allWhoCanBeat = allCompetitors.filter(
      (c) => {
        if (c.id === competitor.id) return false;
        
        if (c.isFinished) {
          // Finished competitor beats them if they have higher score
          return c.currentScore > competitor.currentScore;
        } else {
          // Unfinished competitor could beat them if max possible > current
          return c.maxPossibleScore > competitor.currentScore;
        }
      }
    ).length;

    if (allWhoCanBeat === 0) {
      return "🏆 Guaranteed to hold current position";
    } else if (allWhoCanBeat === 1) {
      return "🥈 Guaranteed at least 2nd place";
    } else if (allWhoCanBeat === 2) {
      return "🥉 Guaranteed podium finish (at least 3rd place)";
    }
    
    return null;
  },

  getSimplePodiumAnalysis(competitor, allCompetitors) {
    const messages = [];
    
    // Get current podium holders (top 3 finished competitors)
    const finishedCompetitors = allCompetitors.filter(c => c.isFinished).sort((a, b) => b.currentScore - a.currentScore);
    const currentPodium = finishedCompetitors.slice(0, 3);
    
    // Can they beat each podium position?
    if (currentPodium.length > 0) {
      messages.push("Potential to beat:");
      
      currentPodium.forEach((podiumCompetitor, index) => {
        const position = ["1st", "2nd", "3rd"][index];
        const positionSuffix = ["🥇", "🥈", "🥉"][index];
        
        if (competitor.maxPossibleScore > podiumCompetitor.currentScore) {
          messages.push(`• ${positionSuffix} ${podiumCompetitor.name} (${podiumCompetitor.currentScore.toFixed(1)} pts) - possible with ${Math.ceil((podiumCompetitor.currentScore + 0.1 - competitor.currentScore) / CONFIG.TOP_SCORE)} tops`);
        } else {
          messages.push(`• ${positionSuffix} ${podiumCompetitor.name} (${podiumCompetitor.currentScore.toFixed(1)} pts) - cannot beat`);
        }
      });
    }
    
    // Show competition from other unfinished competitors
    const otherUnfinished = allCompetitors.filter(
      c => c.id !== competitor.id && !c.isFinished && c.maxPossibleScore >= competitor.currentScore
    );
    
    if (otherUnfinished.length > 0) {
      messages.push(`Competition from: ${otherUnfinished.map(c => `${c.name} (max ${c.maxPossibleScore.toFixed(1)})`).join(", ")}`);
    }
    
    return messages;
  },


};

// Main functions
function handleAddCompetitor(event) {
  event.preventDefault();
  const nameInput = document.getElementById("competitorName");
  const name = utils.sanitizeInput(nameInput.value);

  if (competitorManager.add(name)) {
    nameInput.value = "";
    updateDisplay();

    if (state.competitors.length >= CONFIG.MAX_COMPETITORS) {
      document.getElementById("addButton").disabled = true;
    }
  }

  nameInput.focus();
}

function updateDisplay() {
  if (state.isUpdating) return;
  state.isUpdating = true;

  const tbody = document.getElementById("competitorsList");
  const competitorCount = document.getElementById("competitorCount");
  const container = document.querySelector(".container");

  container.classList.add("loading");

  competitorCount.textContent = `${state.competitors.length} competitor${
    state.competitors.length !== 1 ? "s" : ""
  }`;

  const competitorsWithScores = state.competitors.map((c) => ({
    ...c,
    totalScore: competitorManager.calculateTotalScore(c),
  }));

  // Calculate positions by sorting a copy but keep original order for display
  const sortedForPositions = [...competitorsWithScores].sort(
    (a, b) => b.totalScore - a.totalScore
  );

  // Calculate positions properly handling ties
  let currentPosition = 1;
  let previousScore = null;
  let tiedCount = 0;

  sortedForPositions.forEach((comp) => {
    if (
      previousScore !== null &&
      Math.abs(comp.totalScore - previousScore) > 0.01
    ) {
      currentPosition += tiedCount;
      tiedCount = 1;
    } else {
      tiedCount++;
    }
    comp.currentPosition = currentPosition;
    previousScore = comp.totalScore;
  });

  // Map positions back to original order competitors
  competitorsWithScores.forEach((comp) => {
    const positionComp = sortedForPositions.find((c) => c.id === comp.id);
    comp.currentPosition = positionComp.currentPosition;
  });

  const fragment = document.createDocumentFragment();

  competitorsWithScores.forEach((competitor, index) => {
    const row = document.createElement("tr");
    row.setAttribute("data-competitor-id", competitor.id);

    // Position
    const posCell = document.createElement("td");
    posCell.textContent = index + 1;
    row.appendChild(posCell);

    // Name with position underneath
    const nameCell = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.textContent = competitor.name;
    nameDiv.className = "competitor-name";
    
    const positionDiv = document.createElement("div");
    const positionSuffix = utils.getPositionSuffix(competitor.currentPosition);
    const competitorsAtSamePosition = competitorsWithScores.filter(
      (c) => c.currentPosition === competitor.currentPosition
    ).length;
    
    if (competitorsAtSamePosition > 1) {
      positionDiv.textContent = `Tied ${competitor.currentPosition}${positionSuffix} place`;
    } else {
      positionDiv.textContent = `${competitor.currentPosition}${positionSuffix} place`;
    }
    
    positionDiv.className = "competitor-position";
    
    nameCell.appendChild(nameDiv);
    nameCell.appendChild(positionDiv);
    row.appendChild(nameCell);

    // Boulders
    for (let i = 0; i < 4; i++) {
      const boulderCell = renderer.createBoulderCell(competitor, i);
      row.appendChild(boulderCell);
    }

    // Total score
    const totalCell = document.createElement("td");
    totalCell.innerHTML = `<span class="total-score">${competitor.totalScore.toFixed(
      1
    )}</span>`;
    totalCell.setAttribute(
      "aria-label",
      `Total score: ${competitor.totalScore.toFixed(1)} points`
    );
    row.appendChild(totalCell);

    // Remove button
    const actionCell = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-danger";
    removeBtn.style.padding = "4px 12px";
    removeBtn.style.fontSize = "12px";
    removeBtn.textContent = "Remove";
    removeBtn.setAttribute(
      "aria-label",
      `Remove competitor ${competitor.name}`
    );
    removeBtn.onclick = () => competitorManager.remove(competitor.id);
    actionCell.appendChild(removeBtn);
    row.appendChild(actionCell);

    fragment.appendChild(row);
  });

  tbody.innerHTML = "";
  tbody.appendChild(fragment);

  container.classList.remove("loading");
  state.isUpdating = false;
}

const debouncedUpdateDisplay = utils.debounce(
  updateDisplay,
  CONFIG.DEBOUNCE_DELAY
);

function showPodiumAnalysis() {
  const analysisDiv = document.getElementById("podiumAnalysis");
  const content = document.getElementById("analysisContent");

  if (state.competitors.length === 0) {
    utils.showMessage("Please add competitors first");
    return;
  }

  // Check if currently hidden (handles both 'none' and empty string)
  if (analysisDiv.style.display !== "block") {
    analysisDiv.style.display = "block";
    content.innerHTML = analysis.generatePodiumAnalysis();
    analysisDiv.classList.add("fade-in");
  } else {
    analysisDiv.style.display = "none";
  }
}

function loadCompData1() {
  const testData = [
    {
      name: "Shem",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 3,
          topAttempts: 4,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 2,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 6,
          topAttempts: 10,
          attempted: true,
        },
      ],
    },
    {
      name: "Mark",
      boulders: [
        {
          zone: false,
          top: false,
          zoneAttempts: 5,
          topAttempts: 5,
          attempted: true,
        },
        {
          zone: true,
          top: false,
          zoneAttempts: 10,
          topAttempts: 15,
          attempted: true,
        },
        {
          zone: true,
          top: false,
          zoneAttempts: 10,
          topAttempts: 10,
          attempted: true,
        },
        {
          zone: null,
          top: false,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: false,
        },
      ],
    },
    {
      name: "Lukas",
      boulders: [
        {
          zone: true,
          top: false,
          zoneAttempts: 7,
          topAttempts: 7,
          attempted: true,
        },
        {
          zone: false,
          top: false,
          zoneAttempts: 7,
          topAttempts: 7,
          attempted: true,
        },
        {
          zone: true,
          top: false,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: null,
          top: false,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: false,
        },
      ],
    },
    {
      name: "Erica",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: null,
          top: false,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: false,
        },
      ],
    },
    {
      name: "Davance",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 6,
          attempted: true,
        },
        {
          zone: null,
          top: false,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: false,
        },
      ],
    },
    {
      name: "Lily",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: false,
          zoneAttempts: 3,
          topAttempts: 10,
          attempted: true,
        },
      ],
    },
    {
      name: "Megan",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: false,
          top: false,
          zoneAttempts: 3,
          topAttempts: 10,
          attempted: true,
        },
      ],
    },
    {
      name: "MM",
      boulders: [
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: true,
          top: true,
          zoneAttempts: 1,
          topAttempts: 1,
          attempted: true,
        },
        {
          zone: false,
          top: false,
          zoneAttempts: 10,
          topAttempts: 10,
          attempted: true,
        },
      ],
    },
  ];

  state.competitors = [];
  state.competitorId = 0;

  testData.forEach((data) => {
    const competitor = competitorManager.create(data.name);
    competitor.boulders = data.boulders;
    state.competitors.push(competitor);
  });

  updateDisplay();
  document.getElementById("addButton").disabled = false;
  utils.showMessage("Demo data loaded: 8 competitors added", "success");
  utils.announceToScreenReader(
    "Test competition data loaded: 8 competitors added"
  );
}

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const analysisDiv = document.getElementById("podiumAnalysis");
    if (analysisDiv.style.display !== "none") {
      analysisDiv.style.display = "none";
    }
  }
});

// Initialize
window.addEventListener("load", () => {
  updateDisplay();
});

// Error handling
window.addEventListener("error", (event) => {
  console.error("Application error:", event.error);
  utils.showMessage(
    "An unexpected error occurred. Please refresh the page if problems persist."
  );
}); 