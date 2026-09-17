// =============================================================================
// EXPENSE & BUDGET VISUALIZER — app.js
// Phase 2: Data layer and transaction state
// Phase 4: Spending distribution chart (Chart.js)
// Phase 5: Spending limit feature
// Phase 6: Transaction sorting
// =============================================================================

// -----------------------------------------------------------------------------
// CONSTANTS — localStorage keys kept in one place so they never drift
// -----------------------------------------------------------------------------
const STORAGE_KEY_TRANSACTIONS = "ebv_transactions";
const STORAGE_KEY_THEME        = "ebv_theme";
const STORAGE_KEY_BUDGET_LIMIT = "ebv_budget_limit";

// Colours used by the pie chart — one per category.
// Defined here so they stay consistent between the chart and the badge CSS.
const CHART_COLORS = {
  Food:      "#48bb78",   // green  — matches --color-food
  Transport: "#4299e1",   // blue   — matches --color-transport
  Fun:       "#ed64a6",   // pink   — matches --color-fun
};

// -----------------------------------------------------------------------------
// STATE — single source of truth for all transactions
// -----------------------------------------------------------------------------

/**
 * The transactions array holds every transaction object.
 * All UI sections (list, total balance, chart) are derived from this array.
 *
 * Shape of each transaction:
 * {
 *   id       : string  — unique identifier (Date.now().toString())
 *   itemName : string  — human-readable name entered by the user
 *   amount   : number  — stored as a Number, never a string
 *   category : string  — "Food" | "Transport" | "Fun"
 *   date     : string  — ISO 8601 date string (new Date().toISOString())
 * }
 */
let transactions = [];

// Holds the single Chart.js instance. Created once in renderChart() and
// updated on every subsequent call — never destroyed and recreated.
let spendingChart = null;

// The spending limit set by the user. 0 means no limit is active.
// Loaded from localStorage on init and updated when the user clicks "Set Limit".
let budgetLimit = 0;

// -----------------------------------------------------------------------------
// LOCAL STORAGE — two functions that own all localStorage communication
// -----------------------------------------------------------------------------

/**
 * loadTransactions()
 * Reads the transactions array from localStorage on page load.
 * Falls back to an empty array if:
 *   - nothing is stored yet (first visit)
 *   - the stored value is corrupted / not valid JSON
 */
function loadTransactions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);

    // Nothing stored yet — start with an empty array
    if (stored === null) {
      transactions = [];
      return;
    }

    const parsed = JSON.parse(stored);

    // Guard against non-array data (e.g. someone manually edited localStorage)
    if (!Array.isArray(parsed)) {
      console.warn("localStorage data was not an array. Resetting to empty.");
      transactions = [];
      return;
    }

    transactions = parsed;
  } catch (error) {
    // JSON.parse threw — the stored string is corrupted
    console.warn("Failed to parse transactions from localStorage:", error);
    transactions = [];
  }
}

/**
 * saveTransactions()
 * Serialises the current transactions array to localStorage.
 * Called every time the array is mutated (add or delete).
 */
function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(transactions));
  } catch (error) {
    // localStorage can throw if storage is full (QuotaExceededError)
    console.error("Could not save transactions to localStorage:", error);
    alert("Storage is full. Could not save the transaction.");
  }
}

/**
 * loadBudgetLimit()
 * Reads the saved spending limit from localStorage.
 * Falls back to 0 (no limit) if nothing is stored or the value is invalid.
 */
function loadBudgetLimit() {
  const stored = localStorage.getItem(STORAGE_KEY_BUDGET_LIMIT);

  if (stored === null) {
    budgetLimit = 0;
    return;
  }

  const parsed = Number(stored);

  // Treat NaN or negative values as "no limit"
  budgetLimit = (!isNaN(parsed) && parsed > 0) ? parsed : 0;
}

/**
 * saveBudgetLimit()
 * Persists the current budgetLimit value to localStorage.
 */
function saveBudgetLimit() {
  localStorage.setItem(STORAGE_KEY_BUDGET_LIMIT, String(budgetLimit));
}

// -----------------------------------------------------------------------------
// DATA FUNCTIONS — add and delete transactions
// -----------------------------------------------------------------------------

