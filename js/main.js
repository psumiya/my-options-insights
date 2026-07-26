/**
 * Options Trading Journal - Main Application Entry Point
 * Initializes all components and wires up UI event handlers
 * Requirements: 1.5, 3.1, 3.2, 4.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

// Application state
let dataStore;
let analyticsEngine;
let strategyDetector;
let csvParser;
let dashboardController;
let demoDataGenerator;
let tabManager;
let csvDataViewer;

// Table sorting state
let currentSortColumn = 'pl'; // Default sort by P/L
let currentSortDirection = 'desc'; // Descending by default

/**
 * Initialize application on page load
 */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize core components
  dataStore = new DataStore();
  analyticsEngine = new AnalyticsEngine();
  strategyDetector = new StrategyDetector();
  csvParser = new CSVParser();
  demoDataGenerator = new DemoDataGenerator();
  
  // Initialize dashboard controller
  dashboardController = new DashboardController(
    dataStore,
    analyticsEngine,
    strategyDetector,
    csvParser
  );
  
  // Initialize tab manager
  tabManager = new TabManager();
  
  // Initialize CSV data viewer
  csvDataViewer = new CSVDataViewer();
  
  // Make csvDataViewer available globally
  window.csvDataViewer = csvDataViewer;
  
  // Set up UI event listeners
  setupEventListeners();
  
  // Initialize dashboard (will load persisted data if available)
  dashboardController.initialize();

  // Reflect data presence in the header actions (show Clear if data loaded)
  syncHeaderActions();

  // Load and apply persisted filters (Requirement 3.2)
  loadFilters();
});

/**
 * Set up all UI event listeners
 */
function setupEventListeners() {
  // File upload button handlers
  const headerUploadBtn = document.getElementById('header-upload-btn');
  const emptyStateUploadBtn = document.getElementById('empty-state-upload-btn');
  const uploadZone = document.getElementById('upload-zone');
  const closeUploadBtn = document.getElementById('close-upload-btn');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');

  // Demo + clear data buttons
  const headerDemoBtn = document.getElementById('header-demo-btn');
  const headerClearBtn = document.getElementById('header-clear-btn');
  const emptyStateDemoBtn = document.getElementById('empty-state-demo-btn');
  
  // Filter button groups
  const filterButtons = document.querySelectorAll('.filter-btn');
  
  // Table headers for sorting
  const tableHeaders = document.querySelectorAll('#symbol-strategy-table th.sortable');
  
  // Filters toggle
  const filtersToggle = document.getElementById('filters-toggle');
  const filtersContent = document.getElementById('filters-content');
  const filtersIcon = document.getElementById('filters-icon');
  
  // Set up filters toggle
  if (filtersToggle && filtersContent && filtersIcon) {
    filtersToggle.addEventListener('click', () => {
      const isExpanded = filtersToggle.getAttribute('aria-expanded') === 'true';
      filtersToggle.setAttribute('aria-expanded', !isExpanded);
      filtersContent.classList.toggle('expanded');
      filtersIcon.classList.toggle('expanded');
    });
  }
  
  // Set up compact header on scroll
  setupCompactHeader();

  // Upload buttons (header + empty state) - show upload zone
  [headerUploadBtn, emptyStateUploadBtn].forEach(btn => {
    if (btn && uploadZone) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('hidden');
      });
    }
  });

  // Demo data buttons (header + empty state)
  [headerDemoBtn, emptyStateDemoBtn].forEach(btn => {
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDemoDataLoad();
      });
    }
  });

  // Clear data button (header)
  if (headerClearBtn) {
    headerClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm('Clear all imported trades from this browser? This cannot be undone.')) {
        dashboardController.clearData();
        dashboardController.showToast('Trade data cleared', 'success');
        syncHeaderActions();
      }
    });
  }
  
  // Close upload zone
  if (closeUploadBtn && uploadZone) {
    closeUploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadZone.classList.add('hidden');
    });
  }
  
  // Browse files button - now handled by label for="file-input"
  // No JavaScript needed - native HTML label behavior
  
  // File input change - handle file upload (Requirement 1.5)
  if (fileInput) {
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        handleFileUpload(file);
        // Reset file input
        fileInput.value = '';
      }
    });
  }
  
  // Drag and drop handlers
  if (dropZone) {
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.style.borderColor = '#3b82f6';
    });
    
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '';
    });
    
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.style.borderColor = '';
      
      const file = event.dataTransfer.files[0];
      if (file && file.type === 'text/csv') {
        handleFileUpload(file);
      } else {
        dashboardController.showToast('Please upload a CSV file', 'error');
      }
    });
    
    // Add click handler for mobile devices (iOS doesn't support drag/drop well)
    dropZone.addEventListener('click', (e) => {
      // Only trigger if not clicking the browse button/label
      if (e.target !== browseBtn && !browseBtn.contains(e.target) && e.target.id !== 'browse-btn') {
        // Trigger the label click which will open file picker
        if (browseBtn) {
          browseBtn.click();
        }
      }
    });
  }
  
  // Filter button clicks - immediate update (Requirements 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6)
  filterButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const filterType = button.getAttribute('data-filter');
      const filterValue = button.getAttribute('data-value');
      
      // Update active state for buttons in the same group
      const groupButtons = document.querySelectorAll(`[data-filter="${filterType}"]`);
      groupButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      });
      
      button.classList.add('active');
      button.setAttribute('aria-checked', 'true');
      
      // Update filter summary
      updateFilterSummary();
      
      // Trigger filter change
      handleFilterChange();
    });
  });
  
  // Table header sorting (Requirements 7.3, 7.4)
  tableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      // Get column name from data attribute or text (excluding sort indicator)
      const column = header.getAttribute('data-column') || 
                     header.textContent.replace(/[▲▼]/g, '').trim().toLowerCase();
      handleTableSort(column, header);
    });
    
    // Add keyboard support for accessibility
    header.addEventListener('keypress', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        // Get column name from data attribute or text (excluding sort indicator)
        const column = header.getAttribute('data-column') || 
                       header.textContent.replace(/[▲▼]/g, '').trim().toLowerCase();
        handleTableSort(column, header);
      }
    });
  });
}