/**
 * addTransaction(itemName, amount, category)
 * Creates a new transaction object, appends it to the array, persists it,
 * then triggers a full UI refresh.
 *
 * @param {string} itemName  - name of the expense item
 * @param {number} amount    - expense amount (must be a positive number)
 * @param {string} category  - expense category
 */
function addTransaction(itemName, amount, category) {
  // Build the transaction object
  const transaction = {
    id:       Date.now().toString(),   // unique enough for a local app
    itemName: itemName.trim(),
    amount:   amount,                  // already a Number (converted during validation)
    category: category,
    date:     new Date().toISOString() // full timestamp for future sorting/filtering
  };

  // Prepend so the newest item appears at the top by default
  transactions.unshift(transaction);

  // Persist the updated array
  saveTransactions();

  // Refresh everything that depends on the transactions array
  renderAll();
}

/**
 * deleteTransaction(id)
 * Removes the transaction with the given id from the array, persists the
 * change, then triggers a full UI refresh.
 *
 * @param {string} id - the id of the transaction to remove
 */
function deleteTransaction(id) {
  // Keep every transaction whose id does NOT match
  transactions = transactions.filter(function(t) {
    return t.id !== id;
  });

  // Persist the updated array
  saveTransactions();

  // Refresh everything that depends on the transactions array
  renderAll();
}

// -----------------------------------------------------------------------------
// VALIDATION — check form inputs before creating a transaction
// -----------------------------------------------------------------------------

/**
 * validateForm(itemName, rawAmount, category)
 * Returns an error message string if validation fails, or null if all
 * inputs are valid.
 *
 * @param {string} itemName
 * @param {string} rawAmount  - the raw string value from the input
 * @param {string} category
 * @returns {string|null}
 */
function validateForm(itemName, rawAmount, category) {
  if (itemName.trim() === "") {
    return "Item name is required.";
  }

  if (rawAmount.trim() === "") {
    return "Amount is required.";
  }

  const amount = Number(rawAmount);

  if (isNaN(amount) || amount <= 0) {
    return "Amount must be a positive number.";
  }

  if (category === "") {
    return "Please select a category.";
  }

  return null; // no errors
}

// -----------------------------------------------------------------------------
// DOM REFERENCES — collected once so we don't query the DOM repeatedly
// -----------------------------------------------------------------------------
const formEl           = document.getElementById("transaction-form");
const itemNameInput    = document.getElementById("item-name");
const amountInput      = document.getElementById("amount");
const categorySelect   = document.getElementById("category");
const transactionList  = document.getElementById("transaction-list");
const emptyStateEl     = document.getElementById("empty-state");
const totalBalanceEl   = document.getElementById("total-balance");

// Spending limit elements
const budgetLimitInput = document.getElementById("budget-limit");
const setLimitBtn      = document.getElementById("set-limit-btn");
const limitStatusEl    = document.getElementById("limit-status");
const limitSectionEl   = document.querySelector(".section-limit");

// Sort control
const sortBySelect = document.getElementById("sort-by");

// Theme toggle
const themeToggleBtn = document.getElementById("theme-toggle");

// -----------------------------------------------------------------------------
// SORTING — getSortedTransactions()
// Returns a sorted COPY of transactions[]. The original array is never mutated.
// Total balance, spending limit, and chart always use transactions[] directly.
// -----------------------------------------------------------------------------

/**
 * getSortedTransactions()
 * Reads the current value of the sort dropdown and returns a new array with
 * transactions in the requested order. The original `transactions` array is
 * never modified.
 *
 * Sort options (must match the <option value="..."> in index.html):
 *   default      — newest first (insertion order, already newest-first)
 *   oldest       — oldest first (reverse insertion order)
 *   amount-desc  — highest amount first
 *   amount-asc   — lowest amount first
 *   category     — category name A → Z, then newest within each category
 *
 * @returns {Array} A sorted shallow copy of transactions[]
 */
function getSortedTransactions() {
  // Shallow copy so sort() never touches the original array
  var sorted = transactions.slice();
  var option = sortBySelect.value;

  if (option === "oldest") {
    // transactions[] is stored newest-first, so reverse gives oldest-first
    sorted.reverse();

  } else if (option === "amount-desc") {
    sorted.sort(function(a, b) { return b.amount - a.amount; });

  } else if (option === "amount-asc") {
    sorted.sort(function(a, b) { return a.amount - b.amount; });

  } else if (option === "category") {
    sorted.sort(function(a, b) {
      // Primary: category A → Z
      if (a.category < b.category) return -1;
      if (a.category > b.category) return  1;
      // Secondary: newest first within the same category
      return 0;
    });
  }
  // "default" needs no sort — transactions[] is already newest-first

  return sorted;
}

// -----------------------------------------------------------------------------
// RENDER FUNCTIONS — each one reads from `transactions` and updates the DOM
// -----------------------------------------------------------------------------

/**
 * renderAll()
 * Central entry point called after every state change.
 * Keeps the list, balance, chart, and spending limit in sync with the data.
 */
function renderAll() {
  renderTransactionList();
  renderTotalBalance();
  renderChart();
  renderSpendingLimit();
}

/**
 * renderTotalBalance()
 * Sums all transaction amounts and displays the result.
 */
function renderTotalBalance() {
  const total = transactions.reduce(function(sum, t) {
    return sum + t.amount;
  }, 0);

  totalBalanceEl.textContent = "Rp " + formatNumber(total);
}

/**
 * renderSpendingLimit()
 * Compares the current total spending against the saved budget limit and
 * updates the status message and visual state accordingly.
 *
 * States:
 *   - No limit set       → clear the status message, no highlight
 *   - Under limit        → show remaining budget, green status
 *   - At or over limit   → show over-budget message, red status + highlight classes
 */
function renderSpendingLimit() {
  // Calculate the current total directly from the transactions array —
  // no separate state variable needed.
  const total = transactions.reduce(function(sum, t) {
    return sum + t.amount;
  }, 0);

  // Remove all status classes first so we start from a clean slate
  limitStatusEl.classList.remove("status-ok", "status-warning", "status-over");
  limitSectionEl.classList.remove("over-budget");
  totalBalanceEl.classList.remove("over-budget");

  // No limit active — clear the message and stop here
  if (budgetLimit <= 0) {
    limitStatusEl.textContent = "No spending limit set.";
    return;
  }

  const remaining = budgetLimit - total;

  if (remaining > 0) {
    // Under budget
    limitStatusEl.textContent = "✓ Rp " + formatNumber(remaining) + " remaining of Rp " + formatNumber(budgetLimit) + " limit.";
    limitStatusEl.classList.add("status-ok");
  } else {
    // At or over budget
    const overage = Math.abs(remaining);
    limitStatusEl.textContent = "⚠ Limit exceeded by Rp " + formatNumber(overage) + "! (Limit: Rp " + formatNumber(budgetLimit) + ")";
    limitStatusEl.classList.add("status-over");
    limitSectionEl.classList.add("over-budget");
    totalBalanceEl.classList.add("over-budget");
  }
}

/**
 * renderChart()
 * Reads the transactions array, groups totals by category, and updates the
 * Chart.js doughnut chart. Creates the chart instance on the first call;
 * subsequent calls update the existing instance so Chart.js can animate
 * the change smoothly.
 *
 * If there are no transactions the chart canvas is hidden and an empty-state
 * message is shown instead — no Chart.js calls are made in that case.
 */