/**
 * Handle file upload
 * @param {File} file - CSV file to upload
 */
async function handleFileUpload(file) {
  // Hide upload zone
  const uploadZone = document.getElementById('upload-zone');
  if (uploadZone) {
    uploadZone.classList.add('hidden');
  }
  
  // Load raw CSV into data viewer
  if (csvDataViewer) {
    await csvDataViewer.loadCSVFile(file);
  }
  
  // Pass to dashboard controller
  await dashboardController.handleFileUpload(file);
  
  // Enable compact header after data loads
  enableCompactHeader();

  // Reveal the Clear action now that data is loaded
  syncHeaderActions();

  // Initialize filter summary
  updateFilterSummary();
}

/**
 * Handle filter changes with immediate update
 * Requirements: 8.3, 9.6
 */
function handleFilterChange() {
  // Get active filter values from buttons
  const activeDateRangeBtn = document.querySelector('[data-filter="date-range"].active');
  const activePositionStatusBtn = document.querySelector('[data-filter="position-status"].active');
  
  const filters = {
    dateRange: {
      type: activeDateRangeBtn ? activeDateRangeBtn.getAttribute('data-value') : 'alltime',
      startDate: null, // Calculated by analytics engine
      endDate: null
    },
    positionStatus: activePositionStatusBtn ? activePositionStatusBtn.getAttribute('data-value') : 'all'
  };
  
  // Pass to dashboard controller (with debouncing)
  dashboardController.handleFilterChange(filters);
}

/**
 * Load persisted filters from data store
 * Requirement: 3.2
 */
function loadFilters() {
  const filters = dataStore.getFilters();
  
  // Set active state on filter buttons based on persisted values
  if (filters.dateRange && filters.dateRange.type) {
    const dateRangeButtons = document.querySelectorAll('[data-filter="date-range"]');
    dateRangeButtons.forEach(btn => {
      if (btn.getAttribute('data-value') === filters.dateRange.type) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });
  }
  
  if (filters.positionStatus) {
    const positionStatusButtons = document.querySelectorAll('[data-filter="position-status"]');
    positionStatusButtons.forEach(btn => {
      if (btn.getAttribute('data-value') === filters.positionStatus) {
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-checked', 'false');
      }
    });
  }
}

/**
 * Handle table sorting
 * Requirements: 7.3, 7.4
 * @param {string} column - Column name to sort by
 * @param {HTMLElement} headerElement - Header element that was clicked
 */
function handleTableSort(column, headerElement) {
  const table = document.getElementById('symbol-strategy-table');
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  // Skip if no data
  if (rows.length === 0 || rows[0].cells.length === 1) {
    return;
  }
  
  // Determine sort direction
  if (currentSortColumn === column) {
    // Toggle direction
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    // New column, default to descending for P/L and Trades, ascending for text
    currentSortColumn = column;
    currentSortDirection = (column === 'p/l' || column === 'trades') ? 'desc' : 'asc';
  }
  
  // Get column index
  const headers = Array.from(table.querySelectorAll('th'));
  const columnIndex = headers.findIndex(h => {
    const headerColumn = h.getAttribute('data-column') || 
                         h.textContent.replace(/[▲▼]/g, '').trim().toLowerCase();
    return headerColumn === column;
  });
  
  if (columnIndex === -1) return;
  
  // Sort rows
  rows.sort((a, b) => {
    let aValue = a.cells[columnIndex].textContent.trim();
    let bValue = b.cells[columnIndex].textContent.trim();
    
    // Handle numeric columns (P/L and Trades)
    if (column === 'p/l') {
      // Remove currency formatting (handle both + and - signs, $ and commas)
      aValue = parseFloat(aValue.replace(/[$+,]/g, '').replace(/^-/, '-'));
      bValue = parseFloat(bValue.replace(/[$+,]/g, '').replace(/^-/, '-'));
    } else if (column === 'trades') {
      aValue = parseInt(aValue);
      bValue = parseInt(bValue);
    }
    
    // Compare values
    let comparison = 0;
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      comparison = aValue - bValue;
    } else {
      comparison = aValue.localeCompare(bValue);
    }
    
    return currentSortDirection === 'asc' ? comparison : -comparison;
  });
  
  // Re-append rows in sorted order
  rows.forEach(row => tbody.appendChild(row));
  
  // Update sort indicators
  updateSortIndicators(headerElement);
}