function renderChart() {
  const canvasEl     = document.getElementById("spending-chart");
  const emptyChartEl = document.getElementById("chart-empty-state");

  // --- Empty state: hide canvas, show message, destroy chart if it exists ---
  if (transactions.length === 0) {
    canvasEl.style.display     = "none";
    emptyChartEl.style.display = "";

    if (spendingChart) {
      spendingChart.destroy();
      spendingChart = null;
    }
    return;
  }

  // There are transactions — make sure the canvas is visible
  canvasEl.style.display     = "";
  emptyChartEl.style.display = "none";

  // --- Group spending totals by category ---
  // Result example: { Food: 75000, Transport: 30000, Fun: 50000 }
  var grouped = {};
  transactions.forEach(function(t) {
    if (grouped[t.category] === undefined) {
      grouped[t.category] = 0;
    }
    grouped[t.category] += t.amount;
  });

  var labels = Object.keys(grouped);
  var data   = Object.values(grouped);

  // Map each label to its colour; unknown categories get a neutral grey.
  var colors = labels.map(function(label) {
    return CHART_COLORS[label] || "#a0aec0";
  });

  // --- First call: create the Chart.js instance ---
  if (spendingChart === null) {
    spendingChart = new Chart(canvasEl, {
      type: "doughnut",
      data: {
        labels:   labels,
        datasets: [{
          data:            data,
          backgroundColor: colors,
          borderWidth:     2,
          borderColor:     "#ffffff",
          hoverOffset:     8
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: true,
        cutout:              "60%",   // doughnut hole size
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              padding:   16,
              boxWidth:  12,
              font: { size: 13 }
            }
          },
          tooltip: {
            callbacks: {
              // Show "Food: Rp 75,000" in the tooltip
              label: function(context) {
                var value = context.parsed;
                return " " + context.label + ": Rp " + formatNumber(value);
              }
            }
          }
        }
      }
    });
    return;
  }

  // --- Subsequent calls: update the existing instance ---
  spendingChart.data.labels                       = labels;
  spendingChart.data.datasets[0].data             = data;
  spendingChart.data.datasets[0].backgroundColor  = colors;
  spendingChart.update();
}

/**
 * renderTransactionList()
 * Rebuilds the transaction <ul> from a sorted copy of the transactions array.
 * The sort order is read from the dropdown each time this runs, so the active
 * sort option is always respected after add, delete, or page load.
 * transactions[] itself is never reordered here.
 */
function renderTransactionList() {
  // Clear existing list items
  transactionList.innerHTML = "";

  // Show empty state when there are no transactions
  if (transactions.length === 0) {
    const li = document.createElement("li");
    li.id = "empty-state";
    li.className = "empty-state";
    li.textContent = "No transactions yet. Add one above!";
    transactionList.appendChild(li);
    return;
  }

  // Get a sorted copy — original transactions[] is untouched
  var sorted = getSortedTransactions();

  // Build a list item for each transaction in sorted order
  sorted.forEach(function(t) {
    const li = createTransactionItem(t);
    transactionList.appendChild(li);
  });
}

/**
 * createTransactionItem(transaction)
 * Builds and returns a single <li> element for a transaction.
 *
 * @param {Object} transaction
 * @returns {HTMLLIElement}
 */
function createTransactionItem(transaction) {
  const li = document.createElement("li");
  li.className = "transaction-item";
  li.dataset.id = transaction.id; // store id on the element for easy retrieval

  // --- Item info ---
  const infoDiv = document.createElement("div");
  infoDiv.className = "transaction-info";

  const nameEl = document.createElement("span");
  nameEl.className = "transaction-name";
  nameEl.textContent = transaction.itemName;

  const categoryEl = document.createElement("span");
  categoryEl.className = "transaction-category";
  categoryEl.textContent = transaction.category;
  categoryEl.dataset.category = transaction.category; // used by CSS for badge colour

  const dateEl = document.createElement("span");
  dateEl.className = "transaction-date";
  dateEl.textContent = formatDate(transaction.date);

  infoDiv.appendChild(nameEl);
  infoDiv.appendChild(categoryEl);
  infoDiv.appendChild(dateEl);

  // --- Amount ---
  const amountEl = document.createElement("span");
  amountEl.className = "transaction-amount";
  amountEl.textContent = "Rp " + formatNumber(transaction.amount);

  // --- Delete button ---
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.type = "button";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", "Delete transaction: " + transaction.itemName);

  // Wire the delete button — captures the transaction id via closure
  deleteBtn.addEventListener("click", function() {
    deleteTransaction(transaction.id);
  });

  li.appendChild(infoDiv);
  li.appendChild(amountEl);
  li.appendChild(deleteBtn);

  return li;
}

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * formatNumber(value)
 * Formats a number as a locale string (e.g. 25000 → "25,000").
 *
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
  return value.toLocaleString("id-ID");
}

/**
 * formatDate(isoString)
 * Converts an ISO date string to a readable short date (e.g. "17 Sep 2026").
 *
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-GB", {
    day:   "numeric",
    month: "short",
    year:  "numeric"
  });
}

/**
 * showFormError(message)
 * Displays a validation error message below the form.
 * Creates the error element if it doesn't exist yet.
 *
 * @param {string} message
 */
function showFormError(message) {
  let errorEl = document.getElementById("form-error");

  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.id = "form-error";
    errorEl.className = "form-error";
    // Insert the error paragraph right after the submit button
    formEl.appendChild(errorEl);
  }

  errorEl.textContent = message;
}

/**
 * clearFormError()
 * Removes any visible form error message.
 */
function clearFormError() {
  const errorEl = document.getElementById("form-error");
  if (errorEl) {
    errorEl.textContent = "";
  }
}

// -----------------------------------------------------------------------------
// DARK / LIGHT MODE
// The CSS already defines [data-theme="dark"] with swapped colour tokens.
// All we do here is set/remove that attribute on <body> and remember the choice.
// -----------------------------------------------------------------------------

/**
 * applyTheme(theme)
 * Sets data-theme on <body> and updates the toggle button label.
 * "dark"  → dark mode active, button offers to switch to light
 * "light" → light mode active, button offers to switch to dark
 *
 * @param {string} theme - "dark" or "light"
 */
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.setAttribute("data-theme", "dark");
    themeToggleBtn.textContent = "☀️ Light Mode";
  } else {
    document.body.removeAttribute("data-theme");
    themeToggleBtn.textContent = "🌙 Dark Mode";
  }
}

/**
 * loadTheme()
 * Reads the saved theme preference from localStorage and applies it.
 * Falls back to light mode if nothing is saved.
 */
function loadTheme() {
  const saved = localStorage.getItem(STORAGE_KEY_THEME);
  // Only "dark" is a valid stored value; anything else defaults to light
  applyTheme(saved === "dark" ? "dark" : "light");
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS
// -----------------------------------------------------------------------------

/**
 * Sort dropdown — re-renders the list in the new order whenever the user
 * changes the sort selection. Only the list is rebuilt; balance, limit, and
 * chart are unaffected because they read from transactions[] directly.
 */
sortBySelect.addEventListener("change", function() {
  renderTransactionList();
});

/**
 * Theme toggle button — flips between dark and light mode, then saves
 * the preference to localStorage so it survives a page refresh.
 */
themeToggleBtn.addEventListener("click", function() {
  // Check the current state by reading the attribute we set in applyTheme()
  var isDark = document.body.getAttribute("data-theme") === "dark";
  var newTheme = isDark ? "light" : "dark";

  applyTheme(newTheme);
  localStorage.setItem(STORAGE_KEY_THEME, newTheme);
});

/**
 * "Set Limit" button — reads the input, updates budgetLimit, persists it,
 * and re-renders the spending limit section.
 */
setLimitBtn.addEventListener("click", function() {
  const rawValue = budgetLimitInput.value.trim();
  const parsed   = Number(rawValue);

  if (rawValue === "" || isNaN(parsed) || parsed < 0) {
    // Invalid input — treat as clearing the limit
    budgetLimit = 0;
  } else {
    budgetLimit = parsed;
  }

  saveBudgetLimit();

  // Re-render just the limit section (no need to touch the list or chart)
  renderSpendingLimit();
});

/**
 * Form submit — validates inputs, then calls addTransaction().
 */
formEl.addEventListener("submit", function(event) {
  // Prevent the default browser form submission (which would reload the page)
  event.preventDefault();

  const itemName  = itemNameInput.value;
  const rawAmount = amountInput.value;
  const category  = categorySelect.value;

  // Validate before doing anything else
  const error = validateForm(itemName, rawAmount, category);
  if (error) {
    showFormError(error);
    return;
  }

  // Clear any previous error
  clearFormError();

  // Convert amount to a Number here (validation already confirmed it's valid)
  const amount = Number(rawAmount);

  // Add the transaction to state + persist + re-render
  addTransaction(itemName, amount, category);

  // Reset the form fields so the user can enter the next transaction
  formEl.reset();
});

// -----------------------------------------------------------------------------
// INITIALISATION — runs once when the page loads
// -----------------------------------------------------------------------------

/**
 * init()
 * Entry point: loads persisted data and renders the initial UI state.
 */
function init() {
  loadTransactions();
  loadBudgetLimit();
  loadTheme();

  // Pre-fill the limit input with the saved value so the user can see it
  if (budgetLimit > 0) {
    budgetLimitInput.value = budgetLimit;
  }

  renderAll();
}

// Kick everything off
init();