/**
 * Update sort indicators on table headers
 * @param {HTMLElement} activeHeader - Currently sorted header
 */
function updateSortIndicators(activeHeader) {
  const headers = document.querySelectorAll('#symbol-strategy-table th.sortable');
  
  headers.forEach(header => {
    // Remove existing indicators
    const existingIndicator = header.querySelector('.sort-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
    
    // Add indicator to active header
    if (header === activeHeader) {
      const indicator = document.createElement('span');
      indicator.className = 'sort-indicator';
      indicator.style.marginLeft = '4px';
      indicator.style.fontSize = '10px';
      indicator.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
      header.appendChild(indicator);
    }
  });
}

/**
 * Format currency for display
 * @param {number} value - Numeric value
 * @returns {string} - Formatted currency string
 */
function formatCurrency(value) {
  const sign = value >= 0 ? '+' : '-';
  const absValue = Math.abs(value);
  return sign + '$' + absValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Handle demo data load
 * Generates and loads sample trading data
 */
function handleDemoDataLoad() {
  // Generate demo trades (100 trades over the past year)
  const demoTrades = demoDataGenerator.generate(100, 365);
  
  // Enrich trades with computed fields
  const enrichedTrades = demoTrades.map(trade => {
    // Apply strategy detection (already set, but ensure consistency)
    const detectedStrategy = strategyDetector.detect(trade);
    trade.Strategy = detectedStrategy || trade.Strategy;
    
    // Enrich with analytics
    return analyticsEngine.enrichTrade(trade);
  });
  
  // Save to data store
  try {
    dataStore.saveTrades(enrichedTrades);
  } catch (storageError) {
    console.warn('Failed to save demo data to localStorage:', storageError);
  }
  
  // Update dashboard controller
  dashboardController.enrichedTrades = enrichedTrades;
  dashboardController.showDashboard();
  dashboardController.refreshDashboard();
  
  // Show success notification
  dashboardController.showToast(
    `Successfully loaded ${enrichedTrades.length} demo trades`,
    'success'
  );
  
  // Enable compact header after data loads
  enableCompactHeader();

  // Reveal the Clear action now that data is loaded
  syncHeaderActions();
}

/**
 * Set up compact header behavior on scroll
 */
function setupCompactHeader() {
  const header = document.getElementById('main-header');
  const dashboard = document.getElementById('dashboard');
  
  if (!header || !dashboard) return;
  
  let lastScrollY = window.scrollY;
  let ticking = false;
  
  const updateHeader = () => {
    const scrollY = window.scrollY;
    const isDashboardVisible = !dashboard.classList.contains('hidden');
    
    if (isDashboardVisible && scrollY > 100) {
      header.classList.add('compact');
    } else if (scrollY < 50) {
      header.classList.remove('compact');
    }
    
    lastScrollY = scrollY;
    ticking = false;
  };
  
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateHeader);
      ticking = true;
    }
  });
}

/**
 * Enable compact header immediately after data loads
 */
function enableCompactHeader() {
  const header = document.getElementById('main-header');
  if (header) {
    // Add compact class after a short delay to allow for smooth transition
    setTimeout(() => {
      header.classList.add('compact');
    }, 300);
  }
}

/**
 * Update filter summary text
 */
function updateFilterSummary() {
  const filtersSummary = document.getElementById('filters-summary');
  if (!filtersSummary) return;
  
  const activeDateRangeBtn = document.querySelector('[data-filter="date-range"].active');
  const activePositionStatusBtn = document.querySelector('[data-filter="position-status"].active');
  
  const dateRangeText = activeDateRangeBtn ? activeDateRangeBtn.textContent : 'All';
  const positionStatusText = activePositionStatusBtn ? activePositionStatusBtn.textContent : 'All';
  
  const dateRangeMap = {
    '1W': 'Last 7 Days',
    '1M': 'Last 30 Days',
    '1Y': 'Last 12 Months',
    'YTD': 'Year to Date',
    'All': 'All Time'
  };
  
  filtersSummary.textContent = `${dateRangeMap[dateRangeText] || dateRangeText} • ${positionStatusText} Positions`;
}

/**
 * Show or hide the header "Clear" button based on whether trades are loaded.
 * The dashboard is visible exactly when there is data to clear.
 */
function syncHeaderActions() {
  const clearBtn = document.getElementById('header-clear-btn');
  const dashboard = document.getElementById('dashboard');
  if (!clearBtn || !dashboard) return;

  const hasData = !dashboard.classList.contains('hidden');
  clearBtn.classList.toggle('hidden', !hasData);
}
