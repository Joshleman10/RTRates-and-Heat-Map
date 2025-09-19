// RT Productivity Analysis JavaScript
let rtTransactionData = [];
let rawTransactionData = []; // Store raw Excel data for time range calculations
let warehouseLayoutData = {};
let processedTMData = {};
let laborHoursData = {}; // Store actual labor hours data from Labor Management System
let longTransactions = [];
let pureRTLongTransactions = []; // Track Pure RT Long transactions (from RPUT locations)
let selectedTMId = null;
let singleTransactionCoordinates = []; // Track individual transaction positions for hover events
let currentUserUsername = ''; // Store username extracted from file path for STU forms

// Data loading tracking
let hasTransactionData = false;
let hasCLMSData = false;

// Storage keys
const RT_STORAGE_KEY = 'rtRates_transactionData';
const RT_WAREHOUSE_LAYOUT_KEY = 'rtRates_warehouseLayout';

// Page refresh detection
window.addEventListener('beforeunload', () => {
  localStorage.setItem('spa_isLeaving', 'true');
});

// Function to check if both data sources are loaded and initialize the page
function checkAndInitializePage() {
  if (hasTransactionData && hasCLMSData) {
    // Both data sources are available - initialize the page
    initializeFullAnalysis();
  }
}

// Initialize full page analysis when both data sources are available
function initializeFullAnalysis() {
  // Calculate department averages
  calculateDepartmentAverages();
  
  // Display all metrics
  displayOverallMetrics();
  
  // Generate unified TM list (filtered to CLMS TMs only)
  generateUnifiedTMList();
  
  // Show sections
  document.getElementById('clearButton').style.display = 'inline-block';
  
  // Show warehouse heat map
  showWarehouseHeatMap();
  
}

// Toggle function for other TMs dropdown
function toggleOtherTMs() {
  const container = document.getElementById('otherTMsContainer');
  const arrow = document.getElementById('dropdownArrow');
  
  if (container.style.display === 'none' || container.style.display === '') {
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '1rem';
    arrow.style.transform = 'rotate(180deg)';
  } else {
    container.style.display = 'none';
    arrow.style.transform = 'rotate(0deg)';
  }
}

// Extract username from file path
function extractUsernameFromFile(file) {
  if (file) {
    // Method 1: Try webkitRelativePath (works in some browsers)
    if (file.webkitRelativePath) {
      const pathMatch = file.webkitRelativePath.match(/\\Users\\([^\\]+)\\/);
      if (pathMatch) {
        currentUserUsername = pathMatch[1];
        return;
      }
    }
    
    // Method 2: Try to extract from file name if it contains path info
    if (file.name) {
      const nameMatch = file.name.match(/Users\\([^\\]+)\\/);
      if (nameMatch) {
        currentUserUsername = nameMatch[1];
        return;
      }
    }
    
    // Method 3: Try to detect from browser environment or prompt user
    // Check if we can detect username from environment
    const envUser = detectUsernameFromEnvironment();
    if (envUser) {
      currentUserUsername = envUser;
      return;
    }
  }
  
  // Fallback: Use default or will prompt user in STU form
  currentUserUsername = '';
}

function detectUsernameFromEnvironment() {
  // Try to get username from various browser/environment methods
  try {
    // Check if we're in a specific environment that exposes user info
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      // For corporate environments, sometimes username is in localStorage or cookies
      const storedUser = localStorage.getItem('currentUser') || 
                        localStorage.getItem('username') || 
                        localStorage.getItem('stuLeaderUsername');
      if (storedUser) return storedUser;
    }
    
    // Try to extract from common Windows path patterns if available anywhere
    const pathHints = [
      document.location.href,
      window.location.pathname,
      document.referrer,
      window.location.href
    ];
    
    for (const hint of pathHints) {
      if (hint && hint.includes('Users')) {
        // Try both forward and backward slashes
        const match = hint.match(/Users[\\/]([^\\\/]+)/) || hint.match(/users[\\/]([^\\\/]+)/i);
        if (match && match[1] && match[1] !== 'Public') {
          return match[1];
        }
      }
    }
    
    // Try to extract from file:// URLs which might have the full path
    const currentUrl = window.location.href;
    if (currentUrl.includes('file://') && currentUrl.includes('Users')) {
      const match = currentUrl.match(/Users[\\/]([^\\\/]+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
    
  } catch (e) {
    // Silent fail
  }
  
  return null;
}

// Main file processing function
function handleFile(event) {
  const file = event.target.files[0];
  
  if (!file) return;
  
  // Log file details for debugging
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  console.log(`📁 Processing file: ${file.name}`);
  console.log(`📏 File size: ${fileSizeMB}MB`);
  console.log(`📅 File modified: ${new Date(file.lastModified)}`);
  
  // Warn for very large files
  if (file.size > 100 * 1024 * 1024) { // 100MB+
    console.warn(`⚠️  Large file detected (${fileSizeMB}MB) - processing may take longer`);
  }

  // Extract username from file path for STU forms
  extractUsernameFromFile(file);

  // Show loading state on upload button
  showLoadingProgress('Reading file...', 10);

  displayFileInfo(file);

  if (typeof XLSX === 'undefined') {
    showLoadingProgress('Error: XLSX library not loaded', 0, true);
    return;
  }

  const reader = new FileReader();
  
  reader.onload = function (e) {
    try {
      showLoadingProgress('Processing Excel data...', 25);
      console.log(`🔄 Started reading file at ${new Date().toISOString()}`);
      
      // Add slight delay for smoother visual progress
      setTimeout(() => {
        const data = new Uint8Array(e.target.result);
        console.log(`📦 File buffer size: ${data.length} bytes`);
        showLoadingProgress('Reading workbook...', 35);
        
        setTimeout(() => {
          try {
            console.log(`📖 Starting workbook parsing at ${new Date().toISOString()}`);
            const workbook = XLSX.read(data, { type: 'array' });
            console.log(`✅ Workbook parsed successfully. Sheets: ${workbook.SheetNames.join(', ')}`);
            showLoadingProgress('Extracting data...', 45);
            
            setTimeout(() => {
              try {
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                console.log(`📊 Converting sheet "${workbook.SheetNames[0]}" to JSON...`);
                const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
                console.log(`✅ Extracted ${rows.length} rows from Excel`);
                showLoadingProgress('Analyzing transactions...', 55);

                // Process RT transactions with progress updates
                setTimeout(() => processRTTransactions(rows), 100);
              } catch (sheetError) {
                console.error('❌ Error extracting sheet data:', sheetError);
                showLoadingProgress('Error extracting data from sheet', 0, true);
              }
            }, 200);
          } catch (workbookError) {
            console.error('❌ Error parsing workbook:', workbookError);
            showLoadingProgress('Error reading Excel workbook', 0, true);
          }
        }, 300);
      }, 200);
      
    } catch (error) {
      console.error('❌ Error processing file:', error);
      showLoadingProgress('Error processing file', 0, true);
    }
  };

  reader.onerror = function() {
    showLoadingProgress('Error reading file', 0, true);
  };

  reader.readAsArrayBuffer(file);
}

// Data status indicator functions
function showTransactionDataLoaded() {
  const checkmark = document.getElementById('transactionDataCheck');
  if (checkmark) {
    checkmark.style.display = 'inline';
    checkmark.style.visibility = 'visible';
  }
}

function showLaborDataLoaded() {
  const checkmark = document.getElementById('laborDataCheck');
  if (checkmark) {
    checkmark.style.display = 'inline';
    checkmark.style.visibility = 'visible';
  }
}

function hideTransactionDataLoaded() {
  const checkmark = document.getElementById('transactionDataCheck');
  if (checkmark) {
    checkmark.style.display = 'none';
    checkmark.style.visibility = 'hidden';
  }
}

function hideLaborDataLoaded() {
  const checkmark = document.getElementById('laborDataCheck');
  if (checkmark) {
    checkmark.style.display = 'none';
    checkmark.style.visibility = 'hidden';
  }
}

// Loading progress functions
function showLoadingProgress(message, progress, isError = false) {
  const uploadBtn = document.querySelector('.upload-btn');
  if (!uploadBtn) return;

  if (progress === 0 && !isError) {
    // Reset to normal state, preserving checkmark if it exists
    uploadBtn.innerHTML = '📂 Select Transactions File (Korber Search Transactions)<span class="data-status-checkmark" id="transactionDataCheck" style="display: none; visibility: hidden;">✅</span>';
    uploadBtn.style.background = '';
    uploadBtn.style.cursor = 'pointer';
    uploadBtn.disabled = false;
    return;
  }

  if (isError) {
    uploadBtn.innerHTML = `❌ ${message}`;
    uploadBtn.style.background = '#dc3545';
    uploadBtn.style.cursor = 'not-allowed';
    uploadBtn.disabled = true;
    
    // Reset after 3 seconds
    setTimeout(() => showLoadingProgress('', 0), 3000);
    return;
  }

  // Show progress
  uploadBtn.innerHTML = `<div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
    <span>${message}</span>
    <span>${progress}%</span>
  </div>
  <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; margin-top: 8px;">
    <div style="width: ${progress}%; height: 100%; background: white; border-radius: 2px; transition: width 0.3s ease;"></div>
  </div>`;
  
  uploadBtn.style.background = '#1E88E5';
  uploadBtn.style.cursor = 'wait';
  uploadBtn.disabled = true;
}

function displayFileInfo(file) {
  const fileInfoEl = document.getElementById('fileInfo');
  const fileNameEl = document.getElementById('fileName');
  const fileSizeEl = document.getElementById('fileSize');
  const fileDateEl = document.getElementById('fileDate');
  
  if (fileInfoEl && fileNameEl && fileSizeEl && fileDateEl) {
    fileInfoEl.style.display = 'block';
    
    fileNameEl.textContent = file.name;
    
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeInKB = (file.size / 1024).toFixed(1);
    const sizeDisplay = file.size > 1024 * 1024 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
    fileSizeEl.textContent = sizeDisplay;
    
    const fileDate = new Date(file.lastModified);
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    fileDateEl.textContent = `Modified: ${fileDate.toLocaleDateString(undefined, options)}`;
  }
}

function processRTTransactions(rawData) {
  console.log(`🚀 processRTTransactions started with ${rawData.length} rows at ${new Date().toISOString()}`);
  showLoadingProgress('Processing transactions...', 65);
  
  // Store raw data globally for time range calculations
  rawTransactionData = rawData;
  
  // Log sample data structure for debugging
  if (rawData.length > 0) {
    console.log('📋 Sample row structure:', Object.keys(rawData[0]));
    console.log('📋 First row data:', rawData[0]);
  } else {
    console.warn('⚠️  No data rows found in Excel file');
    return;
  }
  
  // Valid pickup zones for 211 transactions
  const validPickupZones = ['REC6701', 'REC7401', 'REC7201', 'REC7701', 'RECVASOUT', 
                           'REC5401', 'IBCONT01', 'IBCONT02', 'IBPS1', 'IBPS2', 'IBVC', 'BPFLIP'];
  
  showLoadingProgress('Filtering transactions...', 70);
  console.log(`🔍 Starting to filter ${rawData.length} transactions...`);
  
  // Filter for 211 and 212 transactions with additional validation
  const filteredTransactions = rawData.filter(row => {
    const transactionType = row["Transaction Type"] || row["A"] || "";  // Column A
    const fromLocation = (row["From Location"] || row["L"] || "").toString().toUpperCase();
    const toLocation = (row["To Location"] || row["P"] || "").toString().toUpperCase();
    
    // Must be 211 or 212 transaction
    const validTransactionType = transactionType === 211 || transactionType === 212 || 
                                transactionType === "211" || transactionType === "212";
    
    // Must not contain CART, MOVEXX, or OBPB in either location (OBPB = non-RT operations)
    const validLocations = !fromLocation.includes('CART') && 
                          !fromLocation.includes('MOVEXX') && 
                          !fromLocation.includes('OBPB') &&
                          !toLocation.includes('CART') && 
                          !toLocation.includes('MOVEXX') &&
                          !toLocation.includes('OBPB');
    
    // Additional validation for 211 transactions - must start from valid pickup zones
    if (transactionType === 211 || transactionType === "211") {
      const isValidPickupZone = validPickupZones.some(zone => fromLocation.includes(zone));
      return validTransactionType && validLocations && isValidPickupZone;
    }

    // 212 transactions must come from RPUT locations (filter out troubleshooting/one-off transactions)
    if (transactionType === 212 || transactionType === "212") {
      const isFromRPUT = fromLocation.startsWith('RPUT');
      return validTransactionType && validLocations && isFromRPUT;
    }

    return validTransactionType && validLocations;
  });

  // Count how many 212 transactions were filtered out for not being from RPUT
  const total212s = rawData.filter(row => {
    const transactionType = row["Transaction Type"] || row["A"] || "";
    return transactionType === 212 || transactionType === "212";
  }).length;

  const rput212s = filteredTransactions.filter(row => {
    const transactionType = row["Transaction Type"] || row["A"] || "";
    return transactionType === 212 || transactionType === "212";
  }).length;

  const filteredOut212s = total212s - rput212s;

  console.log(`✅ Filtered to ${filteredTransactions.length} valid transactions (from ${rawData.length} total)`);
  console.log(`🔍 212 Transaction filtering: ${rput212s} RPUT transactions kept, ${filteredOut212s} non-RPUT transactions filtered out`);
  
  if (filteredTransactions.length === 0) {
    console.error('❌ No valid transactions found after filtering!');
    console.log('🔍 Debugging info for first 3 rows:');
    rawData.slice(0, 3).forEach((row, i) => {
      const transactionType = row["Transaction Type"] || row["A"] || "";
      console.log(`Row ${i + 1}:`, {
        transactionType: transactionType,
        fromLocation: row["From Location"] || row["L"],
        toLocation: row["To Location"] || row["P"]
      });
    });
    showLoadingProgress('No valid transactions found', 0, true);
    return;
  }

  setTimeout(() => {
    showLoadingProgress('Matching transaction pairs...', 75);
    
    // Process and match 211-212 pairs by From LP
    const processedTransactions = matchTransactionPairs(filteredTransactions);
    
    setTimeout(() => {
      showLoadingProgress('Calculating metrics...', 82);
      
      // Group by Employee ID and calculate metrics
      groupByEmployeeAndCalculateMetrics(processedTransactions);
      
      setTimeout(() => {
        showLoadingProgress('Processing data...', 87);
        
        // Show labor hours section after TM data is processed
        onTMDataProcessed();
        
        // Save to localStorage
        rtTransactionData = processedTransactions;
        localStorage.setItem(RT_STORAGE_KEY, JSON.stringify(rtTransactionData));

        // ✅ CONFIRMATION: All transactions should now be RPUT-based
        console.log('✅ CONFIRMING RPUT-ONLY FILTERING RESULTS:');

        let rputCount = 0;
        let nonRputCount = 0;
        const rputSample = [];

        rtTransactionData.forEach(transaction => {
          const fromLocation = (transaction.putaway.fromLocation || "").toString().toUpperCase();

          if (fromLocation.startsWith('RPUT')) {
            rputCount++;
            if (rputSample.length < 5) {
              rputSample.push({
                fromLocation: fromLocation,
                toLocation: transaction.putaway.toLocation,
                employeeId: transaction.putaway.employeeId,
                timeToExecute: transaction.putaway.timeToExecute
              });
            }
          } else {
            nonRputCount++;
            console.warn(`⚠️  Unexpected non-RPUT transaction found: ${fromLocation} → ${transaction.putaway.toLocation}`);
          }
        });

        console.log(`📊 FINAL TRANSACTION SUMMARY:`);
        console.log(`✅ All transactions are RPUT-based: ${rputCount} transactions`);
        if (nonRputCount > 0) {
          console.error(`❌ ERROR: ${nonRputCount} non-RPUT transactions found despite filtering!`);
        }

        console.log('\n✅ RPUT TRANSACTION SAMPLE:');
        console.table(rputSample);
        
        // Set transaction data flag
        hasTransactionData = true;
        
        setTimeout(() => {
          showLoadingProgress('Analyzing long transactions...', 92);
          
          // Detect long transactions (needed for analysis)
          detectLongTransactions();
          
          setTimeout(() => {
            showLoadingProgress('Finalizing...', 97);
            
            // Check if both data sources are available and initialize if ready
            checkAndInitializePage();
            
            setTimeout(() => {
              // Complete loading
              showLoadingProgress('Processing complete!', 100);
              
              // Reset button after 2 seconds, then show checkmark
              setTimeout(() => {
                showLoadingProgress('', 0);
                // Show checkmark after loading bar is completely done
                showTransactionDataLoaded();
              }, 2000);
            }, 200);
          }, 300);
        }, 400);
      }, 300);
    }, 400);
  }, 300);
}

function matchTransactionPairs(filteredTransactions) {
  // Separate 211 and 212 transactions
  const transaction211s = filteredTransactions.filter(t => {
    const type = t["Transaction Type"] || t["A"] || "";
    return type === 211 || type === "211";
  });
  
  const transaction212s = filteredTransactions.filter(t => {
    const type = t["Transaction Type"] || t["P"] || "";
    return type === 212 || type === "212";
  });
  
  const pairedTransactions = [];
  const unmatchedTransactions = [];
  
  // Match 211s with 212s by From LP
  transaction212s.forEach(t212 => {
    const fromLP = t212["From LP"] || t212["M"] || "";  // Column M
    
    if (!fromLP) {
      unmatchedTransactions.push({
        ...t212,
        matchStatus: 'No From LP',
        transactionType: 212
      });
      return;
    }
    
    // Find matching 211 transaction
    const matching211 = transaction211s.find(t211 => {
      const t211_fromLP = t211["From LP"] || t211["M"] || "";
      return t211_fromLP === fromLP;
    });
    
    if (matching211) {
      // Create paired transaction
      const pairedTransaction = {
        // 211 Transaction (Pick up from dock)
        pickup: {
          employeeId: matching211["Employee ID"] || matching211["G"] || "",
          fromLocation: matching211["From Location"] || matching211["L"] || "",
          toLocation: matching211["To Location"] || matching211["P"] || "",
          startDate: matching211["Start Date"] || "",
          startTime: matching211["Start Time"] || "",
          timeToExecute: parseFloat(matching211["Time to Execute"] || 0),
          itemNumber: matching211["Item Number"] || "",
          quantity: parseInt(matching211["Quantity"] || 0)
        },
        // 212 Transaction (Putaway)
        putaway: {
          employeeId: t212["Employee ID"] || t212["G"] || "",
          fromLocation: t212["From Location"] || t212["L"] || "",
          toLocation: t212["To Location"] || t212["P"] || "",
          startDate: t212["Start Date"] || "",
          startTime: t212["Start Time"] || "",
          timeToExecute: parseFloat(t212["Time to Execute"] || 0),
          itemNumber: t212["Item Number"] || "",
          quantity: parseInt(t212["Quantity"] || 0)
        },
        fromLP: fromLP,
        totalTime: (parseFloat(matching211["Time to Execute"] || 0) + parseFloat(t212["Time to Execute"] || 0)),
        isMatched: true
      };
      
      pairedTransactions.push(pairedTransaction);
    } else {
      unmatchedTransactions.push({
        ...t212,
        matchStatus: 'No matching 211',
        transactionType: 212
      });
    }
  });
  
  
  return pairedTransactions;
}

function groupByEmployeeAndCalculateMetrics(transactions) {
  
  processedTMData = {};
  
  transactions.forEach(transaction => {
    // Use putaway employee ID as primary (212 transaction)
    const employeeId = transaction.putaway.employeeId;
    
    if (!employeeId || employeeId.trim() === '') return;
    
    if (!processedTMData[employeeId]) {
      processedTMData[employeeId] = {
        employeeId: employeeId,
        totalPutaways: 0,
        totalTime: 0,
        totalTravelAisles: 0,
        totalTravelDepth: 0,
        totalRackHeight: 0,
        longTransactionCount: 0,
        transactions: [],
        performanceMetrics: {
          avgPutawayRate: 0,
          avgTravelAisles: 0,
          avgTravelDepth: 0,
          avgRackHeight: 0,
          longTransactionPercent: 0
        }
      };
    }
    
    const tmData = processedTMData[employeeId];
    tmData.transactions.push(transaction);
    tmData.totalPutaways++;
    tmData.totalTime += transaction.totalTime;
    
    // Calculate travel metrics
    const travelMetrics = calculateTravelMetrics(transaction);
    
    // Add safeguards against NaN values
    const aislesTraversed = isNaN(travelMetrics.aislesTraversed) ? 0 : (travelMetrics.aislesTraversed || 0);
    const bayDepth = isNaN(travelMetrics.bayDepth) ? 0 : (travelMetrics.bayDepth || 0);
    const rackLevel = isNaN(travelMetrics.rackLevel) ? 0 : (travelMetrics.rackLevel || 0);
    
    tmData.totalTravelAisles += aislesTraversed;
    tmData.totalTravelDepth += bayDepth;
    tmData.totalRackHeight += rackLevel;
    
    // Check for long transactions (>10 minutes) - only look at 212 (putaway) time
    const putawayTime = transaction.putaway.timeToExecute; // 212 transaction time only
    if (putawayTime > 600) { // 600 seconds = 10 minutes
      tmData.longTransactionCount++;
      const longTransactionData = {
        ...transaction,
        employeeId: employeeId,
        putawayTimeMinutes: (putawayTime / 60).toFixed(2),
        totalTimeMinutes: (transaction.totalTime / 60).toFixed(2) // Keep total for reference
      };
      
      longTransactions.push(longTransactionData);
      
      // Check if this is a Pure RT Long transaction (212 transaction with "from location" starting with RPUT)
      const fromLocation = (transaction.putaway.fromLocation || "").toString().toUpperCase();
      if (fromLocation.startsWith('RPUT')) {
        pureRTLongTransactions.push(longTransactionData);
      }
    }
  });
  
  // Calculate averages for each TM
  Object.keys(processedTMData).forEach(employeeId => {
    const tmData = processedTMData[employeeId];
    const count = tmData.totalPutaways;
    
    if (count > 0) {
      const avgTravelAisles = tmData.totalTravelAisles / count;
      const avgTravelDepth = tmData.totalTravelDepth / count;
      const avgRackHeight = tmData.totalRackHeight / count;
      
      // Calculate estimated travel time based on average travel metrics
      const travelTimeResult = calculateEstimatedTravelTime(avgTravelAisles, avgTravelDepth, avgRackHeight);
      
      tmData.performanceMetrics = {
        avgPutawayRate: (3600 / (tmData.totalTime / count)).toFixed(2), // Putaways per hour
        avgTravelAisles: avgTravelAisles.toFixed(1),
        avgTravelDepth: avgTravelDepth.toFixed(1),
        avgRackHeight: avgRackHeight.toFixed(1),
        avgEstimatedTravelTime: travelTimeResult.totalEstimatedMinutes.toFixed(2), // Average estimated travel time in minutes
        longTransactionPercent: ((tmData.longTransactionCount / count) * 100).toFixed(1)
      };
    }
  });
  
}

function calculateTravelMetrics(transaction) {
  // Use the warehouse-calculations module if available
  if (typeof calculatePutawayTravelMetrics === 'function') {
    const warehouseTravelMetrics = calculatePutawayTravelMetrics(transaction);
    if (warehouseTravelMetrics && warehouseTravelMetrics.metrics) {
      return {
        aislesTraversed: warehouseTravelMetrics.metrics.aislesTraversed,
        bayDepth: warehouseTravelMetrics.metrics.bayDepth,
        rackLevel: warehouseTravelMetrics.metrics.rackHeight
      };
    }
  }
  
  // Fallback to basic calculation if warehouse mapping not available
  const fromLocation = transaction.pickup.fromLocation; // Where RT picks up FROM
  const toLocation = transaction.putaway.toLocation;     // Where RT puts away TO
  
  // Basic fallback parsing for RPUT014A01A format
  const parseLocationBasic = (locationStr) => {
    if (!locationStr) return null;
    
    // Handle pickup zones (IBDZ05, etc)
    if (locationStr.match(/^[A-Z]{4,}\d{2}$/)) {
      const aisleMatch = locationStr.match(/\d{2}$/);
      return {
        aisle: aisleMatch ? parseInt(aisleMatch[0]) : 0,
        bay: 0,
        level: 0
      };
    }
    
    // Handle putaway locations (RPUT014A01A)
    const match = locationStr.match(/([A-Z]+)(\d{3})([A-Z])(\d{2})([A-Z])/);
    if (match) {
      return {
        aisle: parseInt(match[2]),
        bay: match[3].charCodeAt(0) - 65, // A=0, B=1, etc
        level: match[5].charCodeAt(0) - 65 + 1 // A=1, B=2, etc
      };
    }
    return { aisle: 0, bay: 0, level: 0 };
  };
  
  const from = parseLocationBasic(fromLocation);
  const to = parseLocationBasic(toLocation);
  
  // Ensure all values are valid numbers
  const aislesTraversed = Math.abs((to?.aisle || 0) - (from?.aisle || 0));
  const bayDepth = Math.abs((to?.bay || 0) - (from?.bay || 0));
  const rackLevel = to?.level || 0;
  
  // Calculate estimated travel time
  const travelTimeResult = calculateEstimatedTravelTime(aislesTraversed, bayDepth, rackLevel);
  const estimatedTravelTime = travelTimeResult.totalEstimatedMinutes;

  return {
    aislesTraversed: isNaN(aislesTraversed) ? 0 : aislesTraversed,
    bayDepth: isNaN(bayDepth) ? 0 : bayDepth,
    rackLevel: isNaN(rackLevel) ? 0 : rackLevel,
    estimatedTravelTime: estimatedTravelTime
  };
}

function calculateEstimatedTravelTime(avgAisles, avgBays, avgHeight) {
  // Constants for travel time calculation
  const HORIZONTAL_SPEED_FPS = 7.33;     // 5 MPH = 7.33 feet per second
  const LIFT_SPEED_FPS = 2.93;           // 2 MPH = 2.93 feet per second
  const BAY_DISTANCE_FT = 10.5;          // Each bay is 10.5 ft
  const AISLE_DISTANCE_FT = 10.5;        // Each aisle is 10.5 ft  
  const RACK_LEVEL_HEIGHT_FT = 6;        // Each rack level is 72 inches (6 ft)
  
  // Calculate distances based on averages
  const totalHorizontalDistance = (avgAisles * AISLE_DISTANCE_FT) + (avgBays * BAY_DISTANCE_FT);
  const totalVerticalDistance = avgHeight * RACK_LEVEL_HEIGHT_FT;
  
  // Calculate time in seconds, then convert to minutes
  const horizontalTimeSeconds = totalHorizontalDistance / HORIZONTAL_SPEED_FPS;
  const verticalTimeSeconds = totalVerticalDistance / LIFT_SPEED_FPS;
  
  // Add horizontal and vertical time together (sequential travel)
  const totalTimeSeconds = horizontalTimeSeconds + verticalTimeSeconds;
  const totalTimeMinutes = totalTimeSeconds / 60;
  
  
  return {
    horizontalTimeMinutes: horizontalTimeSeconds / 60,
    verticalTimeMinutes: verticalTimeSeconds / 60,
    totalEstimatedMinutes: totalTimeMinutes,
    horizontalDistanceFt: totalHorizontalDistance,
    verticalDistanceFt: totalVerticalDistance
  };
}

function getLevelHeight(levelCode) {
  // Convert level codes to numeric height values
  // A1=1, A2=2, B1=3, B2=4, C1=5, C2=6, etc.
  const levelMap = {
    'A1': 1, 'A2': 2, 'A3': 3, 'A4': 4,
    'B1': 3, 'B2': 4, 'B3': 5, 'B4': 6,
    'C1': 5, 'C2': 6, 'C3': 7, 'C4': 8,
    'D1': 7, 'D2': 8, 'D3': 9, 'D4': 10
  };
  
  return levelMap[levelCode] || 1;
}

function displayOverallMetrics() {
  const totalTMs = Object.keys(processedTMData).length;
  const totalTransactions = rtTransactionData.length;
  const totalLongTransactions = longTransactions.length;
  
  // Calculate overall averages - use total transactions / total hours from CLMS data
  let totalCLMSTransactions = 0;
  let totalCLMSHours = 0;
  let totalTravelAisles = 0;
  let totalTravelDepth = 0;
  let totalRackHeight = 0;
  let totalEstimatedTravelTime = 0;
  let tmsWithCLMSData = 0;
  
  Object.values(processedTMData).forEach(tmData => {
    const hasLaborData = tmData.actualLaborHours !== undefined;
    
    // Only include TMs with CLMS data in the totals
    if (hasLaborData && tmData.laborSystemTPH) {
      // Find the matching labor record to get totalTransactions and totalHours
      const matchingLaborRecord = Object.values(laborHoursData || {}).find(record => 
        record.totalHours === tmData.actualLaborHours && record.tph === tmData.laborSystemTPH
      );
      
      if (matchingLaborRecord) {
        totalCLMSTransactions += matchingLaborRecord.totalTransactions || 0;
        totalCLMSHours += matchingLaborRecord.totalHours || 0;
        tmsWithCLMSData++;
      }
    }
    
    totalTravelAisles += parseFloat(tmData.performanceMetrics.avgTravelAisles);
    totalTravelDepth += parseFloat(tmData.performanceMetrics.avgTravelDepth);
    totalRackHeight += parseFloat(tmData.performanceMetrics.avgRackHeight);
    totalEstimatedTravelTime += parseFloat(tmData.performanceMetrics.avgEstimatedTravelTime);
  });
  
  // Calculate TPH as total transactions / total hours (matches CLMS calculation)
  const avgPutawayRate = totalCLMSHours > 0 ? (totalCLMSTransactions / totalCLMSHours).toFixed(2) : '0.00';
  const avgTravelAisles = totalTMs > 0 ? (totalTravelAisles / totalTMs).toFixed(1) : '0.0';
  const avgTravelDepth = totalTMs > 0 ? (totalTravelDepth / totalTMs).toFixed(1) : '0.0';
  const avgRackHeight = totalTMs > 0 ? (totalRackHeight / totalTMs).toFixed(1) : '0.0';
  const avgEstimatedTravelTime = totalTMs > 0 ? (totalEstimatedTravelTime / totalTMs).toFixed(2) : '0.00';
  
  // Find TM with lowest TPH
  let lowestTPHTM = 'N/A';
  let lowestTPH = Infinity;
  
  // Find TM with most long transactions
  let mostLongTxTM = 'N/A';
  let maxLongTxCount = 0;
  
  Object.entries(processedTMData).forEach(([employeeId, tmData]) => {
    const hasLaborData = tmData.actualLaborHours !== undefined;
    
    // Only consider TMs with CLMS data for TPH comparison
    if (hasLaborData && tmData.actualLaborHours > 0) {
      // Use CLMS TPH if available, otherwise calculated rate
      const tph = tmData.laborSystemTPH || tmData.actualPutawayRate;
      if (tph < lowestTPH) {
        lowestTPH = tph;
        lowestTPHTM = `${employeeId} (${tph.toFixed(1)} TPH)`;
      }
    }
    
    // Count long transactions for this TM from the global longTransactions array
    const longTxCount = longTransactions.filter(lt => lt.putaway.employeeId === employeeId).length;
    if (longTxCount > maxLongTxCount) {
      maxLongTxCount = longTxCount;
      mostLongTxTM = `${employeeId} (${longTxCount} LTs)`;
    }
  });
  
  // Calculate average transaction time from all Excel transactions (convert seconds to minutes)
  const avgTransactionTime = rtTransactionData.length > 0 ?
    (rtTransactionData.reduce((sum, t) => sum + (parseFloat(t.putaway.timeToExecute) / 60), 0) / rtTransactionData.length).toFixed(1) :
    '0.0';
  
  // Calculate average long transaction time (using 212 putaway time only)
  const avgLongTransactionTime = longTransactions.length > 0 ?
    (longTransactions.reduce((sum, t) => sum + parseFloat(t.putawayTimeMinutes), 0) / longTransactions.length).toFixed(1) :
    '0.0';
  
  // Update display
  updateElement('totalTransactions', `Total RT Transactions: ${totalTransactions}`);
  updateElement('totalTMs', `Active Team Members: ${totalTMs}`);
  updateElement('avgTransactionsPerTM', `Avg Transactions per TM: ${totalTMs > 0 ? (totalTransactions / totalTMs).toFixed(1) : '0.0'}`);
  updateElement('avgTransactionTime', `Avg Transaction Time: ${avgTransactionTime} minutes`);
  
  updateElement('avgPutawayRate', `Avg Putaway Rate: ${avgPutawayRate} per hour`);
  updateElement('avgTravelDistance', `Avg Aisle Travel: ${avgTravelAisles} aisles`);
  updateElement('avgTravelDepth', `Avg Bay Depth: ${avgTravelDepth} bays`);
  updateElement('avgRackHeight', `Avg Rack Height: ${avgRackHeight} ${getHeightLevelLetter(Math.round(parseFloat(avgRackHeight)))}`);
  updateElement('avgEstimatedTravelTime', `Avg Est Raw Travel Time: ${avgEstimatedTravelTime} minutes`);
  
  updateElement('longTransactionCount', `Long Transactions (>10min): ${totalLongTransactions}`);
  updateElement('longTransactionPercent', `Long Transaction % (of 212s): ${totalTransactions > 0 ? ((totalLongTransactions / totalTransactions) * 100).toFixed(1) : '0.0'}%`);
  updateElement('avgLongTransactionTime', `Avg Long Transaction Time: ${avgLongTransactionTime} minutes`);
  
  // Pure RT Long transactions metric
  const totalPureRTLongTransactions = pureRTLongTransactions.length;
  const pureRTLongTransactionPercent = totalTransactions > 0 ? ((totalPureRTLongTransactions / totalTransactions) * 100).toFixed(1) : '0.0';
  updateElement('pureRTLongTransactionCount', `Pure RT Long Transactions (RPUT >10min): ${totalPureRTLongTransactions}`);
  updateElement('pureRTLongTransactionPercent', `Pure RT Long Transaction % (of total RT): ${pureRTLongTransactionPercent}%`);
  
  updateElement('lowestTPHTM', `Lowest TPH: ${lowestTPHTM}`);
  updateElement('mostLongTxTM', `Most Long Transactions: ${mostLongTxTM}`);
  
  // Update date range
  updateDateRange();
}

function updateElement(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function updateDateRange() {
  if (rtTransactionData.length === 0) return;
  
  const dates = rtTransactionData
    .map(t => new Date(t.putaway.startDate))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => a - b);
  
  if (dates.length > 0) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const minDate = dates[0].toLocaleDateString(undefined, options);
    const maxDate = dates[dates.length - 1].toLocaleDateString(undefined, options);
    // Find first 212 and last 212 transactions for time range using original column D data
    const rawTransaction212s = rawTransactionData.filter(row => {
      const transactionType = row["Transaction Type"] || row["A"] || "";
      return transactionType === 212 || transactionType === "212";
    });
    
    let timeRange = '';
    if (rawTransaction212s.length > 0) {
      // Sort by column D (Transaction Date/Time) to find first and last
      const sortedTransactions = rawTransaction212s.sort((a, b) => {
        const dateA = new Date(a["Transaction Date/Time"] || a["D"] || a[3]);
        const dateB = new Date(b["Transaction Date/Time"] || b["D"] || b[3]);
        return dateA.getTime() - dateB.getTime();
      });
      
      const firstTransaction = sortedTransactions[0];
      const lastTransaction = sortedTransactions[sortedTransactions.length - 1];
      
      const firstDateTime = new Date(firstTransaction["Transaction Date/Time"] || firstTransaction["D"] || firstTransaction[3]);
      const lastDateTime = new Date(lastTransaction["Transaction Date/Time"] || lastTransaction["D"] || lastTransaction[3]);
      
      if (!isNaN(firstDateTime.getTime()) && !isNaN(lastDateTime.getTime())) {
        const startTime = firstDateTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        const endTime = lastDateTime.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        
        timeRange = `${startTime} - ${endTime}`;
      }
    }
    
    // Update the new date-time range display
    const dateTimeElement = document.getElementById('dateTimeRange');
    if (dateTimeElement) {
      const infoContent = dateTimeElement.querySelector('.info-content');
      if (infoContent) {
        infoContent.innerHTML = `${minDate} — ${maxDate}${timeRange ? '<br><small style="color: #6c757d; font-size: 0.9rem;">Time: ' + timeRange + '</small>' : ''}`;
      }
    }
  }
}

function setupTMSelection() {
  // TM Selection functionality has been removed - replaced with unified card view
  // This function is kept as a stub to avoid breaking existing calls
  return;
}

// Function to repopulate TM selector (used when labor hours are integrated)
function populateTMSelector() {
  setupTMSelection();
}

function displayIndividualTMMetrics(employeeId) {
  const tmData = processedTMData[employeeId];
  if (!tmData) return;
  
  // Hide overall, show individual
  document.getElementById('overallMetrics').style.display = 'none';
  document.getElementById('overallCharts').style.display = 'none';
  document.getElementById('individualMetrics').style.display = 'block';
  // Show heat map instead of individual charts
  showWarehouseHeatMap();
  
  // Update individual metrics display
  updateElement('selectedTMName', `${employeeId} Performance Analysis`);
  
  // Show both estimated and actual rates if labor hours are available
  const hasLaborData = tmData.actualLaborHours !== undefined;
  if (hasLaborData) {
    updateElement('tmPutawayRate', `Putaway Rate: ${tmData.actualPutawayRate.toFixed(1)} per hour (Actual) | ${tmData.performanceMetrics.avgPutawayRate} per hour (Estimated)`);
    updateElement('tmTotalPutaways', `Total Putaways: ${tmData.totalPutaways} | Labor Hours: ${tmData.actualLaborHours} hours`);
  } else {
    updateElement('tmPutawayRate', `Putaway Rate: ${tmData.performanceMetrics.avgPutawayRate} per hour (Estimated - no labor data)`);
    updateElement('tmTotalPutaways', `Total Putaways: ${tmData.totalPutaways}`);
  }
  
  updateElement('tmAvgTimePerPutaway', `Avg Time per Putaway: ${(tmData.totalTime / tmData.totalPutaways / 60).toFixed(1)} minutes`);
  
  updateElement('tmAvgAisleTravel', `Avg Aisle Travel: ${tmData.performanceMetrics.avgTravelAisles} aisles`);
  updateElement('tmAvgBayDepth', `Avg Bay Depth: ${tmData.performanceMetrics.avgTravelDepth} bays`);
  updateElement('tmAvgRackHeight', `Avg Rack Height: ${tmData.performanceMetrics.avgRackHeight} ${getHeightLevelLetter(Math.round(parseFloat(tmData.performanceMetrics.avgRackHeight)))}`);
  updateElement('tmAvgEstimatedTravelTime', `Avg Est Raw Travel Time: ${tmData.performanceMetrics.avgEstimatedTravelTime} minutes`);
  
  updateElement('tmLongTransactions', `Long Transactions: ${tmData.longTransactionCount}`);
  updateElement('tmLongTransactionPercent', `Long Transaction %: ${tmData.performanceMetrics.longTransactionPercent}%`);
  
  // Find worst transaction
  const worstTransaction = tmData.transactions
    .sort((a, b) => b.totalTime - a.totalTime)[0];
  const worstTime = worstTransaction ? (worstTransaction.totalTime / 60).toFixed(1) : 'N/A';
  updateElement('tmWorstTransaction', `Longest Transaction: ${worstTime} minutes`);
  
  // Create individual charts
  createIndividualTMCharts(employeeId, tmData);
}

function displayOverallView() {
  // Show overall metrics 
  document.getElementById('overallMetrics').style.display = 'flex';
  // Show heat map instead of overall charts
  showWarehouseHeatMap();
  // Individual metrics section was removed
  
  selectedTMId = null;
  // TM selector elements were removed
}

function createOverallCharts() {
  if (typeof Chart === 'undefined') {
    return;
  }
  
  createTMPerformanceChart();
  createTravelAnalysisChart();
}

function createTMPerformanceChart() {
  const canvas = document.getElementById('tmPerformanceCanvas');
  if (!canvas) return;
  
  if (canvas.chart) canvas.chart.destroy();
  
  const tmNames = Object.keys(processedTMData);
  const putawayRates = tmNames.map(id => parseFloat(processedTMData[id].performanceMetrics.avgPutawayRate));
  const longTransactionPercents = tmNames.map(id => parseFloat(processedTMData[id].performanceMetrics.longTransactionPercent));
  
  canvas.chart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: tmNames,
      datasets: [
        {
          label: 'Putaway Rate (PPH)',
          data: putawayRates,
          backgroundColor: 'rgba(23, 162, 184, 0.7)',
          borderColor: 'rgba(23, 162, 184, 1)',
          borderWidth: 1,
          yAxisID: 'y'
        },
        {
          label: 'Long Transaction %',
          data: longTransactionPercents,
          backgroundColor: 'rgba(220, 53, 69, 0.7)',
          borderColor: 'rgba(220, 53, 69, 1)',
          borderWidth: 1,
          type: 'line',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Team Member Performance Overview'
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Putaways per Hour' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Long Transaction %' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function createTravelAnalysisChart() {
  const canvas = document.getElementById('travelAnalysisCanvas');
  if (!canvas) return;
  
  if (canvas.chart) canvas.chart.destroy();
  
  const tmNames = Object.keys(processedTMData);
  const aisleTravel = tmNames.map(id => parseFloat(processedTMData[id].performanceMetrics.avgTravelAisles));
  const bayDepth = tmNames.map(id => parseFloat(processedTMData[id].performanceMetrics.avgTravelDepth));
  const rackHeight = tmNames.map(id => parseFloat(processedTMData[id].performanceMetrics.avgRackHeight));
  
  canvas.chart = new Chart(canvas.getContext('2d'), {
    type: 'radar',
    data: {
      labels: tmNames,
      datasets: [
        {
          label: 'Avg Aisle Travel',
          data: aisleTravel,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.2)',
          pointBackgroundColor: 'rgba(40, 167, 69, 1)'
        },
        {
          label: 'Avg Bay Depth',
          data: bayDepth,
          borderColor: 'rgba(255, 193, 7, 1)',
          backgroundColor: 'rgba(255, 193, 7, 0.2)',
          pointBackgroundColor: 'rgba(255, 193, 7, 1)'
        },
        {
          label: 'Avg Rack Height',
          data: rackHeight,
          borderColor: 'rgba(253, 126, 20, 1)',
          backgroundColor: 'rgba(253, 126, 20, 0.2)',
          pointBackgroundColor: 'rgba(253, 126, 20, 1)'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: 'Team Member Travel Patterns'
        }
      }
    }
  });
}

function createIndividualTMCharts(employeeId, tmData) {
  createTMDailyChart(employeeId, tmData);
  createTMIssueChart(employeeId, tmData);
}

function createTMDailyChart(employeeId, tmData) {
  const canvas = document.getElementById('tmDailyCanvas');
  if (!canvas) return;
  
  if (canvas.chart) canvas.chart.destroy();
  
  // Group transactions by date
  const dailyData = {};
  tmData.transactions.forEach(transaction => {
    const date = transaction.putaway.startDate;
    if (!dailyData[date]) {
      dailyData[date] = { count: 0, totalTime: 0 };
    }
    dailyData[date].count++;
    dailyData[date].totalTime += transaction.totalTime;
  });
  
  const dates = Object.keys(dailyData).sort();
  const dailyCounts = dates.map(date => dailyData[date].count);
  const dailyRates = dates.map(date => {
    const avgTime = dailyData[date].totalTime / dailyData[date].count;
    return (3600 / avgTime).toFixed(1); // Putaways per hour
  });
  
  canvas.chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Daily Putaway Count',
          data: dailyCounts,
          borderColor: 'rgba(23, 162, 184, 1)',
          backgroundColor: 'rgba(23, 162, 184, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Daily Rate (PPH)',
          data: dailyRates,
          borderColor: 'rgba(40, 167, 69, 1)',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${employeeId} - Daily Performance Trend`
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Putaway Count' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Rate (PPH)' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function createTMIssueChart(employeeId, tmData) {
  const canvas = document.getElementById('tmIssueCanvas');
  if (!canvas) return;
  
  if (canvas.chart) canvas.chart.destroy();
  
  // Group transactions by time ranges
  const timeRanges = {
    'Under 5 min': 0,
    '5-10 min': 0,
    '10-15 min': 0,
    '15-20 min': 0,
    'Over 20 min': 0
  };
  
  tmData.transactions.forEach(transaction => {
    const timeInMinutes = transaction.totalTime / 60;
    if (timeInMinutes < 5) timeRanges['Under 5 min']++;
    else if (timeInMinutes < 10) timeRanges['5-10 min']++;
    else if (timeInMinutes < 15) timeRanges['10-15 min']++;
    else if (timeInMinutes < 20) timeRanges['15-20 min']++;
    else timeRanges['Over 20 min']++;
  });
  
  const labels = Object.keys(timeRanges);
  const data = Object.values(timeRanges);
  const backgroundColors = [
    'rgba(40, 167, 69, 0.8)',   // Green - good
    'rgba(255, 193, 7, 0.8)',   // Yellow - acceptable
    'rgba(253, 126, 20, 0.8)',  // Orange - concerning
    'rgba(220, 53, 69, 0.8)',   // Red - problematic
    'rgba(108, 117, 125, 0.8)'  // Gray - very problematic
  ];
  
  canvas.chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderColor: '#fff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${employeeId} - Transaction Time Distribution`
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  });
}

function detectLongTransactions() {
  if (longTransactions.length > 0) {
    // Long transactions section removed - data is now shown in TM cards
    
    // No UI updates needed - long transaction data is integrated into TM cards
  }
}

function displayLongTransactionsTable() {
  const container = document.getElementById('longTransactionsTable');
  if (!container) return;
  
  // Sort by time (longest first)
  const sortedLongTransactions = longTransactions.sort((a, b) => 
    parseFloat(b.totalTimeMinutes) - parseFloat(a.totalTimeMinutes)
  );
  
  let tableHTML = `
    <table class="transaction-table">
      <thead>
        <tr>
          <th>Employee ID</th>
          <th>From LP</th>
          <th>Pickup Location</th>
          <th>Putaway Location</th>
          <th>Total Time</th>
          <th>Date</th>
          <th>Item Number</th>
          <th>Quantity</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  sortedLongTransactions.forEach(transaction => {
    tableHTML += `
      <tr class="long-transaction-row">
        <td>${transaction.employeeId}</td>
        <td>${transaction.fromLP}</td>
        <td>${transaction.pickup.toLocation}</td>
        <td>${transaction.putaway.toLocation}</td>
        <td class="long-transaction-time">${transaction.totalTimeMinutes} min</td>
        <td>${transaction.putaway.startDate}</td>
        <td>${transaction.putaway.itemNumber}</td>
        <td>${transaction.putaway.quantity}</td>
      </tr>
    `;
  });
  
  tableHTML += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHTML;
}

function exportLongTransactions() {
  if (longTransactions.length === 0) {
    return;
  }
  
  // Convert to CSV
  const headers = ['Employee ID', 'From LP', 'Pickup Location', 'Putaway Location', 
                  'Putaway Time (min)', 'Total Time (min)', 'Date', 'Item Number', 'Quantity'];
  
  let csvContent = headers.join(',') + '\n';
  
  longTransactions.forEach(transaction => {
    const row = [
      transaction.employeeId,
      transaction.fromLP,
      transaction.pickup.toLocation,
      transaction.putaway.toLocation,
      transaction.putawayTimeMinutes,
      transaction.totalTimeMinutes,
      transaction.putaway.startDate,
      transaction.putaway.itemNumber,
      transaction.putaway.quantity
    ];
    csvContent += row.join(',') + '\n';
  });
  
  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `long_transactions_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
}


function clearRTData() {
  // Clear all data
  rtTransactionData = [];
  processedTMData = {};
  longTransactions = [];
  pureRTLongTransactions = [];
  selectedTMId = null;
  laborHoursData = {};
  
  // Reset data loading flags
  hasTransactionData = false;
  hasCLMSData = false;
  
  // Hide checkmarks
  hideTransactionDataLoaded();
  hideLaborDataLoaded();
  
  // Clear localStorage
  localStorage.removeItem(RT_STORAGE_KEY);
  
  // Reset UI
  document.getElementById('fileInput').value = '';
  document.getElementById('fileInfo').style.display = 'none';
  // tmSelectionSection removed
  // longTransactionsSection was removed
  document.getElementById('clearButton').style.display = 'none';
  
  // Clear all displays
  const elementsToReset = [
    'totalTransactions', 'totalTMs', 'avgTransactionsPerTM', 'avgTransactionTime', 'avgPutawayRate',
    'avgTravelDistance', 'avgTravelDepth', 'avgRackHeight', 'avgEstimatedTravelTime', 'longTransactionCount',
    'longTransactionPercent', 'avgLongTransactionTime', 'pureRTLongTransactionCount', 
    'pureRTLongTransactionPercent', 'lowestTPHTM', 'mostLongTxTM'
  ];
  
  elementsToReset.forEach(id => {
    updateElement(id, '');
  });
  
  // Destroy charts
  const chartCanvases = ['tmPerformanceCanvas', 'travelAnalysisCanvas', 'tmDailyCanvas', 'tmIssueCanvas'];
  chartCanvases.forEach(id => {
    const canvas = document.getElementById(id);
    if (canvas && canvas.chart) {
      canvas.chart.destroy();
      canvas.chart = null;
    }
  });
  
  displayOverallView();
  // Update the new date-time range display
  const dateTimeElement = document.getElementById('dateTimeRange');
  if (dateTimeElement) {
    const infoContent = dateTimeElement.querySelector('.info-content');
    if (infoContent) {
      infoContent.textContent = 'No data loaded';
    }
  }
  
}

// Event handlers
// Long Transaction TM Analysis Functions
let currentLongTransactionView = 'tm-grouped'; // 'table' or 'tm-grouped' - default to TM grouped
let departmentWideAverages = {};
let longTransactionGroupAverages = {};

function calculateDepartmentWideAverages() {
  if (rtTransactionData.length === 0) return {};
  
  // Calculate averages for ALL putaway transactions (department-wide)
  // Use the same calculateTravelMetrics function with NaN safeguards
  const allTravelMetrics = rtTransactionData.map(t => {
    const metrics = calculateTravelMetrics(t);
    // Add same safeguards as in processRTData
    return {
      aislesTraversed: isNaN(metrics.aislesTraversed) ? 0 : (metrics.aislesTraversed || 0),
      bayDepth: isNaN(metrics.bayDepth) ? 0 : (metrics.bayDepth || 0),
      rackLevel: isNaN(metrics.rackLevel) ? 0 : (metrics.rackLevel || 0)
    };
  });
  
  const allPutawayTimes = rtTransactionData.map(t => t.putaway.timeToExecute);
  
  const totalAisles = allTravelMetrics.reduce((sum, m) => sum + m.aislesTraversed, 0);
  const totalBays = allTravelMetrics.reduce((sum, m) => sum + m.bayDepth, 0);
  const totalHeight = allTravelMetrics.reduce((sum, m) => sum + m.rackLevel, 0);
  const totalTime = allPutawayTimes.reduce((sum, time) => sum + time, 0);
  
  return {
    avgAisles: allTravelMetrics.length > 0 ? (totalAisles / allTravelMetrics.length).toFixed(1) : '0.0',
    avgBays: allTravelMetrics.length > 0 ? (totalBays / allTravelMetrics.length).toFixed(1) : '0.0',
    avgHeight: allTravelMetrics.length > 0 ? (totalHeight / allTravelMetrics.length).toFixed(1) : '0.0',
    avgTime: allPutawayTimes.length > 0 ? (totalTime / 60 / allPutawayTimes.length).toFixed(1) : '0.0', // Convert to minutes
    totalTransactions: rtTransactionData.length
  };
}

function calculateLongTransactionGroupAverages() {
  if (longTransactions.length === 0) return { avgAisles: '0.0', avgBays: '0.0', avgHeight: '0.0', avgTime: '0.0' };
  
  const allTravelMetrics = longTransactions.map(t => calculatePutawayTravelMetrics(t)).filter(m => m);
  
  if (allTravelMetrics.length === 0) {
    return { avgAisles: '0.0', avgBays: '0.0', avgHeight: '0.0', avgTime: '0.0' };
  }
  
  const totalAisles = allTravelMetrics.reduce((sum, m) => sum + (m.aislesTraveled || 0), 0);
  const totalBays = allTravelMetrics.reduce((sum, m) => sum + (m.bayDepthTraveled || 0), 0);
  const totalHeight = allTravelMetrics.reduce((sum, m) => sum + (m.rackHeightNumeric || 0), 0);
  const totalTime = longTransactions.reduce((sum, t) => sum + parseFloat(t.putawayTimeMinutes || 0), 0);
  
  return {
    avgAisles: allTravelMetrics.length > 0 ? (totalAisles / allTravelMetrics.length).toFixed(1) : '0.0',
    avgBays: allTravelMetrics.length > 0 ? (totalBays / allTravelMetrics.length).toFixed(1) : '0.0', 
    avgHeight: allTravelMetrics.length > 0 ? (totalHeight / allTravelMetrics.length).toFixed(1) : '0.0',
    avgTime: longTransactions.length > 0 ? (totalTime / longTransactions.length).toFixed(1) : '0.0'
  };
}

function groupLongTransactionsByTM() {
  const grouped = {};
  
  longTransactions.forEach(transaction => {
    const tmId = transaction.employeeId;
    if (!grouped[tmId]) {
      grouped[tmId] = {
        employeeId: tmId,
        longTransactions: [],
        metrics: {
          totalLong: 0,
          avgAisles: 0,
          avgBays: 0,
          avgHeight: 0,
          avgTime: 0
        }
      };
    }
    
    grouped[tmId].longTransactions.push(transaction);
    grouped[tmId].metrics.totalLong++;
  });
  
  // Calculate averages for each TM
  Object.keys(grouped).forEach(tmId => {
    const tmData = grouped[tmId];
    const travelMetrics = tmData.longTransactions.map(t => calculatePutawayTravelMetrics(t)).filter(m => m);
    
    if (travelMetrics.length > 0) {
      tmData.metrics.avgAisles = (travelMetrics.reduce((sum, m) => sum + m.metrics.aislesTraversed, 0) / travelMetrics.length).toFixed(1);
      tmData.metrics.avgBays = (travelMetrics.reduce((sum, m) => sum + m.metrics.bayDepth, 0) / travelMetrics.length).toFixed(1);
      tmData.metrics.avgHeight = (travelMetrics.reduce((sum, m) => sum + m.metrics.rackHeight, 0) / travelMetrics.length).toFixed(1);
      tmData.metrics.avgTime = (tmData.longTransactions.reduce((sum, t) => sum + parseFloat(t.putawayTimeMinutes), 0) / tmData.longTransactions.length).toFixed(1);
    }
  });
  
  return grouped;
}

function renderLongTransactionsTMView() {
  const container = document.getElementById('longTransactionsTMView');
  if (!container) return;
  
  const groupedData = groupLongTransactionsByTM();
  departmentWideAverages = calculateDepartmentWideAverages();
  longTransactionGroupAverages = calculateLongTransactionGroupAverages();
  
  let html = `
    <div class="section-header">
      <h4 class="section-title">Long Transactions by Team Member</h4>
      <p class="section-subtitle">Analysis of transactions taking longer than 10 minutes</p>
    </div>`;
  
  html += `
    <div class="performance-comparison-card">
      <div class="comparison-row department-avg">
        <div class="comparison-label">Department Baseline</div>
        <div class="comparison-details">
          <span class="transaction-count">${departmentWideAverages.totalTransactions} putaways</span>
          <div class="metrics-row">
            <span class="metric">${departmentWideAverages.avgAisles} aisles</span>
            <span class="metric">${departmentWideAverages.avgBays} bays</span>
            <span class="metric">${departmentWideAverages.avgHeight} ${getHeightLevelLetter(Math.round(parseFloat(departmentWideAverages.avgHeight)))}</span>
            <span class="metric">${departmentWideAverages.avgTime} min</span>
          </div>
        </div>
      </div>
      
      <div class="comparison-row long-transaction-avg">
        <div class="comparison-label">Long Transaction Average</div>
        <div class="comparison-details">
          <span class="transaction-count">${longTransactions.length} long putaways</span>
          <div class="metrics-row">
            <span class="metric">${longTransactionGroupAverages.avgAisles} aisles</span>
            <span class="metric">${longTransactionGroupAverages.avgBays} bays</span>
            <span class="metric">${longTransactionGroupAverages.avgHeight} ${getHeightLevelLetter(Math.round(parseFloat(longTransactionGroupAverages.avgHeight)))}</span>
            <span class="metric">${longTransactionGroupAverages.avgTime} min</span>
          </div>
        </div>
      </div>
    </div>`;
  
  // Sort by number of long transactions (descending)
  const sortedTMs = Object.values(groupedData).sort((a, b) => b.metrics.totalLong - a.metrics.totalLong);
  
  sortedTMs.forEach(tmData => {
    // Compare TM long transaction averages vs DEPARTMENT averages to determine if they had bad luck or underperformed
    const tmAisles = parseFloat(tmData.metrics.avgAisles);
    const tmBays = parseFloat(tmData.metrics.avgBays);
    const tmHeight = parseFloat(tmData.metrics.avgHeight);
    const deptAisles = parseFloat(departmentWideAverages.avgAisles);
    const deptBays = parseFloat(departmentWideAverages.avgBays);
    const deptHeight = parseFloat(departmentWideAverages.avgHeight);
    
    // Calculate percentage differences
    const aislesPct = deptAisles > 0 ? (((tmAisles - deptAisles) / deptAisles) * 100).toFixed(0) : 0;
    const baysPct = deptBays > 0 ? (((tmBays - deptBays) / deptBays) * 100).toFixed(0) : 0;
    const heightPct = deptHeight > 0 ? (((tmHeight - deptHeight) / deptHeight) * 100).toFixed(0) : 0;
    
    const isAislesAbove = tmAisles > deptAisles;
    const isBaysAbove = tmBays > deptBays;
    const isHeightAbove = tmHeight > deptHeight;
    
    // Determine if their long transaction locations were harder than typical department work
    const hadHarderWork = isAislesAbove || isBaysAbove || isHeightAbove;
    const cardClass = hadHarderWork ? 'tm-long-transaction-card harder-work' : 'tm-long-transaction-card';
    
    html += `
      <div class="${cardClass}" onclick="showTMLongTransactionDetails('${tmData.employeeId}')">
        <div class="tm-long-transaction-header">
          <span class="tm-name">${tmData.employeeId}</span>
          <span class="tm-long-count">${tmData.metrics.totalLong} long</span>
        </div>
        <div class="tm-status-indicator" style="text-align: center; margin-bottom: 0.5rem;">
          ${hadHarderWork ? '<span style="font-size: 0.8rem; color: #ffc107;">📍 Harder locations</span>' : '<span style="font-size: 0.8rem; color: #dc3545;">⚠️ Potential Performance Issue - Please STU</span>'}
        </div>
        <div class="tm-long-summary">
          <div class="tm-metric">
            <span class="tm-metric-label">Aisles vs Dept</span>
            <span class="tm-metric-value ${isAislesAbove ? 'above-average' : 'below-average'}">${tmData.metrics.avgAisles} (${aislesPct >= 0 ? '+' : ''}${aislesPct}%)</span>
          </div>
          <div class="tm-metric">
            <span class="tm-metric-label">Bays vs Dept</span>
            <span class="tm-metric-value ${isBaysAbove ? 'above-average' : 'below-average'}">${tmData.metrics.avgBays} (${baysPct >= 0 ? '+' : ''}${baysPct}%)</span>
          </div>
          <div class="tm-metric">
            <span class="tm-metric-label">Height vs Dept</span>
            <span class="tm-metric-value ${isHeightAbove ? 'above-average' : 'below-average'}">${tmData.metrics.avgHeight} ${getHeightLevelLetter(Math.round(parseFloat(tmData.metrics.avgHeight)))} (${heightPct >= 0 ? '+' : ''}${heightPct}%)</span>
          </div>
          <div class="tm-metric">
            <span class="tm-metric-label">Avg Time</span>
            <span class="tm-metric-value">${tmData.metrics.avgTime} min</span>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function showTMLongTransactionDetails(employeeId) {
  const tmLongTransactions = longTransactions.filter(t => t.employeeId === employeeId);
  const modal = document.getElementById('tmLongTransactionDetails');
  
  if (!tmLongTransactions.length || !modal) return;
  
  // Calculate TM averages
  const travelMetrics = tmLongTransactions.map(t => calculatePutawayTravelMetrics(t)).filter(m => m);
  const tmAvgAisles = (travelMetrics.reduce((sum, m) => sum + m.metrics.aislesTraversed, 0) / travelMetrics.length).toFixed(1);
  const tmAvgBays = (travelMetrics.reduce((sum, m) => sum + m.metrics.bayDepth, 0) / travelMetrics.length).toFixed(1);
  const tmAvgHeight = (travelMetrics.reduce((sum, m) => sum + m.metrics.rackHeight, 0) / travelMetrics.length).toFixed(1);
  const tmAvgTime = (tmLongTransactions.reduce((sum, t) => sum + parseFloat(t.putawayTimeMinutes), 0) / tmLongTransactions.length).toFixed(1);
  
  // Calculate percentage differences for modal
  const tmAislesFloat = parseFloat(tmAvgAisles);
  const tmBaysFloat = parseFloat(tmAvgBays);
  const tmHeightFloat = parseFloat(tmAvgHeight);
  const tmTimeFloat = parseFloat(tmAvgTime);
  const deptAislesFloat = parseFloat(departmentWideAverages.avgAisles);
  const deptBaysFloat = parseFloat(departmentWideAverages.avgBays);
  const deptHeightFloat = parseFloat(departmentWideAverages.avgHeight);
  const deptTimeFloat = parseFloat(departmentWideAverages.avgTime);
  
  const aislesPctModal = deptAislesFloat > 0 ? (((tmAislesFloat - deptAislesFloat) / deptAislesFloat) * 100).toFixed(0) : 0;
  const baysPctModal = deptBaysFloat > 0 ? (((tmBaysFloat - deptBaysFloat) / deptBaysFloat) * 100).toFixed(0) : 0;
  const heightPctModal = deptHeightFloat > 0 ? (((tmHeightFloat - deptHeightFloat) / deptHeightFloat) * 100).toFixed(0) : 0;
  const timePctModal = deptTimeFloat > 0 ? (((tmTimeFloat - deptTimeFloat) / deptTimeFloat) * 100).toFixed(0) : 0;
  
  const hadHarderWork = tmAislesFloat > deptAislesFloat || tmBaysFloat > deptBaysFloat || tmHeightFloat > deptHeightFloat;
  
  let html = `
    <div class="tm-details-content">
      <div class="tm-details-header">
        <h3 class="tm-details-title">${employeeId} - Long Transaction Analysis</h3>
        <button class="tm-details-close" onclick="closeTMLongTransactionDetails()">×</button>
      </div>
      
      <div style="background: ${hadHarderWork ? '#fff3cd' : '#f8d7da'}; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; text-align: center;">
        <strong>${hadHarderWork ? '📍 Analysis: TM had harder locations than department average' : '⚠️ Analysis: Potential Performance Issue - Please STU'}</strong>
        <br><small>${hadHarderWork ? 'Long putaways likely due to difficult travel distances/heights' : 'Long putaways may indicate performance or training opportunities'}</small>
      </div>
      
      <h4>Comparison vs Department Average</h4>
      <div class="tm-comparison-grid">
        <div class="tm-comparison-card">
          <div class="tm-comparison-title">Aisles Traveled (Long Transactions)</div>
          <div class="tm-comparison-values">
            <span class="tm-value ${tmAislesFloat > deptAislesFloat ? 'worse' : 'better'}">${tmAvgAisles}</span>
            <span class="vs-divider">vs</span>
            <span class="tm-value">${departmentWideAverages.avgAisles}</span>
          </div>
          <small>Dept Avg (${aislesPctModal >= 0 ? '+' : ''}${aislesPctModal}% difference)</small>
        </div>
        <div class="tm-comparison-card">
          <div class="tm-comparison-title">Bay Depth (Long Transactions)</div>
          <div class="tm-comparison-values">
            <span class="tm-value ${tmBaysFloat > deptBaysFloat ? 'worse' : 'better'}">${tmAvgBays}</span>
            <span class="vs-divider">vs</span>
            <span class="tm-value">${departmentWideAverages.avgBays}</span>
          </div>
          <small>Dept Avg (${baysPctModal >= 0 ? '+' : ''}${baysPctModal}% difference)</small>
        </div>
        <div class="tm-comparison-card">
          <div class="tm-comparison-title">Rack Height (Long Transactions)</div>
          <div class="tm-comparison-values">
            <span class="tm-value ${tmHeightFloat > deptHeightFloat ? 'worse' : 'better'}">${tmAvgHeight} ${getHeightLevelLetter(Math.round(tmHeightFloat))}</span>
            <span class="vs-divider">vs</span>
            <span class="tm-value">${departmentWideAverages.avgHeight} ${getHeightLevelLetter(Math.round(deptHeightFloat))}</span>
          </div>
          <small>Dept Avg (${heightPctModal >= 0 ? '+' : ''}${heightPctModal}% difference)</small>
        </div>
        <div class="tm-comparison-card">
          <div class="tm-comparison-title">Putaway Time (Long Transactions)</div>
          <div class="tm-comparison-values">
            <span class="tm-value ${tmTimeFloat > deptTimeFloat ? 'worse' : 'better'}">${tmAvgTime} min</span>
            <span class="vs-divider">vs</span>
            <span class="tm-value">${departmentWideAverages.avgTime} min</span>
          </div>
          <small>Dept Avg (${timePctModal >= 0 ? '+' : ''}${timePctModal}% difference)</small>
        </div>
      </div>
      
      <div class="transaction-details-header">
        <h4 class="details-title">Transaction Details</h4>
        <span class="transaction-count-badge">${tmLongTransactions.length} transactions</span>
      </div>
      <div class="tm-transactions-list">
  `;
  
  tmLongTransactions.forEach(transaction => {
    const travelData = calculatePutawayTravelMetrics(transaction);
    html += `
      <div class="tm-transaction-item">
        <div class="transaction-time">${transaction.putawayTimeMinutes} minutes</div>
        <div class="transaction-locations">${transaction.pickup.fromLocation} → ${transaction.putaway.toLocation}</div>
        <div class="transaction-metrics">
          ${travelData ? `${travelData.metrics.aislesTraversed} aisles • ${travelData.metrics.bayDepth} bays • Height ${travelData.metrics.rackHeight}` : 'Metrics unavailable'}
        </div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  modal.innerHTML = html;
  modal.style.display = 'flex';
}

function closeTMLongTransactionDetails() {
  const modal = document.getElementById('tmLongTransactionDetails');
  if (modal) modal.style.display = 'none';
}

function toggleLongTransactionView() {
  const tableView = document.getElementById('longTransactionsTable');
  const tmView = document.getElementById('longTransactionsTMView');
  const toggleBtn = document.getElementById('toggleLongTransactionView');
  
  if (currentLongTransactionView === 'tm-grouped') {
    // Switch to table view
    tableView.style.display = 'block';
    tmView.style.display = 'none';
    toggleBtn.textContent = '👥 Group by TM';
    currentLongTransactionView = 'table';
  } else {
    // Switch to TM-grouped view
    tableView.style.display = 'none';
    tmView.style.display = 'block';
    toggleBtn.textContent = '📋 Show Table';
    currentLongTransactionView = 'tm-grouped';
    renderLongTransactionsTMView();
  }
}

// Warehouse Heat Map System
let warehouseCanvas = null;
let warehouseCtx = null;
let currentHeatmapData = {};
let heatmapTransactionData = [];
let selectedPickupZone = null; // Track selected pickup zone for filtering

// Rectangle selection variables
let isDrawingRectangle = false;
let rectangleStart = { x: 0, y: 0 };
let rectangleEnd = { x: 0, y: 0 };
let selectedRectangle = null;
let rectangleSelectionEnabled = false;
let heatmapImageData = null; // Cache the heat map for performance
let lastPreviewTime = 0; // Throttle preview updates
let lastStatsUpdateTime = 0; // Throttle stats updates

// Warehouse layout configuration based on Excel file structure
const WAREHOUSE_CONFIG = {
  canvas: {
    width: 1400, // Reasonable width that maintains readability
    height: 800  // Good height for visibility without stretching
  },
  // Aisle configuration with bay ranges
  aisleConfig: {
    // Aisles 14-29: bays 05-56
    '14-29': { startBay: 5, endBay: 56, aisles: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29] },
    // Aisles 30-45: bays 05-45  
    '30-45': { startBay: 5, endBay: 45, aisles: [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45] },
    // Aisles 46-80: bays 05-21
    '46-80': { startBay: 5, endBay: 21, aisles: [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80] },
    // Aisles 81-96: bays 05-47
    '81-96': { startBay: 5, endBay: 47, aisles: [81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96] },
    // Aisles 97-98: bays 05-45
    '97-98': { startBay: 5, endBay: 45, aisles: [97, 98] },
    // Aisles 99-104: bays 05-44
    '99-104': { startBay: 5, endBay: 44, aisles: [99, 100, 101, 102, 103, 104] },
    // Aisles 105-109: bays 05-44 (same range as 99-104)
    '105-109': { startBay: 5, endBay: 44, aisles: [105, 106, 107, 108, 109] },
    // Aisles 110-112: bays 05-53
    '110-112': { startBay: 5, endBay: 53, aisles: [110, 111, 112] },
    // Aisles 113-124: bays 05-56
    '113-124': { startBay: 5, endBay: 56, aisles: [113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124] },
    // S-Aisles (S01-S06): locations 01-44 (22 bays total - 2 locations per bay)
    'S01-S06': { startBay: 1, endBay: 22, aisles: ['S01', 'S02', 'S03', 'S04', 'S05', 'S06'] },
    // Extension Aisles (03-04): bays 27-51 (25 bays total, similar to S-aisle length)
    '03-04': { startBay: 27, endBay: 51, aisles: [3, 4] }
  },
  zones: {
    // Main warehouse area (vertical orientation aisles) - natural proportions for readability
    mainWarehouse: {
      x: 20, y: 40, width: 1360, height: 620
    },
    // Pickup zone area at bottom - natural width, adequate height for buttons
    pickupArea: {
      x: 20, y: 680, width: 1360, height: 100
    }
  },
  // Pickup zones positioned at bottom, directly across from their paired aisles
  pickupZones: {
    'REC6701': { pairedAisle: 59, color: '#17a2b8' },
    'REC7401': { pairedAisle: 49, color: '#17a2b8' },
    'REC7201': { pairedAisle: 54, color: '#17a2b8' },
    'REC7701': { pairedAisle: 44, color: '#17a2b8' },
    'RECVASOUT': { pairedAisle: 20, color: '#ffc107' },
    'REC5401': { pairedAisle: 85, color: '#17a2b8' },
    'IBCONT01': { pairedAisle: 95, color: '#6c757d' },
    'IBCONT02': { pairedAisle: 100, color: '#6c757d' },
    'IBPS1_IBVC': { pairedAisle: 32, color: '#28a745', zones: ['IBPS1', 'IBVC'] }, // Combined - same paired aisle
    'IBPS2': { pairedAisle: 81, color: '#28a745' },
    'BPFLIP': { pairedAisle: 34, color: '#fd7e14' }
  }
};

function initializeWarehouseHeatMap() {
  const canvas = document.getElementById('warehouseCanvas');
  const tooltip = document.getElementById('warehouseTooltip');
  
  if (!canvas) return;
  
  warehouseCanvas = canvas;
  warehouseCtx = canvas.getContext('2d');
  
  // Improve text rendering quality
  warehouseCtx.textBaseline = 'middle';
  warehouseCtx.imageSmoothingEnabled = false; // Turn off for crisp text
  warehouseCtx.textRenderingOptimization = 'optimizeLegibility';
  
  // Set up canvas event listeners
  canvas.addEventListener('mousemove', handleHeatmapMouseMove);
  canvas.addEventListener('mouseleave', function() {
    hideHeatmapTooltip();
    clearHoverDetails();
  });
  canvas.addEventListener('click', handleHeatmapClick);
  
  // Populate TM selector
  populateHeatmapTMSelector();
  
}

function populateHeatmapTMSelector() {
  const selector = document.getElementById('heatmapTMSelector');
  if (!selector || !processedTMData) return;
  
  // Clear existing options (except "All Team Members")
  while (selector.children.length > 1) {
    selector.removeChild(selector.lastChild);
  }
  
  // Add individual TM options
  Object.keys(processedTMData).forEach(tmId => {
    const option = document.createElement('option');
    option.value = tmId;
    const tmData = processedTMData[tmId];
    
    // Show actual rate if labor hours are available, otherwise estimated rate  
    const hasLaborData = tmData.actualLaborHours !== undefined;
    const rawRate = hasLaborData ? tmData.actualPutawayRate : tmData.performanceMetrics.avgPutawayRate;
    const rateToShow = parseFloat(rawRate) || 0; // Ensure it's a number
    const rateLabel = hasLaborData ? 'PPH' : 'PPH (Est)';
    
    option.textContent = `${tmId} - ${rateToShow.toFixed(1)} ${rateLabel} (${tmData.totalPutaways} transactions)`;
    selector.appendChild(option);
  });
  
  // Set up event listeners for heatmap controls
  setupHeatmapEventListeners();
  
  // Set up rectangle selection event listeners
  setupRectangleSelectionListeners();
}

function setupHeatmapEventListeners() {
  const tmSelector = document.getElementById('heatmapTMSelector');
  const typeSelector = document.getElementById('heatmapTransactionType');
  
  if (!tmSelector || !typeSelector) return;
  
  // Remove existing listeners to avoid duplicates
  const newTmSelector = tmSelector.cloneNode(true);
  const newTypeSelector = typeSelector.cloneNode(true);
  tmSelector.parentNode.replaceChild(newTmSelector, tmSelector);
  typeSelector.parentNode.replaceChild(newTypeSelector, typeSelector);
  
  // Add event listeners
  newTmSelector.addEventListener('change', () => {
    drawHeatmap();
  });
  
  newTypeSelector.addEventListener('change', () => {
    drawHeatmap();
  });
}

function getAislePosition(aisleNumber) {
  // Handle S-aisles FIRST before parsing to integer
  if (typeof aisleNumber === 'string' && aisleNumber.startsWith('S')) {
    const sAisleNum = parseInt(aisleNumber.substring(1)); // Extract number from S01, S02, etc.
    if (sAisleNum >= 1 && sAisleNum <= 6) {
      // S-aisles are positioned 3 bays across from aisles 68-73
      const pairedAisle = 67 + sAisleNum; // S01 pairs with 68, S02 with 69, etc.
      
      // Create ordered list for paired aisle calculation
      const allAisles = [];
      Object.entries(WAREHOUSE_CONFIG.aisleConfig).forEach(([rangeKey, config]) => {
        if (rangeKey !== 'S01-S06') { // Exclude S-aisles from regular list
          allAisles.push(...config.aisles);
        }
      });
      allAisles.sort((a, b) => a - b);
      
      // Find paired aisle position directly without recursion
      const pairedAisleIndex = allAisles.indexOf(pairedAisle);
      
      if (pairedAisleIndex !== -1) {
        const warehouseWidth = WAREHOUSE_CONFIG.zones.mainWarehouse.width;
        const aisleSpacing = warehouseWidth / allAisles.length;
        const pairedX = WAREHOUSE_CONFIG.zones.mainWarehouse.x + (pairedAisleIndex * aisleSpacing) + (aisleSpacing / 2);
        const pairedBay05Y = WAREHOUSE_CONFIG.zones.mainWarehouse.y + WAREHOUSE_CONFIG.zones.mainWarehouse.height - 20;
        
        // Calculate where the paired aisle ends (bay 21 for aisles 46-80)
        const pairedAisleConfig = WAREHOUSE_CONFIG.aisleConfig['46-80']; // Aisles 68-73 are in this range
        const pairedAisleBayRange = pairedAisleConfig.endBay - pairedAisleConfig.startBay;
        const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
        const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60;
        const pairedAisleLength = (pairedAisleBayRange / maxBayRange) * availableHeight;
        
        // Position S-aisle starting AFTER where the paired aisle ends, plus 3 bay spacing
        const baySpacing = pairedAisleLength / pairedAisleBayRange; // Pixels per bay
        const threeBayGap = baySpacing * 3;
        const pairedAisleTopY = pairedBay05Y - pairedAisleLength; // Where paired aisle ends (bay 21)
        const sAisleBay01Y = pairedAisleTopY - threeBayGap; // S-aisle bay 01 starts 3 bays after paired aisle ends
        
        // Calculate S-aisle length (22 bays, not 44)
        const sAisleBayRange = WAREHOUSE_CONFIG.aisleConfig['S01-S06'].endBay - WAREHOUSE_CONFIG.aisleConfig['S01-S06'].startBay;
        const sAisleLength = (sAisleBayRange / maxBayRange) * availableHeight;
        const sAisleTopY = sAisleBay01Y - sAisleLength; // Where S-aisle ends (bay 22)
        
        const position = {
          x: pairedX,
          y: sAisleTopY, // Start drawing from the top of S-aisle
          zone: 's-aisle',
          bay05Position: { x: pairedX, y: sAisleBay01Y }, // This represents bay 01 for S-aisles (at bottom)
          aisleConfig: WAREHOUSE_CONFIG.aisleConfig['S01-S06'],
          pairedAisle: pairedAisle
        };
        return position;
      } else {
        // Fallback position if paired aisle not found
        return {
          x: 600 + (sAisleNum * 40), // Simple fallback positioning
          y: WAREHOUSE_CONFIG.zones.mainWarehouse.y + 30,
          zone: 's-aisle',
          bay05Position: { x: 600 + (sAisleNum * 40), y: WAREHOUSE_CONFIG.zones.mainWarehouse.y + WAREHOUSE_CONFIG.zones.mainWarehouse.height - 20 },
          aisleConfig: WAREHOUSE_CONFIG.aisleConfig['S01-S06'],
          pairedAisle: pairedAisle
        };
      }
    }
    // Return null if S-aisle not found
    return { x: 500, y: 300, zone: 'unknown' };
  }
  
  // Handle extension aisles 03 and 04 (extensions of 76 and 79)
  const aisle = parseInt(aisleNumber);
  if (aisle === 3 || aisle === 4) {
    // Aisle 03 pairs with 76, Aisle 04 pairs with 79
    const pairedAisle = aisle === 3 ? 76 : 79;
    
    // Create ordered list for paired aisle calculation
    const allAisles = [];
    Object.entries(WAREHOUSE_CONFIG.aisleConfig).forEach(([rangeKey, config]) => {
      if (rangeKey !== 'S01-S06' && rangeKey !== '03-04') { // Exclude special aisles from regular list
        allAisles.push(...config.aisles);
      }
    });
    allAisles.sort((a, b) => a - b);
    
    // Find paired aisle position
    const pairedAisleIndex = allAisles.indexOf(pairedAisle);
    if (pairedAisleIndex !== -1) {
      const warehouseWidth = WAREHOUSE_CONFIG.zones.mainWarehouse.width;
      const aisleSpacing = warehouseWidth / allAisles.length;
      const pairedX = WAREHOUSE_CONFIG.zones.mainWarehouse.x + (pairedAisleIndex * aisleSpacing) + (aisleSpacing / 2);
      const pairedBay05Y = WAREHOUSE_CONFIG.zones.mainWarehouse.y + WAREHOUSE_CONFIG.zones.mainWarehouse.height - 20;
      
      // Calculate where the paired aisle ends (bay 21 for aisles 46-80)
      const pairedAisleConfig = WAREHOUSE_CONFIG.aisleConfig['46-80']; // Aisles 76 and 79 are in this range
      const pairedAisleBayRange = pairedAisleConfig.endBay - pairedAisleConfig.startBay;
      const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
      const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60;
      const pairedAisleLength = (pairedAisleBayRange / maxBayRange) * availableHeight;
      
      // Position extension aisle starting AFTER where the paired aisle ends, plus 3 bay spacing
      const baySpacing = pairedAisleLength / pairedAisleBayRange;
      const threeBayGap = baySpacing * 3;
      const pairedAisleTopY = pairedBay05Y - pairedAisleLength;
      const extensionAisleBay27Y = pairedAisleTopY - threeBayGap; // Extension aisle bay 27 starts here
      
      // Calculate extension aisle length (25 bays: 27-51)
      const extensionAisleBayRange = WAREHOUSE_CONFIG.aisleConfig['03-04'].endBay - WAREHOUSE_CONFIG.aisleConfig['03-04'].startBay;
      const extensionAisleLength = (extensionAisleBayRange / maxBayRange) * availableHeight;
      const extensionAisleTopY = extensionAisleBay27Y - extensionAisleLength;
      
      return {
        x: pairedX,
        y: extensionAisleTopY,
        zone: 'extension',
        bay05Position: { x: pairedX, y: extensionAisleBay27Y }, // This represents bay 27 for extension aisles
        aisleConfig: WAREHOUSE_CONFIG.aisleConfig['03-04'],
        pairedAisle: pairedAisle
      };
    }
    // Fallback position if paired aisle not found
    return {
      x: 300 + (aisle * 40),
      y: WAREHOUSE_CONFIG.zones.mainWarehouse.y + 30,
      zone: 'extension',
      bay05Position: { x: 300 + (aisle * 40), y: WAREHOUSE_CONFIG.zones.mainWarehouse.y + WAREHOUSE_CONFIG.zones.mainWarehouse.height - 20 },
      aisleConfig: WAREHOUSE_CONFIG.aisleConfig['03-04'],
      pairedAisle: aisle === 3 ? 76 : 79
    };
  }
  
  // Create ordered list of all aisles from the configuration (regular aisles)
  const allAisles = [];
  Object.entries(WAREHOUSE_CONFIG.aisleConfig).forEach(([rangeKey, config]) => {
    if (rangeKey !== 'S01-S06' && rangeKey !== '03-04') { // Exclude special aisles from regular processing
      allAisles.push(...config.aisles);
    }
  });
  allAisles.sort((a, b) => a - b);
  
  // Find aisle configuration for regular aisles
  let aisleConfig = null;
  for (const [rangeKey, config] of Object.entries(WAREHOUSE_CONFIG.aisleConfig)) {
    if (config.aisles.includes(aisle)) {
      aisleConfig = config;
      break;
    }
  }
  
  // Find position index in the ordered list
  const aisleIndex = allAisles.indexOf(aisle);
  if (aisleIndex === -1) {
    // Default position for unknown aisles
    return { x: 500, y: 300, zone: 'unknown' };
  }
  
  // Linear positioning - aisles arranged horizontally across the warehouse
  const warehouseWidth = WAREHOUSE_CONFIG.zones.mainWarehouse.width;
  const aisleSpacing = warehouseWidth / allAisles.length;
  
  const x = WAREHOUSE_CONFIG.zones.mainWarehouse.x + (aisleIndex * aisleSpacing) + (aisleSpacing / 2);
  const y = WAREHOUSE_CONFIG.zones.mainWarehouse.y + 30; // Start from near top of main area
  
  // Bay 05 position (where pickup zones align) - near bottom of main warehouse area
  const bay05Y = WAREHOUSE_CONFIG.zones.mainWarehouse.y + WAREHOUSE_CONFIG.zones.mainWarehouse.height - 20;
  
  return {
    x: x,
    y: y,
    zone: 'main',
    bay05Position: { x: x, y: bay05Y },
    aisleConfig: aisleConfig
  };
}

function getBayPosition(aisleNumber, bayNumber) {
  const aislePosition = getAislePosition(aisleNumber);
  if (!aislePosition || !aislePosition.aisleConfig) return aislePosition;
  
  const bay = parseInt(bayNumber);
  const config = aislePosition.aisleConfig;
  const bayRange = config.endBay - config.startBay;
  
  // Calculate proportional aisle length based on bay count - use more of the available space
  const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
  const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60; // Leave margins
  const aisleLength = (bayRange / maxBayRange) * availableHeight;
  
  // Calculate bay position within the aisle
  // For S-aisles: bay 01 is at bottom, higher numbers go up
  // For regular aisles: bay 05 is at bottom, higher numbers go up
  const bayProgress = (bay - config.startBay) / bayRange;
  const bayY = aislePosition.bay05Position.y - (bayProgress * aisleLength); // Subtract to go upward from starting bay
  
  return {
    x: aislePosition.x,
    y: bayY,
    zone: aislePosition.zone,
    aisle: aisleNumber,
    bay: bayNumber
  };
}

function getPickupZonePosition(zoneName) {
  const zoneConfig = WAREHOUSE_CONFIG.pickupZones[zoneName];
  if (!zoneConfig) return null;
  
  // Special positioning for IBPS buttons to prevent overlap
  if (zoneName === 'IBPS1_IBVC') {
    // Position IBPS1_IBVC immediately to the left of BPFLIP button (aisle 34)
    const bpflipAislePosition = getAislePosition(34);
    if (bpflipAislePosition && bpflipAislePosition.bay05Position) {
      return {
        x: bpflipAislePosition.bay05Position.x - 80, // 80px to the left (button width + small gap)
        y: WAREHOUSE_CONFIG.zones.pickupArea.y + 45,
        color: zoneConfig.color,
        pairedAisle: zoneConfig.pairedAisle
      };
    }
  }
  
  if (zoneName === 'IBPS2') {
    // Position IBPS2 to the left of REC5401 (paired aisle 85)
    const rec5401AislePosition = getAislePosition(85);
    if (rec5401AislePosition && rec5401AislePosition.bay05Position) {
      return {
        x: rec5401AislePosition.bay05Position.x - 80, // 80px to the left (button width + small gap)
        y: WAREHOUSE_CONFIG.zones.pickupArea.y + 45,
        color: zoneConfig.color,
        pairedAisle: zoneConfig.pairedAisle
      };
    }
  }
  
  // Get the position of the paired aisle's bay 05 (original positioning logic)
  const aislePosition = getAislePosition(zoneConfig.pairedAisle);
  if (!aislePosition || !aislePosition.bay05Position) return null;
  
  // Position pickup zone directly below the paired aisle's bay 05 position
  return {
    x: aislePosition.bay05Position.x,
    y: WAREHOUSE_CONFIG.zones.pickupArea.y + 45, // Center in expanded pickup area
    color: zoneConfig.color,
    pairedAisle: zoneConfig.pairedAisle
  };
}

function getTransactionHeightColor(rackLevel) {
  // Height-based color system for rack levels
  if (!rackLevel) return '#888888'; // Gray for unknown levels
  
  const level = rackLevel.toUpperCase();
  
  // ABC levels = Green (ground/low levels)
  if (['A', 'B', 'C'].includes(level)) {
    return '#00ff00'; // Bright green for dark theme
  }
  
  // D, G, J levels = Yellow (mid levels)  
  if (['D', 'G', 'J'].includes(level)) {
    return '#ffff00'; // Bright yellow for dark theme
  }
  
  // M, P, S levels = Red (high levels)
  if (['M', 'P', 'S'].includes(level)) {
    return '#ff0000'; // Bright red for dark theme
  }
  
  // Default for unknown levels
  return '#888888'; // Gray
}

function getHeatmapColor(transactionCount, rackLevel) {
  // Use height-based coloring instead of intensity-based
  const baseColor = getTransactionHeightColor(rackLevel);
  
  // Adjust opacity based on transaction count for visibility
  const opacity = Math.min(Math.max(transactionCount * 0.15 + 0.4, 0.4), 0.9);
  
  // Convert hex to rgba with opacity
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function drawWarehouseLayout() {
  if (!warehouseCtx) return;
  
  const ctx = warehouseCtx;
  const canvas = warehouseCanvas;
  
  // Clear canvas and set dark background
  ctx.fillStyle = '#000000'; // Black background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Ensure pickup zone totals are calculated for display
  if (rtTransactionData && rtTransactionData.length > 0) {
    calculatePickupZoneTotals();
  }
  
  // Draw main warehouse background with dark theme
  const mainZone = WAREHOUSE_CONFIG.zones.mainWarehouse;
  ctx.fillStyle = 'rgba(40, 40, 40, 0.3)'; // Dark gray warehouse area
  ctx.fillRect(mainZone.x, mainZone.y, mainZone.width, mainZone.height);
  
  // Draw pickup area background with dark theme
  const pickupZone = WAREHOUSE_CONFIG.zones.pickupArea;
  ctx.fillStyle = 'rgba(255, 193, 7, 0.2)'; // Subtle yellow pickup area
  ctx.fillRect(pickupZone.x, pickupZone.y, pickupZone.width, pickupZone.height);
  
  // Get all aisles sorted (excluding special aisles)
  const allAisles = [];
  Object.entries(WAREHOUSE_CONFIG.aisleConfig).forEach(([rangeKey, config]) => {
    if (rangeKey === 'S01-S06' || rangeKey === '03-04') {
      // Handle special aisles separately in rendering
      return;
    }
    allAisles.push(...config.aisles);
  });
  allAisles.sort((a, b) => a - b);
  
  // Also get special aisles for separate rendering
  const sAisles = WAREHOUSE_CONFIG.aisleConfig['S01-S06'].aisles;
  const extensionAisles = WAREHOUSE_CONFIG.aisleConfig['03-04'].aisles;
  
  // Draw aisles with proportional lengths
  allAisles.forEach(aisleNumber => {
    const position = getAislePosition(aisleNumber);
    if (position && position.zone !== 'unknown' && position.aisleConfig) {
      const config = position.aisleConfig;
      const bayRange = config.endBay - config.startBay;
      
      // Calculate proportional aisle length based on bay count - use more of the available space
      const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
      const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60; // Leave margins
      const aisleLength = (bayRange / maxBayRange) * availableHeight;
      
      // Draw aisle line from bay 05 position extending upward - bright for dark background
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)'; // Light gray for visibility
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(position.x, position.bay05Position.y);
      ctx.lineTo(position.x, position.bay05Position.y - aisleLength);
      ctx.stroke();
      
      // Draw bay 05 marker (at bottom) - bright green
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(position.x, position.bay05Position.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // Only show aisle labels every 5 aisles to reduce clutter
      if (aisleNumber % 5 === 0) {
        // Add aisle number label at top of aisle - white for visibility
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(aisleNumber.toString(), position.x, position.bay05Position.y - aisleLength - 10);
        
        // Add bay range label at bottom (near bay 05) - light gray
        ctx.fillStyle = '#cccccc';
        ctx.font = '9px Arial';
        ctx.fillText(`${config.startBay}-${config.endBay}`, position.x, position.bay05Position.y + 18);
      }
      
      // Add bay markers every 5 bays along the aisle
      for (let bay = config.startBay; bay <= config.endBay; bay += 5) {
        if (bay !== config.startBay) { // Skip bay 05 since it's already marked
          const bayPosition = getBayPosition(aisleNumber, bay);
          if (bayPosition) {
            // Small bay marker
            ctx.fillStyle = 'rgba(108, 117, 125, 0.4)';
            ctx.beginPath();
            ctx.arc(bayPosition.x, bayPosition.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Bay number label (only for multiples of 10 to avoid too much clutter)
            if (bay % 10 === 0) {
              ctx.fillStyle = 'rgba(108, 117, 125, 0.6)';
              ctx.font = '7px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(bay.toString(), bayPosition.x + 8, bayPosition.y + 2);
            }
          }
        }
      }
    }
  });
  
  // Draw S-aisles with their special positioning and bay numbering
  sAisles.forEach(sAisle => {
    const position = getAislePosition(sAisle);
    if (position && position.zone === 's-aisle') {
      const config = position.aisleConfig || WAREHOUSE_CONFIG.aisleConfig['S01-S06'];
      const bayRange = config.endBay - config.startBay;
      
      // Calculate proportional aisle length - S-aisles have different bay range (1-44 vs 05-xx)
      const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
      const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60;
      const aisleLength = (bayRange / maxBayRange) * availableHeight;
      
      // Draw S-aisle line (different color to distinguish)
      ctx.strokeStyle = 'rgba(23, 162, 184, 0.5)'; // Blue tint for S-aisles
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(position.x, position.bay05Position.y); // Start from bay 01 position
      ctx.lineTo(position.x, position.bay05Position.y - aisleLength); // Draw upward to bay 44
      ctx.stroke();
      
      // Draw bay 01 marker (S-aisles start at bay 01, not 05)
      ctx.fillStyle = '#17a2b8'; // Blue for S-aisles
      ctx.beginPath();
      ctx.arc(position.x, position.bay05Position.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // S-aisle label (only show for S01 and S06 at top only)
      if (sAisle === 'S01' || sAisle === 'S06') {
        ctx.fillStyle = '#17a2b8';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(sAisle, position.x, position.bay05Position.y - aisleLength - 10);
        
        // Removed bottom bay range label to prevent overlap with other content
      }
      
      // Add bay markers every 5 bays for S-aisles
      for (let bay = config.startBay; bay <= config.endBay; bay += 5) {
        if (bay !== config.startBay) { // Skip bay 01 since it's already marked
          const bayPosition = getBayPosition(sAisle, bay);
          if (bayPosition) {
            // Small bay marker
            ctx.fillStyle = 'rgba(23, 162, 184, 0.4)';
            ctx.beginPath();
            ctx.arc(bayPosition.x, bayPosition.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Bay number label (every 10 bays)
            if (bay % 10 === 0) {
              ctx.fillStyle = 'rgba(23, 162, 184, 0.6)';
              ctx.font = '7px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(bay.toString(), bayPosition.x + 8, bayPosition.y + 2);
            }
          }
        }
      }
    }
  });
  
  // Draw extension aisles (03-04) with standard styling
  extensionAisles.forEach(extensionAisle => {
    const position = getAislePosition(extensionAisle);
    if (position && position.zone === 'extension') {
      const config = position.aisleConfig || WAREHOUSE_CONFIG.aisleConfig['03-04'];
      const bayRange = config.endBay - config.startBay;
      
      // Calculate proportional aisle length
      const maxBayRange = Math.max(...Object.values(WAREHOUSE_CONFIG.aisleConfig).map(c => c.endBay - c.startBay));
      const availableHeight = WAREHOUSE_CONFIG.zones.mainWarehouse.height - 60;
      const aisleLength = (bayRange / maxBayRange) * availableHeight;
      
      // Draw extension aisle line (standard gray color like regular aisles)
      ctx.strokeStyle = 'rgba(108, 117, 125, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(position.x, position.bay05Position.y); // Start from bay 27 position
      ctx.lineTo(position.x, position.bay05Position.y - aisleLength); // Draw upward to bay 51
      ctx.stroke();
      
      // Draw bay 27 marker (extension aisles start at bay 27)
      ctx.fillStyle = '#28a745';
      ctx.beginPath();
      ctx.arc(position.x, position.bay05Position.y, 3, 0, 2 * Math.PI);
      ctx.fill();
      
      // Extension aisle label (only show aisle numbers every 5, but these are special so show both)
      ctx.fillStyle = '#495057';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(extensionAisle.toString(), position.x, position.bay05Position.y - aisleLength - 10);
      
      // Bay range label for extension aisles
      ctx.fillStyle = '#6c757d';
      ctx.font = '9px Arial';
      ctx.fillText(`${config.startBay}-${config.endBay}`, position.x, position.bay05Position.y + 18);
      
      // Add bay markers every 5 bays for extension aisles
      for (let bay = config.startBay; bay <= config.endBay; bay += 5) {
        if (bay !== config.startBay) { // Skip bay 27 since it's already marked
          const bayPosition = getBayPosition(extensionAisle, bay);
          if (bayPosition) {
            // Small bay marker
            ctx.fillStyle = 'rgba(108, 117, 125, 0.4)';
            ctx.beginPath();
            ctx.arc(bayPosition.x, bayPosition.y, 1.5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Bay number label (every 10 bays)
            if (bay % 10 === 0) {
              ctx.fillStyle = 'rgba(108, 117, 125, 0.6)';
              ctx.font = '7px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(bay.toString(), bayPosition.x + 8, bayPosition.y + 2);
            }
          }
        }
      }
    }
  });
  
  // Draw pickup zones with clickable button styling
  Object.entries(WAREHOUSE_CONFIG.pickupZones).forEach(([zoneName, config]) => {
    const position = getPickupZonePosition(zoneName);
    if (position) {
      // Determine if this zone is selected
      const isSelected = selectedPickupZone === zoneName;
      
      // Draw pickup zone with button-like appearance - taller and narrower to prevent overlap
      const buttonWidth = 60; // Narrower to prevent overlap when positioned under paired aisles
      const buttonHeight = 35; // Taller to maintain visibility and usability
      const buttonHalfWidth = buttonWidth / 2;
      const buttonHalfHeight = buttonHeight / 2;
      
      // Add shadow for button effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // More visible shadow on dark background
      ctx.fillRect(position.x - buttonHalfWidth + 1, position.y - buttonHalfHeight + 1, buttonWidth, buttonHeight);
      
      // Main button
      ctx.fillStyle = isSelected ? '#ffffff' : position.color;
      
      // Fallback for browsers without roundRect support
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(position.x - buttonHalfWidth, position.y - buttonHalfHeight, buttonWidth, buttonHeight, 6);
        ctx.fill();
      } else {
        // Simple rectangle fallback
        ctx.fillRect(position.x - buttonHalfWidth, position.y - buttonHalfHeight, buttonWidth, buttonHeight);
      }
      
      // Add border for selected state
      if (isSelected) {
        ctx.strokeStyle = position.color;
        ctx.lineWidth = 3; // Thicker border for visibility
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(position.x - buttonHalfWidth, position.y - buttonHalfHeight, buttonWidth, buttonHeight, 6);
          ctx.stroke();
        } else {
          ctx.strokeRect(position.x - buttonHalfWidth, position.y - buttonHalfHeight, buttonWidth, buttonHeight);
        }
      }
      
      // Add text with better sizing and contrast for readability
      ctx.fillStyle = isSelected ? '#000000' : '#ffffff'; // Black text for selected (white background), white for normal
      ctx.font = 'bold 9px Arial'; // Increased from 7px to 9px for better readability
      ctx.textAlign = 'center';
      
      // Smart text sizing based on container width (60px total for new button size)
      let displayName = zoneName;
      
      // Handle combined zones - show both zone names
      if (config.zones && config.zones.length > 1) {
        // For IBPS1_IBVC, show as "IBPS1&IBVC" to fit in button
        if (zoneName === 'IBPS1_IBVC') {
          displayName = 'IBPS1&IBVC';
        } else {
          displayName = config.zones.join('/');
          if (displayName.length > 12) {
            displayName = config.zones.join('&');
          }
          if (displayName.length > 12) {
            displayName = config.zones[0] + '+' + config.zones.length;
          }
        }
      } else if (zoneName.length > 12) {
        displayName = zoneName.substring(0, 10) + '...';
      }
      
      ctx.fillText(displayName, position.x, position.y + 2);
      
      // Add transaction count and percentage below the button - always show, including 0 counts
      const zoneCount = getZoneTransactionCount(zoneName);
      const totalTransactions = getTotalPickupTransactions();
      const percentage = totalTransactions > 0 ? ((zoneCount / totalTransactions) * 100).toFixed(1) : '0.0';
      
      ctx.fillStyle = '#ffffff'; // White text for visibility on dark background
      ctx.font = 'bold 12px Arial'; // Slightly smaller to fit both lines
      ctx.textAlign = 'center';
      
      // First line: transaction count
      ctx.fillText(`${zoneCount} txns`, position.x, position.y + buttonHalfHeight + 12);
      
      // Second line: percentage
      ctx.font = '10px Arial'; // Smaller font for percentage
      ctx.fillStyle = '#cccccc'; // Lighter color for percentage
      ctx.fillText(`(${percentage}%)`, position.x, position.y + buttonHalfHeight + 25);
    }
  });
  
  // Add centered title - white for dark theme
  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Warehouse Transaction Heat Map', canvas.width / 2, 25);
  
  // Add filter indicator if a pickup zone is selected
  if (selectedPickupZone) {
    ctx.fillStyle = '#00bfff'; // Bright blue for dark theme
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Filtered by: ${selectedPickupZone}`, canvas.width / 2, 45);
    
    ctx.fillStyle = '#cccccc'; // Light gray for dark theme
    ctx.font = '10px Arial';
    ctx.fillText('(Click zone again to clear filter)', canvas.width / 2, 58);
  }
  
  // Add filter indicator if a color filter is selected
  if (activeColorFilter) {
    const yOffset = selectedPickupZone ? 75 : 45; // Offset if pickup zone filter is also active
    ctx.fillStyle = '#ff6b6b'; // Bright red for visibility
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Color Filter: ${activeColorFilter.toUpperCase()}`, canvas.width / 2, yOffset);
    
    ctx.fillStyle = '#cccccc'; // Light gray for dark theme
    ctx.font = '10px Arial';
    ctx.fillText('(Click button again to clear filter)', canvas.width / 2, yOffset + 13);
  }
  
  // Center label for pickup zones area - white for visibility
  ctx.font = '12px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  const pickupAreaY = selectedPickupZone ? pickupZone.y + 15 : pickupZone.y + 15;
  ctx.fillText('Inbound Dock & Pickup Zones (Click to Filter)', pickupZone.x + (pickupZone.width / 2), pickupAreaY);
  
}

function isValidAisleLocation(aisle, locationString = '') {
  // Check if aisle is a regular numbered aisle (14-124)
  if (typeof aisle === 'number' && aisle >= 14 && aisle <= 124) {
    return true;
  }
  
  // Check if aisle is an extension aisle (03, 04)
  if (typeof aisle === 'number' && (aisle === 3 || aisle === 4)) {
    return true;
  }
  
  // Check if aisle is an S-aisle (S01-S06)
  if (typeof aisle === 'string' && aisle.match(/^S0[1-6]$/)) {
    return true;
  }
  
  // Filter out dock locations - any 212 code locations that contain dock-related patterns
  if (locationString && typeof locationString === 'string') {
    const location = locationString.toUpperCase();
    // Filter out dock doors, dock zones, and other non-racking locations
    if (location.includes('DOCK') || 
        location.includes('DOOR') || 
        location.match(/^D\d+/) || // D01, D02, etc. (dock doors)
        location.includes('SHIP') ||
        location.includes('STAGE') ||
        location.includes('RETURN') ||
        location.includes('PROBLEM') ||
        location.includes('HOLD') ||
        location.includes('DAMAGE') ||
        // Filter out pickup zones that appear as putaway destinations (error transactions)
        location.match(/^REC\d+/) || // REC7701, REC6701, etc.
        location === 'RECVASOUT' ||
        location === 'BPFLIP' ||
        location.match(/^IB/) || // IBCONT01, IBPS1, IBVC, etc.
        // Filter out short/invalid location codes
        (location.includes('REC') && location.length < 6)) {
      return false;
    }
  }
  
  return false;
}

function generateHeatmapData() {
  const selectedTM = document.getElementById('heatmapTMSelector')?.value || 'all';
  const transactionType = document.getElementById('heatmapTransactionType')?.value || 'all';
  
  let transactionsToAnalyze = [];
  
  if (selectedTM === 'all') {
    transactionsToAnalyze = rtTransactionData || [];
  } else {
    transactionsToAnalyze = (rtTransactionData || []).filter(t => 
      t.putaway.employeeId === selectedTM
    );
  }
  
  if (transactionType === 'long') {
    transactionsToAnalyze = transactionsToAnalyze.filter(t => 
      t.putaway.timeToExecute > 600 // >10 minutes
    );
  }
  
  // Filter by selected pickup zone if one is selected
  if (selectedPickupZone) {
    const selectedZoneConfig = WAREHOUSE_CONFIG.pickupZones[selectedPickupZone];
    if (selectedZoneConfig && selectedZoneConfig.zones) {
      // Combined zone - filter by any of the individual zones
      transactionsToAnalyze = transactionsToAnalyze.filter(t => 
        selectedZoneConfig.zones.includes(t.pickup.fromLocation)
      );
    } else {
      // Single zone - filter by exact match
      transactionsToAnalyze = transactionsToAnalyze.filter(t => 
        t.pickup.fromLocation === selectedPickupZone
      );
    }
  }
  
  // Filter by selected rack color if one is selected (exact same pattern as pickup zones)
  if (activeColorFilter) {
    if (activeColorFilter === 'green') {
      // Ground levels: A, B, C
      transactionsToAnalyze = transactionsToAnalyze.filter(t => {
        const toLocation = t.putaway.toLocation;
        return toLocation && (toLocation.includes('-A') || toLocation.includes('-B') || toLocation.includes('-C'));
      });
    } else if (activeColorFilter === 'yellow') {
      // Mid levels: D, G, J  
      transactionsToAnalyze = transactionsToAnalyze.filter(t => {
        const toLocation = t.putaway.toLocation;
        return toLocation && (toLocation.includes('-D') || toLocation.includes('-G') || toLocation.includes('-J'));
      });
    } else if (activeColorFilter === 'red') {
      // High levels: M, P, S
      transactionsToAnalyze = transactionsToAnalyze.filter(t => {
        const toLocation = t.putaway.toLocation;
        return toLocation && (toLocation.includes('-M') || toLocation.includes('-P') || toLocation.includes('-S'));
      });
    }
  }
  
  // Count transactions by location
  const locationCounts = {};
  const locationDetails = {};
  
  transactionsToAnalyze.forEach(transaction => {
    const toLocation = transaction.putaway.toLocation;
    
    // First check if the putaway location is a pickup zone or invalid location
    if (!toLocation || typeof toLocation !== 'string') {
      return; // Skip invalid locations
    }
    
    const locationUpper = toLocation.toUpperCase();
    // Enhanced filtering - reject any putaway going to pickup zones or dock areas
    if (locationUpper.match(/^REC\d+/) || // REC7701, REC6701, etc.
        locationUpper === 'RECVASOUT' ||
        locationUpper === 'BPFLIP' ||
        locationUpper.match(/^IB/) || // IBCONT01, IBPS1, IBVC, etc.
        locationUpper.includes('DOCK') ||
        locationUpper.includes('DOOR') ||
        locationUpper.includes('STAGE') ||
        locationUpper.includes('RETURN') ||
        locationUpper.includes('PROBLEM') ||
        locationUpper.includes('HOLD') ||
        locationUpper.includes('DAMAGE') ||
        // Additional filtering for unusual location formats
        toLocation.length < 4 || // Too short to be a valid location
        locationUpper.match(/^D\d+/) || // Dock doors D01, D02, etc.
        locationUpper.includes('SHIP') ||
        locationUpper.includes('RECEIVE') ||
        locationUpper.includes('TEMP') ||
        locationUpper.includes('SORT') ||
        locationUpper.includes('CONV') || // Conveyor
        locationUpper.includes('BELT') ||
        locationUpper.match(/^\d{1,2}$/) || // Just numbers like "1", "12"
        !locationUpper.match(/[A-Z]/) // Must contain at least one letter
        ) {
      return; // Skip these transactions
    }
    
    const travelMetrics = calculatePutawayTravelMetrics(transaction);
    
    if (travelMetrics && travelMetrics.toParsed && travelMetrics.toParsed.aisle) {
      const aisle = travelMetrics.toParsed.aisle;
      
      // Filter to only include valid aisle locations (aisles, S-aisles, or extension aisles)
      // Also filter out dock locations and staging areas
      const isValidAisle = isValidAisleLocation(aisle, transaction.putaway.toLocation);
      if (!isValidAisle) {
        return; // Skip non-aisle transactions
      }
      
      const locationKey = `${aisle}-${travelMetrics.toParsed.bay || 0}`;
      
      if (!locationCounts[locationKey]) {
        locationCounts[locationKey] = 0;
        locationDetails[locationKey] = {
          aisle: aisle,
          bay: travelMetrics.toParsed.bay || 0,
          rackLevel: travelMetrics.toParsed.level || 'UNKNOWN', // Store rack level for coloring
          transactions: [],
          totalTime: 0,
          avgTime: 0
        };
      }
      
      locationCounts[locationKey]++;
      locationDetails[locationKey].transactions.push({
        employeeId: transaction.putaway.employeeId,
        timeMinutes: (transaction.putaway.timeToExecute / 60).toFixed(1),
        fromLocation: transaction.pickup.fromLocation,
        toLocation: transaction.putaway.toLocation,
        rackLevel: travelMetrics.toParsed.level || 'UNKNOWN'
      });
      locationDetails[locationKey].totalTime += transaction.putaway.timeToExecute;
    }
  });
  
  // Calculate averages
  Object.keys(locationDetails).forEach(key => {
    const detail = locationDetails[key];
    detail.avgTime = (detail.totalTime / detail.transactions.length / 60).toFixed(1);
  });
  
  currentHeatmapData = {
    counts: locationCounts,
    details: locationDetails,
    totalTransactions: transactionsToAnalyze.length,
    selectedTM: selectedTM,
    transactionType: transactionType
  };
  
  heatmapTransactionData = transactionsToAnalyze;
  
  return currentHeatmapData;
}

function drawHeatmap() {
  if (!warehouseCtx) return;
  
  // Clear canvas completely
  warehouseCtx.clearRect(0, 0, warehouseCanvas.width, warehouseCanvas.height);
  warehouseCtx.fillStyle = '#000000';
  warehouseCtx.fillRect(0, 0, warehouseCanvas.width, warehouseCanvas.height);
  
  drawWarehouseLayout();
  
  // Clear previous single transaction coordinates
  singleTransactionCoordinates = [];
  
  const heatmapData = generateHeatmapData();
  const ctx = warehouseCtx;
  
  // Calculate statistics for sidebar
  calculateAndDisplayStats(heatmapData);
  
  // Draw heat map points using proper bay positioning
  let dotsDrawn = 0;
  Object.entries(heatmapData.counts).forEach(([locationKey, count]) => {
    const detail = heatmapData.details[locationKey];
    const position = getBayPosition(detail.aisle, detail.bay);
    
    if (!position) {
      return;
    }
    
    const color = getHeatmapColor(count, detail.rackLevel);
    const radius = Math.min(Math.max(count * 1.5 + 3, 4), 15);
    
    dotsDrawn++;
    
    // Track single transactions for hover events
    if (count === 1 && detail.transactions && detail.transactions.length > 0) {
      singleTransactionCoordinates.push({
        x: position.x,
        y: position.y,
        radius: radius + 2, // Slightly larger hit area for better UX
        location: detail.transactions[0].toLocation, // Get original location string
        aisle: detail.aisle,
        bay: detail.bay,
        rackLevel: detail.rackLevel
      });
    }
    
    // Draw heat point with bright glow effect for dark theme
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowBlur = 0;
    
    // Draw bright border for definition
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw count if significant (use black text for visibility on bright colors)
    if (count > 2) {
      ctx.fillStyle = '#000000'; // Black text for visibility on bright colors
      ctx.font = 'bold 8px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(count.toString(), position.x, position.y + 2);
    }
  });
  
  console.log(`🟢 DOTS DRAWN: ${dotsDrawn} dots on canvas (filter: ${activeColorFilter || 'none'})`);
  
  // Draw selection rectangle if active (only completed selections)
  if (selectedRectangle) {
    drawSelectionRectangle();
  }
  
  // Cache the heat map image for performance during rectangle selection
  if (warehouseCtx) {
    heatmapImageData = warehouseCtx.getImageData(0, 0, warehouseCanvas.width, warehouseCanvas.height);
  }
  
  updateHeatmapStats();
  
  // Update rectangle selection stats if there's an active selection
  updateRectangleSelectionAfterFilter();
}

// Rectangle Selection System
function setupRectangleSelectionListeners() {
  const rectangleSelectBtn = document.getElementById('rectangleSelectBtn');
  const clearSelectionBtn = document.getElementById('clearSelectionBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  
  if (rectangleSelectBtn) {
    rectangleSelectBtn.addEventListener('click', toggleRectangleSelection);
  }
  
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener('click', clearRectangleSelection);
  }
  
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllFilters);
  }
  
  // Setup color filter buttons
  setupColorFilterListeners();
}

function toggleRectangleSelection() {
  rectangleSelectionEnabled = !rectangleSelectionEnabled;
  const btn = document.getElementById('rectangleSelectBtn');
  
  if (rectangleSelectionEnabled) {
    btn.textContent = '📐 Exit Select Mode';
    btn.classList.add('btn-warning');
    btn.classList.remove('btn-secondary');
    warehouseCanvas.style.cursor = 'crosshair';
    
    // Show stats area immediately when entering selection mode
    document.getElementById('rectangleSelectionStats').style.display = 'block';
    // Initialize with zero values
    document.getElementById('selectedAreaTransactions').textContent = '0';
    document.getElementById('selectedAreaPercentage').textContent = '0%';
    document.getElementById('selectedAreaLocations').textContent = '0';
  } else {
    btn.textContent = '📐 Rectangle Select';
    btn.classList.add('btn-secondary');
    btn.classList.remove('btn-warning');
    warehouseCanvas.style.cursor = 'default';
    isDrawingRectangle = false;
    
    // Hide stats area when exiting selection mode
    if (!selectedRectangle) {
      document.getElementById('rectangleSelectionStats').style.display = 'none';
    }
  }
}

function clearRectangleSelection() {
  selectedRectangle = null;
  isDrawingRectangle = false;
  heatmapImageData = null; // Clear cache to force fresh draw
  document.getElementById('rectangleSelectionStats').style.display = 'none';
  document.getElementById('clearSelectionBtn').style.display = 'none';
  drawHeatmap(); // Redraw without selection rectangle
}

// Color Filter System
let activeColorFilter = null; // 'green', 'yellow', 'red', or null

function setupColorFilterListeners() {
  const filterGreenBtn = document.getElementById('filterGreenBtn');
  const filterYellowBtn = document.getElementById('filterYellowBtn');
  const filterRedBtn = document.getElementById('filterRedBtn');
  
  // Remove existing listeners to prevent duplicates
  if (filterGreenBtn) {
    filterGreenBtn.replaceWith(filterGreenBtn.cloneNode(true));
    document.getElementById('filterGreenBtn').addEventListener('click', () => toggleColorFilter('green'));
  }
  
  if (filterYellowBtn) {
    filterYellowBtn.replaceWith(filterYellowBtn.cloneNode(true));
    document.getElementById('filterYellowBtn').addEventListener('click', () => toggleColorFilter('yellow'));
  }
  
  if (filterRedBtn) {
    filterRedBtn.replaceWith(filterRedBtn.cloneNode(true));
    document.getElementById('filterRedBtn').addEventListener('click', () => toggleColorFilter('red'));
  }
}

function toggleColorFilter(color) {
  // Simple toggle: if same color is clicked again, turn off filter
  if (activeColorFilter === color) {
    activeColorFilter = null;
  } else {
    activeColorFilter = color;
  }
  
  updateColorFilterButtons();
  drawHeatmap(); // Redraw with color filter
}

function updateColorFilterButtons() {
  const buttons = {
    'green': document.getElementById('filterGreenBtn'),
    'yellow': document.getElementById('filterYellowBtn'),
    'red': document.getElementById('filterRedBtn')
  };
  
  // Update button styling - simple pressed/unpressed look
  Object.keys(buttons).forEach(color => {
    const btn = buttons[color];
    if (btn) {
      const isActive = activeColorFilter === color;
      
      if (isActive) {
        // Active state - pressed look
        btn.style.backgroundColor = color === 'green' ? '#198754' : color === 'yellow' ? '#e0a800' : '#c82333';
        btn.style.transform = 'scale(0.95)';
        btn.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.3)';
      } else {
        // Inactive state - normal
        btn.style.backgroundColor = color === 'green' ? '#28a745' : color === 'yellow' ? '#ffc107' : '#dc3545';
        btn.style.transform = 'scale(1.0)';
        btn.style.boxShadow = 'none';
      }
    }
  });
}

function matchesColorFilter(rackLevel, colorFilter) {
  // If no color filter is active, show everything
  if (!colorFilter) return true;
  
  // If there's no rack level, don't show it when filtering
  if (!rackLevel) return false;
  
  const level = rackLevel.toUpperCase();
  
  switch (colorFilter) {
    case 'green':
      return ['A', 'B', 'C'].includes(level);
    case 'yellow': 
      return ['D', 'G', 'J'].includes(level);
    case 'red':
      return ['M', 'P', 'S'].includes(level);
    default:
      return false;
  }
}

function clearAllFilters() {
  // Reset all filters to default state
  activeColorFilter = null;
  selectedPickupZone = null;
  selectedRectangle = null;
  isDrawingRectangle = false;
  rectangleSelectionEnabled = false;
  heatmapImageData = null;
  
  // Reset UI elements
  document.getElementById('heatmapTMSelector').value = 'all';
  document.getElementById('heatmapTransactionType').value = 'all';
  document.getElementById('rectangleSelectionStats').style.display = 'none';
  document.getElementById('clearSelectionBtn').style.display = 'none';
  
  // Reset rectangle select button
  const rectangleBtn = document.getElementById('rectangleSelectBtn');
  if (rectangleBtn) {
    rectangleBtn.textContent = '📐 Rectangle Select';
    rectangleBtn.classList.remove('btn-warning');
    rectangleBtn.classList.add('btn-secondary');
  }
  
  updateColorFilterButtons();
  drawHeatmap(); // Redraw with no filters
}

function drawSelectionRectangle() {
  if (!warehouseCtx) return;
  
  let rect = null;
  
  if (isDrawingRectangle && rectangleSelectionEnabled) {
    // Draw preview rectangle while dragging
    rect = {
      startX: Math.min(rectangleStart.x, rectangleEnd.x),
      startY: Math.min(rectangleStart.y, rectangleEnd.y),
      endX: Math.max(rectangleStart.x, rectangleEnd.x),
      endY: Math.max(rectangleStart.y, rectangleEnd.y)
    };
  } else if (selectedRectangle) {
    // Draw completed selection rectangle
    rect = selectedRectangle;
  }
  
  if (rect) {
    const ctx = warehouseCtx;
    const width = rect.endX - rect.startX;
    const height = rect.endY - rect.startY;
    
    // Draw rectangle outline
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(rect.startX, rect.startY, width, height);
    
    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(rect.startX, rect.startY, width, height);
    
    // Reset line dash
    ctx.setLineDash([]);
  }
}

function drawRectanglePreview() {
  if (!warehouseCtx || !heatmapImageData || !isDrawingRectangle) return;
  
  // Restore the cached heat map image
  warehouseCtx.putImageData(heatmapImageData, 0, 0);
  
  // Draw the preview rectangle
  const rect = {
    startX: Math.min(rectangleStart.x, rectangleEnd.x),
    startY: Math.min(rectangleStart.y, rectangleEnd.y),
    endX: Math.max(rectangleStart.x, rectangleEnd.x),
    endY: Math.max(rectangleStart.y, rectangleEnd.y)
  };
  
  const ctx = warehouseCtx;
  const width = rect.endX - rect.startX;
  const height = rect.endY - rect.startY;
  
  // Only draw if rectangle has some size
  if (width > 5 && height > 5) {
    // Draw rectangle outline
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(rect.startX, rect.startY, width, height);
    
    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
    ctx.fillRect(rect.startX, rect.startY, width, height);
    
    // Reset line dash
    ctx.setLineDash([]);
  }
}

function calculateRectangleSelectionStats(rect = null) {
  // Use provided rectangle or fall back to selectedRectangle
  const targetRect = rect || selectedRectangle;
  if (!targetRect || !currentHeatmapData) return;
  
  let selectedTransactions = 0;
  let selectedLocations = 0;
  const totalTransactions = currentHeatmapData.totalTransactions || 0;
  
  // Check each location to see if it's within the selected rectangle
  Object.entries(currentHeatmapData.counts).forEach(([locationKey, count]) => {
    const detail = currentHeatmapData.details[locationKey];
    const position = getBayPosition(detail.aisle, detail.bay);
    
    if (position && isPointInRectangle(position.x, position.y, targetRect)) {
      selectedTransactions += count;
      selectedLocations++;
    }
  });
  
  const percentage = totalTransactions > 0 ? ((selectedTransactions / totalTransactions) * 100).toFixed(1) : '0.0';
  
  // Update display
  document.getElementById('selectedAreaTransactions').textContent = selectedTransactions;
  document.getElementById('selectedAreaPercentage').textContent = percentage + '%';
  document.getElementById('selectedAreaLocations').textContent = selectedLocations;
  document.getElementById('rectangleSelectionStats').style.display = 'block';
  
  // Show filter information if any filters are active
  updateRectangleFilterInfo();
}

function calculateLiveRectangleStats() {
  if (!isDrawingRectangle || !rectangleSelectionEnabled) return;
  
  // Create preview rectangle for stats calculation
  const previewRect = {
    startX: Math.min(rectangleStart.x, rectangleEnd.x),
    startY: Math.min(rectangleStart.y, rectangleEnd.y),
    endX: Math.max(rectangleStart.x, rectangleEnd.x),
    endY: Math.max(rectangleStart.y, rectangleEnd.y)
  };
  
  // Only calculate if rectangle has meaningful size
  const width = previewRect.endX - previewRect.startX;
  const height = previewRect.endY - previewRect.startY;
  
  if (width > 20 && height > 20) {
    calculateRectangleSelectionStats(previewRect);
  }
}

function isPointInRectangle(x, y, rect) {
  return x >= rect.startX && x <= rect.endX && y >= rect.startY && y <= rect.endY;
}

function updateRectangleSelectionAfterFilter() {
  // Update rectangle selection stats if there's an active selection or selection mode is on
  if (selectedRectangle || (rectangleSelectionEnabled && isDrawingRectangle)) {
    if (selectedRectangle) {
      // Update completed selection
      calculateRectangleSelectionStats();
    } else if (isDrawingRectangle) {
      // Update preview selection
      calculateLiveRectangleStats();
    }
  }
}

function updateRectangleFilterInfo() {
  const filterInfoDiv = document.getElementById('rectangleFilterInfo');
  if (!filterInfoDiv) return;
  
  const selectedTM = document.getElementById('heatmapTMSelector')?.value || 'all';
  const transactionType = document.getElementById('heatmapTransactionType')?.value || 'all';
  
  let filterParts = [];
  
  // Check for active filters
  if (selectedTM !== 'all') {
    const tmOption = document.querySelector(`#heatmapTMSelector option[value="${selectedTM}"]`);
    const tmText = tmOption ? tmOption.textContent.split(' - ')[0] : selectedTM;
    filterParts.push(`TM: ${tmText}`);
  }
  
  if (transactionType !== 'all') {
    filterParts.push(`Type: ${transactionType === 'long' ? 'Long Transactions' : transactionType}`);
  }
  
  if (selectedPickupZone) {
    filterParts.push(`Zone: ${selectedPickupZone}`);
  }
  
  if (filterParts.length > 0) {
    filterInfoDiv.innerHTML = `🔍 Filtered by: ${filterParts.join(', ')}`;
    filterInfoDiv.style.display = 'block';
  } else {
    filterInfoDiv.style.display = 'none';
  }
}

function updateHeatmapStats() {
  if (!currentHeatmapData) return;
  
  const data = currentHeatmapData;
  
  // Find hottest aisle (aggregate by aisle number)
  const aisleTransactions = {};
  Object.entries(data.counts).forEach(([key, count]) => {
    const detail = data.details[key];
    const aisleNumber = detail.aisle;
    
    if (!aisleTransactions[aisleNumber]) {
      aisleTransactions[aisleNumber] = 0;
    }
    aisleTransactions[aisleNumber] += count;
  });
  
  let hottestAisle = { aisle: 'None', count: 0, percentage: 0 };
  Object.entries(aisleTransactions).forEach(([aisle, count]) => {
    if (count > hottestAisle.count) {
      hottestAisle = { 
        aisle, 
        count, 
        percentage: data.totalTransactions > 0 ? ((count / data.totalTransactions) * 100).toFixed(1) : 0
      };
    }
  });
  
  // Calculate transactions beyond breezeway (bay > 21)
  let beyondBreezewayCount = 0;
  Object.entries(data.counts).forEach(([key, count]) => {
    const detail = data.details[key];
    const bayNumber = detail.bay;
    
    if (bayNumber > 21) {
      beyondBreezewayCount += count;
    }
  });
  
  const beyondBreezewayPercent = data.totalTransactions > 0 ?
    ((beyondBreezewayCount / data.totalTransactions) * 100).toFixed(1) : '0.0';

  // Update the sidebar metrics
  const hottestAisleElement = document.getElementById('hottestAisleStat');
  const beyondBreezewayComboElement = document.getElementById('beyondBreezewayCombo');

  if (hottestAisleElement) {
    hottestAisleElement.textContent = hottestAisle.aisle !== 'None' ?
      `${hottestAisle.aisle} (${hottestAisle.count}, ${hottestAisle.percentage}%)` : 'None';
  }

  if (beyondBreezewayComboElement) {
    beyondBreezewayComboElement.textContent = `${beyondBreezewayCount} (${beyondBreezewayPercent}%)`;
  }

  // Update pickup zone travel table
  updatePickupZoneMetric();
}

function updatePickupZoneMetric() {
  // Calculate pickup zone estimated travel times using raw transaction data
  const pickupZoneTravelTimes = {};
  let totalEstimatedTravelTime = 0;
  let totalTransactionsWithEstimates = 0;

  if (rtTransactionData && rtTransactionData.length > 0) {
    rtTransactionData.forEach(transaction => {
      const pickupZone = transaction.pickup?.fromLocation;
      const travelMetrics = calculateTravelMetrics(transaction);

      // Calculate estimated travel time from travel metrics components
      let estimatedTravelTime = 0;
      if (travelMetrics && travelMetrics.aislesTraversed >= 0 && travelMetrics.bayDepth >= 0 && travelMetrics.rackLevel >= 0) {
        const travelTimeResult = calculateEstimatedTravelTime(
          travelMetrics.aislesTraversed,
          travelMetrics.bayDepth,
          travelMetrics.rackLevel
        );
        estimatedTravelTime = travelTimeResult ? travelTimeResult.totalEstimatedMinutes : 0;
      }

      if (pickupZone && estimatedTravelTime > 0) {
        if (!pickupZoneTravelTimes[pickupZone]) {
          pickupZoneTravelTimes[pickupZone] = { totalTime: 0, count: 0 };
        }
        pickupZoneTravelTimes[pickupZone].totalTime += estimatedTravelTime;
        pickupZoneTravelTimes[pickupZone].count += 1;

        // Track overall totals for comparison
        totalEstimatedTravelTime += estimatedTravelTime;
        totalTransactionsWithEstimates += 1;
      }
    });
  }

  // Calculate overall average estimated travel time
  const overallAvgEstimatedTravelTime = totalTransactionsWithEstimates > 0 ?
    (totalEstimatedTravelTime / totalTransactionsWithEstimates) : 0;

  // Get all pickup zones and order them by their paired aisle (left to right on map)
  const orderedZones = Object.entries(WAREHOUSE_CONFIG.pickupZones)
    .map(([zoneName, config]) => ({
      name: zoneName,
      pairedAisle: config.pairedAisle,
      isCombo: config.zones !== undefined,
      zones: config.zones || [zoneName]
    }))
    .sort((a, b) => a.pairedAisle - b.pairedAisle);

  // Build the pickup zone travel table
  const pickupZoneListElement = document.getElementById('pickupZoneList');
  if (pickupZoneListElement) {
    pickupZoneListElement.innerHTML = '';

    orderedZones.forEach(zoneInfo => {
      // Calculate travel data for this zone (handling combo zones)
      let zoneData = { totalTime: 0, count: 0 };

      zoneInfo.zones.forEach(zoneName => {
        if (pickupZoneTravelTimes[zoneName]) {
          zoneData.totalTime += pickupZoneTravelTimes[zoneName].totalTime;
          zoneData.count += pickupZoneTravelTimes[zoneName].count;
        }
      });

      // Create row for this zone
      const zoneRow = document.createElement('div');
      zoneRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 2px 0; font-size: 12px;';

      const zoneName = document.createElement('span');
      zoneName.style.cssText = 'color: #212529; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 1;';
      zoneName.textContent = zoneInfo.name;

      const zoneValue = document.createElement('span');
      zoneValue.style.cssText = 'color: #212529; font-weight: bold; white-space: nowrap; margin-left: 8px; flex-shrink: 0;';

      if (zoneData.count > 0) {
        const avgTime = zoneData.totalTime / zoneData.count;
        const comparisonPercent = overallAvgEstimatedTravelTime > 0 ?
          (((avgTime - overallAvgEstimatedTravelTime) / overallAvgEstimatedTravelTime) * 100) : 0;

        const comparisonText = Math.abs(comparisonPercent) >= 1 ?
          (comparisonPercent > 0 ? ` +${comparisonPercent.toFixed(0)}%` : ` ${comparisonPercent.toFixed(0)}%`) : '';

        zoneValue.textContent = `${avgTime.toFixed(1)}m${comparisonText}`;

        // Color code based on performance
        if (comparisonPercent > 10) {
          zoneValue.style.color = '#dc3545'; // Red for slow zones
        } else if (comparisonPercent < -10) {
          zoneValue.style.color = '#28a745'; // Green for fast zones
        }
      } else {
        zoneValue.textContent = 'No data';
        zoneValue.style.color = '#6c757d';
      }

      zoneRow.appendChild(zoneName);
      zoneRow.appendChild(zoneValue);
      pickupZoneListElement.appendChild(zoneRow);
    });
  }
}

function handleHeatmapMouseMove(event) {
  // Handle mouse hover for tooltips
  const rect = warehouseCanvas.getBoundingClientRect();
  const displayX = event.clientX - rect.left;
  const displayY = event.clientY - rect.top;
  
  // Scale coordinates to match canvas internal coordinates
  const scaleX = warehouseCanvas.width / rect.width;
  const scaleY = warehouseCanvas.height / rect.height;
  const x = displayX * scaleX;
  const y = displayY * scaleY;
  
  // Handle rectangle selection drawing with throttling
  if (rectangleSelectionEnabled && isDrawingRectangle) {
    rectangleEnd = { x, y };
    
    const now = Date.now();
    
    // Throttle preview updates to improve performance (~60fps)
    if (now - lastPreviewTime > 16) {
      requestAnimationFrame(drawRectanglePreview);
      lastPreviewTime = now;
    }
    
    // Throttle stats updates to improve performance (~10fps for stats)
    if (now - lastStatsUpdateTime > 100) {
      requestAnimationFrame(calculateLiveRectangleStats);
      lastStatsUpdateTime = now;
    }
    
    return;
  }
  
  // Check if mouse is over a pickup zone first
  let hoveredPickupZone = null;
  Object.entries(WAREHOUSE_CONFIG.pickupZones).forEach(([zoneName, config]) => {
    const position = getPickupZonePosition(zoneName);
    if (position) {
      // Check if mouse is within pickup zone bounds (60x35 buttons)
      const buttonHalfWidth = 30; // 60 / 2
      const buttonHalfHeight = 17.5; // 35 / 2
      if (x >= position.x - buttonHalfWidth && x <= position.x + buttonHalfWidth &&
          y >= position.y - buttonHalfHeight && y <= position.y + buttonHalfHeight) {
        hoveredPickupZone = zoneName;
      }
    }
  });
  
  // Change cursor style for pickup zones
  if (hoveredPickupZone) {
    warehouseCanvas.style.cursor = 'pointer';
    hideHeatmapTooltip(); // Hide location tooltips when over pickup zones
    return;
  } else {
    warehouseCanvas.style.cursor = 'default';
  }
  
  // Check if mouse is over a single transaction first (priority over grouped transactions)
  let hoveredSingleTransaction = null;
  for (const singleTx of singleTransactionCoordinates) {
    const distance = Math.sqrt(Math.pow(x - singleTx.x, 2) + Math.pow(y - singleTx.y, 2));
    if (distance <= singleTx.radius) {
      hoveredSingleTransaction = singleTx;
      break; // Take the first match
    }
  }
  
  // If hovering over a single transaction, show its specific location
  if (hoveredSingleTransaction) {
    showSingleTransactionTooltip(event, hoveredSingleTransaction);
    updateHoverDetails(hoveredSingleTransaction);
    return;
  }
  
  // Otherwise, check for grouped transactions (existing behavior)
  let hoveredLocation = null;
  Object.entries(currentHeatmapData.details || {}).forEach(([locationKey, detail]) => {
    const position = getBayPosition(detail.aisle, detail.bay);
    if (!position) return;
    
    const distance = Math.sqrt(Math.pow(x - position.x, 2) + Math.pow(y - position.y, 2));
    const radius = Math.min(Math.max(currentHeatmapData.counts[locationKey] * 1.5 + 2, 3), 12);
    
    if (distance <= radius) {
      hoveredLocation = { key: locationKey, detail, count: currentHeatmapData.counts[locationKey] };
    }
  });
  
  if (hoveredLocation) {
    showHeatmapTooltip(event, hoveredLocation);
    clearHoverDetails();
  } else {
    hideHeatmapTooltip();
    clearHoverDetails();
  }
}

function showHeatmapTooltip(event, locationData) {
  const tooltip = document.getElementById('warehouseTooltip');
  if (!tooltip) return;
  
  const detail = locationData.detail;
  const count = locationData.count;
  
  const tooltipContent = `
    <strong>Aisle ${detail.aisle}, Bay ${detail.bay}</strong><br>
    Transactions: ${count}<br>
    Avg Time: ${detail.avgTime} min<br>
    ${detail.transactions.length > 1 ? `<small>TMs: ${detail.transactions.map(t => t.employeeId).slice(0, 3).join(', ')}${detail.transactions.length > 3 ? '...' : ''}</small>` : ''}
  `;
  
  tooltip.innerHTML = tooltipContent;
  tooltip.style.display = 'block';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY - 10 + 'px';
}

function showSingleTransactionTooltip(event, singleTransaction) {
  const tooltip = document.getElementById('warehouseTooltip');
  if (!tooltip) return;
  
  const tooltipContent = `
    <strong>📍 ${singleTransaction.location}</strong><br>
    <small>Aisle ${singleTransaction.aisle}, Bay ${singleTransaction.bay}, Level ${singleTransaction.rackLevel}</small><br>
    <em>Single Transaction</em>
  `;
  
  tooltip.innerHTML = tooltipContent;
  tooltip.style.display = 'block';
  tooltip.style.left = event.pageX + 10 + 'px';
  tooltip.style.top = event.pageY - 10 + 'px';
}

function hideHeatmapTooltip() {
  const tooltip = document.getElementById('warehouseTooltip');
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function updateHoverDetails(singleTransaction) {
  const hoverDetailsElement = document.getElementById('hoverDetails');
  if (hoverDetailsElement) {
    hoverDetailsElement.innerHTML = `📍 ${singleTransaction.location} • Aisle ${singleTransaction.aisle} • Bay ${singleTransaction.bay} • Level ${singleTransaction.rackLevel}`;
  }
}

function clearHoverDetails() {
  const hoverDetailsElement = document.getElementById('hoverDetails');
  if (hoverDetailsElement) {
    hoverDetailsElement.innerHTML = 'Hover over single transactions to see location';
  }
}

// Global variable to store pickup zone counts for display on buttons
let pickupZoneCounts = {};

function getZoneTransactionCount(zoneName) {
  // For combined zones, get the total of all individual zones
  const zoneConfig = WAREHOUSE_CONFIG.pickupZones[zoneName];
  if (zoneConfig && zoneConfig.zones) {
    // Combined zone - sum all individual zones
    return zoneConfig.zones.reduce((total, individualZone) => {
      return total + (pickupZoneCounts[individualZone] || 0);
    }, 0);
  } else {
    // Single zone - direct lookup
    return pickupZoneCounts[zoneName] || 0;
  }
}

function getTotalPickupTransactions() {
  // Sum all pickup zone transaction counts for percentage calculation
  return Object.values(pickupZoneCounts).reduce((total, count) => total + count, 0);
}

function calculatePickupZoneTotals() {
  // Calculate pickup zone totals from complete dataset, respecting employee and transaction type filters only
  const selectedTM = document.getElementById('heatmapTMSelector')?.value || 'all';
  const transactionType = document.getElementById('heatmapTransactionType')?.value || 'all';
  
  let transactionsForPickupCounts = [];
  
  // Apply employee filter only
  if (selectedTM === 'all') {
    transactionsForPickupCounts = rtTransactionData || [];
  } else {
    transactionsForPickupCounts = (rtTransactionData || []).filter(t => 
      t.putaway.employeeId === selectedTM
    );
  }
  
  // Apply transaction type filter only
  if (transactionType === 'long') {
    transactionsForPickupCounts = transactionsForPickupCounts.filter(t => 
      t.putaway.timeToExecute > 600 // >10 minutes
    );
  }
  
  // DO NOT apply pickup zone filter - we want totals for ALL pickup zones
  
  // Reset pickup zone counts
  pickupZoneCounts = {};
  
  // Count transactions by pickup zone from complete filtered dataset
  transactionsForPickupCounts.forEach(transaction => {
    const fromLocation = transaction.pickup.fromLocation;
    if (fromLocation) {
      pickupZoneCounts[fromLocation] = (pickupZoneCounts[fromLocation] || 0) + 1;
    }
  });
}

function calculateAndDisplayStats(heatmapData) {
  // Calculate rack level totals
  let groundTotal = 0;
  let midTotal = 0;
  let highTotal = 0;
  
  // Count transactions by rack level
  Object.entries(heatmapData.details || {}).forEach(([locationKey, detail]) => {
    const count = heatmapData.counts[locationKey] || 0;
    const rackLevel = detail.rackLevel || 'UNKNOWN';
    const level = rackLevel.toUpperCase();
    
    // Count by rack level
    if (['A', 'B', 'C'].includes(level)) {
      groundTotal += count;
    } else if (['D', 'G', 'J'].includes(level)) {
      midTotal += count;
    } else if (['M', 'P', 'S'].includes(level)) {
      highTotal += count;
    }
  });
  
  // Calculate pickup zone totals separately from filtered heatmap data
  calculatePickupZoneTotals();
  
  // Calculate percentages for rack levels
  const totalRackTransactions = groundTotal + midTotal + highTotal;
  const groundPercent = totalRackTransactions > 0 ? ((groundTotal / totalRackTransactions) * 100).toFixed(1) : '0.0';
  const midPercent = totalRackTransactions > 0 ? ((midTotal / totalRackTransactions) * 100).toFixed(1) : '0.0';
  const highPercent = totalRackTransactions > 0 ? ((highTotal / totalRackTransactions) * 100).toFixed(1) : '0.0';
  
  // Update rack level totals display with percentages
  updateElement('groundTotal', `${groundTotal} (${groundPercent}%)`);
  updateElement('midTotal', `${midTotal} (${midPercent}%)`);
  updateElement('highTotal', `${highTotal} (${highPercent}%)`);
  
  // Pickup zone counts will be displayed on the buttons during canvas drawing
}

function handleHeatmapClick(event) {
  const rect = warehouseCanvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  
  // Scale coordinates to match canvas internal coordinates
  const scaleX = warehouseCanvas.width / rect.width;
  const scaleY = warehouseCanvas.height / rect.height;
  const x = clickX * scaleX;
  const y = clickY * scaleY;
  
  // Handle rectangle selection mode
  if (rectangleSelectionEnabled) {
    if (!isDrawingRectangle) {
      // Start drawing rectangle
      isDrawingRectangle = true;
      rectangleStart = { x, y };
      rectangleEnd = { x, y };
    } else {
      // Complete rectangle
      isDrawingRectangle = false;
      rectangleEnd = { x, y };
      selectedRectangle = {
        startX: Math.min(rectangleStart.x, rectangleEnd.x),
        startY: Math.min(rectangleStart.y, rectangleEnd.y),
        endX: Math.max(rectangleStart.x, rectangleEnd.x),
        endY: Math.max(rectangleStart.y, rectangleEnd.y)
      };
      calculateRectangleSelectionStats();
      drawHeatmap(); // Redraw with selection rectangle
      document.getElementById('clearSelectionBtn').style.display = 'inline-block';
    }
    return;
  }
  
  
  // Check if click is on a pickup zone
  let clickedZone = null;
  Object.entries(WAREHOUSE_CONFIG.pickupZones).forEach(([zoneName, config]) => {
    const position = getPickupZonePosition(zoneName);
    if (position) {
      // Check if click is within pickup zone bounds (60x35 rectangle)
      const buttonHalfWidth = 30; // 60 / 2  
      const buttonHalfHeight = 17.5; // 35 / 2
      const inBounds = x >= position.x - buttonHalfWidth && x <= position.x + buttonHalfWidth &&
                      y >= position.y - buttonHalfHeight && y <= position.y + buttonHalfHeight;
      
      if (inBounds) {
        clickedZone = zoneName;
      }
    }
  });
  
  if (clickedZone) {
    // Toggle pickup zone selection
    if (selectedPickupZone === clickedZone) {
      // Clicking the same zone deselects it
      selectedPickupZone = null;
    } else {
      // Select the clicked zone
      selectedPickupZone = clickedZone;
    }
    
    // Refresh the heat map with new filter
    drawHeatmap();
  } else {
    // Click was on the main map area - could add other functionality here
  }
}

function showWarehouseHeatMap() {
  const section = document.getElementById('warehouseHeatmapSection');
  if (section) {
    section.style.display = 'block';
    initializeWarehouseHeatMap();
    
    // Resize canvas to fit container
    const canvas = document.getElementById('warehouseCanvas');
    const container = canvas.parentElement;
    if (canvas && container) {
      const containerRect = container.getBoundingClientRect();
      // Maintain aspect ratio while fitting container
      const aspectRatio = 1200 / 700;
      let newWidth = containerRect.width;
      let newHeight = newWidth / aspectRatio;
      
      if (newHeight > containerRect.height) {
        newHeight = containerRect.height;
        newWidth = newHeight * aspectRatio;
      }
      
      canvas.style.width = newWidth + 'px';
      canvas.style.height = newHeight + 'px';
    }
    
    setTimeout(() => {
      drawHeatmap();
    }, 100);
  }
}

// Event listeners
document.getElementById('exportLongTransactionsBtn')?.addEventListener('click', exportLongTransactions);
document.getElementById('toggleLongTransactionView')?.addEventListener('click', toggleLongTransactionView);

// Page load handler
function handleRTPageLoad() {
  // Force checkmarks to be hidden immediately on page load
  setTimeout(() => {
    hideTransactionDataLoaded();
    hideLaborDataLoaded();
  }, 0);
  
  // Try to detect username from environment on page load
  if (!currentUserUsername) {
    const detectedUser = detectUsernameFromEnvironment();
    if (detectedUser) {
      currentUserUsername = detectedUser;
    }
  }
  
  const wasLeaving = localStorage.getItem('spa_isLeaving');
  
  if (!wasLeaving) {
    // Fresh page load - clear everything
    clearRTData();
  } else {
    const saved = localStorage.getItem(RT_STORAGE_KEY);
    if (saved) {
      try {
        rtTransactionData = JSON.parse(saved);
        // Reprocess data to rebuild processedTMData and other derived data
        // This is a simplified reload - full reprocessing would be better
        
        // Don't show checkmark on page load - only when user actually uploads data
        // Data restoration happens silently in background
        
        // Check if labor data exists and show checkmark
        if (laborHoursData && Object.keys(laborHoursData).length > 0) {
          showLaborDataLoaded();
        }
      } catch (e) {
        clearRTData();
      }
    } else {
      // No saved data, ensure checkmarks stay hidden
      hideTransactionDataLoaded();
      hideLaborDataLoaded();
    }
  }
  
  localStorage.removeItem('spa_isLeaving');
}

window.addEventListener("DOMContentLoaded", handleRTPageLoad);

// ===== STU CONVERSATION FUNCTIONALITY =====

function openSTUConversationForm(tmId) {
  const tmData = processedTMData[tmId];
  if (!tmData) {
    alert('TM data not found');
    return;
  }

  // Try to detect username but don't prompt - let user fill manually if needed
  if (!currentUserUsername) {
    const detectedUser = detectUsernameFromEnvironment();
    if (detectedUser) {
      currentUserUsername = detectedUser;
    }
  }

  // Generate current time
  const now = new Date();
  const timeCreated = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Get the actual STU reason from the TM card
  const stuReasons = getStuReasonForTM(tmId);
  const stuReasonText = stuReasons.length > 0 ? stuReasons.join(' • ') : 'STU required';
  
  // Generate recap text
  const recap = generateSTURecap(tmId, tmData, stuReasonText);

  // Create popup card HTML
  const modalHTML = `
    <div id="stuModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      box-sizing: border-box;
    " onclick="closeSTUModal(event)">
      <div style="
        background: white;
        border-radius: 8px;
        max-width: 800px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        position: relative;
      " onclick="event.stopPropagation()">
        <div style="
          background: linear-gradient(135deg, #1E88E5 0%, #1565C0 100%);
          color: white;
          padding: 1.5rem;
          border-radius: 8px 8px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <h3 style="margin: 0; font-size: 1.3rem;">💬 STU Conversation Summary</h3>
          <button onclick="closeSTUModal()" style="
            background: none;
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0.25rem;
          ">&times;</button>
        </div>
        
        <div style="padding: 2rem;">
          <form id="stuForm">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Time Created:</label>
                <input type="text" id="stuTimeCreated" value="${timeCreated}" readonly style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background-color: #f8f9fa; color: #6c757d; font-size: 0.95rem;
                ">
              </div>
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Shift:</label>
                <input type="text" id="stuShift" value="Days" readonly style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background-color: #f8f9fa; color: #6c757d; font-size: 0.95rem;
                ">
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">TM Username:</label>
                <input type="text" id="stuTMUsername" value="${tmId}" readonly style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background-color: #f8f9fa; color: #6c757d; font-size: 0.95rem;
                ">
              </div>
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Department:</label>
                <input type="text" id="stuDepartment" value="IB" readonly style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background-color: #f8f9fa; color: #6c757d; font-size: 0.95rem;
                ">
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Leader Entering STU: <span style="color: #dc3545;">*</span></label>
                <input type="text" id="stuLeaderUsername" value="${currentUserUsername || ''}" placeholder="Enter your username..." required style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background: white; font-size: 0.95rem;
                ">
              </div>
              <div>
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Location: <span style="color: #dc3545;">*</span></label>
                <input type="text" id="stuLocation" placeholder="Enter location where STU took place..." required style="
                  width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                  background: white; font-size: 0.95rem;
                ">
              </div>
            </div>
            
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">STU Category: <span style="color: #dc3545;">*</span></label>
              <select id="stuCategory" required style="
                width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                background: white; font-size: 0.95rem; cursor: pointer;
              ">
                <option value="">Select STU Category...</option>
                <option value="Time off Task">Time off Task</option>
                <option value="Extended/Unauthorized Break">Extended/Unauthorized Break</option>
                <option value="Failure to Follow Process">Failure to Follow Process</option>
                <option value="N/A">N/A</option>
              </select>
            </div>
            
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">Recap:</label>
              <textarea id="stuRecap" readonly style="
                width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                background-color: #f8f9fa; color: #6c757d; font-size: 0.95rem; resize: vertical; min-height: 80px;
              ">${recap}</textarea>
            </div>
            
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #212529;">TM Stated: <span style="color: #dc3545;">*</span></label>
              <textarea id="stuTMStated" placeholder="Enter TM's response and notes..." required style="
                width: 100%; padding: 0.75rem; border: 1px solid #ced4da; border-radius: 4px;
                background: white; font-size: 0.95rem; resize: vertical; min-height: 80px;
              "></textarea>
            </div>
            
            <div style="
              display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;
              padding-top: 1rem; border-top: 1px solid #dee2e6;
            ">
              <button type="button" onclick="closeSTUModal()" style="
                padding: 0.75rem 1.5rem; border: none; border-radius: 6px; font-weight: 600;
                cursor: pointer; background: #6c757d; color: white; font-size: 0.9rem;
              ">Cancel</button>
              <button type="button" id="copySTUDataBtn" onclick="copySTUDataToClipboard('${tmId}')" style="
                padding: 0.75rem 1.5rem; border: none; border-radius: 6px; font-weight: 600;
                cursor: pointer; background: linear-gradient(135deg, #1E88E5 0%, #1565C0 100%);
                color: white; font-size: 0.9rem; transition: all 0.3s ease;
              ">📋 Copy for Slack</button>
            </div>
            
            <div id="stuCopyInstructions" style="
              display: none; margin-top: 1.5rem; padding: 1rem; background: #d1ecf1;
              border: 1px solid #bee5eb; border-radius: 6px;
            ">
              <h4 style="margin: 0 0 1rem 0; color: #0c5460;">📋 Instructions:</h4>
              <ol style="margin: 0; padding-left: 1.5rem; color: #0c5460;">
                <li style="margin-bottom: 0.5rem;">STU data has been copied to your clipboard</li>
                <li style="margin-bottom: 0.5rem;">Open your team's Slack channel</li>
                <li style="margin-bottom: 0.5rem;">Paste (Ctrl+V) the formatted STU summary</li>
                <li>The message will appear with bold labels for easy reading</li>
              </ol>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;

  // Add to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Focus on first input
  setTimeout(() => {
    document.getElementById('stuLocation')?.focus();
  }, 100);
}

function getStuReasonForTM(tmId) {
  // Get the STU reasons that were calculated and stored when TM cards were generated
  const tmData = processedTMData[tmId];
  if (!tmData) return [];
  
  // Return the stored STU reasons, or empty array if none
  return tmData.stuReasons || [];
}

function generateSTURecap(tmId, tmData, stuReasonText) {
  const departmentAverages = calculateDepartmentAverages();
  
  // Get TPH
  const tph = tmData.laborSystemTPH || tmData.performanceMetrics.actualPutawayRate || 0;
  
  // Calculate travel metric comparisons - with safety checks
  const travelDistance = tmData.performanceMetrics.avgTravelAisles || 0;
  const travelDepth = tmData.performanceMetrics.avgTravelDepth || 0;
  const rackHeight = tmData.performanceMetrics.avgRackHeight || 0;
  
  // Safety check for department averages
  if (!departmentAverages || !departmentAverages.avgTravelAisles) {
    return `TM flagged for STU due to ${stuReasonText}. TM's TPH at time of STU was ${tph.toFixed(1)}. Travel metrics comparison unavailable.`;
  }
  
  const distanceComparison = ((travelDistance - departmentAverages.avgTravelAisles) / departmentAverages.avgTravelAisles * 100);
  const depthComparison = ((travelDepth - departmentAverages.avgTravelDepth) / departmentAverages.avgTravelDepth * 100);
  const heightComparison = ((rackHeight - departmentAverages.avgRackHeight) / departmentAverages.avgRackHeight * 100);
  
  const formatComparison = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };
  
  return `TM flagged for STU due to ${stuReasonText}. TM's TPH at time of STU was ${tph.toFixed(1)}. TM's travel metrics in comparison to the department avg at time of STU were Travel Distance: ${formatComparison(distanceComparison)}, Travel Depth: ${formatComparison(depthComparison)}, Rack Height: ${formatComparison(heightComparison)}.`;
}

function closeSTUModal(event) {
  if (event && event.target !== event.currentTarget) return;
  
  const modal = document.getElementById('stuModal');
  if (modal) {
    modal.remove();
  }
}

function copySTUDataToClipboard(tmId) {
  // Get form values
  const timeCreated = document.getElementById('stuTimeCreated').value;
  const shift = document.getElementById('stuShift').value;
  const tmUsername = document.getElementById('stuTMUsername').value;
  const department = document.getElementById('stuDepartment').value;
  const leaderUsername = document.getElementById('stuLeaderUsername').value.trim();
  const location = document.getElementById('stuLocation').value.trim();
  const stuCategory = document.getElementById('stuCategory').value;
  const recap = document.getElementById('stuRecap').value;
  const tmStated = document.getElementById('stuTMStated').value.trim();
  
  // Validate all required fields
  const requiredFields = [];
  
  if (!leaderUsername) {
    requiredFields.push('Leader Entering STU');
  }
  if (!location) {
    requiredFields.push('Location');
  }
  if (!stuCategory) {
    requiredFields.push('STU Category');
  }
  if (!tmStated) {
    requiredFields.push('TM Stated');
  }
  
  if (requiredFields.length > 0) {
    alert(`Please fill in the following required fields:\n• ${requiredFields.join('\n• ')}`);
    return;
  }
  
  // Create Slack-formatted message with bold field names
  const clipboardData = `**Time Created:** ${timeCreated}
**Shift:** ${shift}
**TM Username:** ${tmUsername}
**Department:** ${department}
**Leader Entering STU:** ${leaderUsername}
**Location:** ${location}
**STU Category:** ${stuCategory}
**Recap:** ${recap}
**TM Stated:** ${tmStated}`;
  
  // Copy to clipboard
  navigator.clipboard.writeText(clipboardData).then(() => {
    // Show success message and instructions
    document.getElementById('stuCopyInstructions').style.display = 'block';
    
    // Change button text temporarily
    const copyBtn = document.getElementById('copySTUDataBtn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '✅ Copied!';
    copyBtn.style.background = '#28a745';
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = 'linear-gradient(135deg, #1E88E5 0%, #1565C0 100%)';
    }, 3000);
    
  }).catch(err => {
    alert('Failed to copy to clipboard. Please try again.');
  });
}

// Close modal on Escape key
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeSTUModal();
  }
});

// ===== LABOR HOURS INTEGRATION FUNCTIONALITY =====

// Generate Labor Management System URL with current date
function generateLaborMgmtURL() {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  
  const startTime = `${year}-${month}-${day}+04%3A45`; // 04:45 AM
  const endTime = `${year}-${month}-${day}+16%3A45`;   // 16:45 PM
  
  return `https://labor-mgmt.scff.prd.chewy.com/postable_rate_report?warehouse=MDT1&laborFunctionId=328&startDate=${startTime}&endDate=${endTime}`;
}

// Parse labor hours data from pasted text
function parseLaborHoursData(pastedText) {
  try {
    const lines = pastedText.split('\n');
    const laborData = {};
    let isDataSection = false;
    let employeeDataStarted = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Look for the header line to identify data section
      if (line.includes('Employee') && line.includes('Total Hours') && line.includes('Total Units')) {
        employeeDataStarted = true;
        continue;
      }
      
      // Skip until we find employee data
      if (!employeeDataStarted) continue;
      
      // Stop at totals line
      if (line.toLowerCase().startsWith('totals')) break;
      
      // Skip non-data lines
      if (line.includes('Showing') || line.includes('Report an Issue')) break;
      
      // Parse employee data lines
      // Expected format: Employee Name    Supervisor    Total Hours    Total Units    UPH    Total Transactions    TPH
      const parts = line.split('\t');
      
      if (parts.length >= 7) {
        const employeeName = parts[0].trim();
        const supervisor = parts[1].trim();
        const totalHoursStr = parts[2].trim();
        const totalUnitsStr = parts[3].trim();
        const uphStr = parts[4].trim();
        const totalTransactionsStr = parts[5].trim();
        const tphStr = parts[6].trim();
        
        // Convert to numbers
        const totalHours = parseFloat(totalHoursStr);
        const totalUnits = parseInt(totalUnitsStr);
        const uph = parseFloat(uphStr);
        const totalTransactions = parseInt(totalTransactionsStr);
        const tph = parseFloat(tphStr);
        
        if (!isNaN(totalHours) && employeeName && employeeName !== 'Employee') {
          laborData[employeeName] = {
            supervisor: supervisor,
            totalHours: totalHours,
            totalUnits: totalUnits,
            uph: uph,
            totalTransactions: totalTransactions,
            tph: tph,
            originalName: employeeName
          };
        }
      }
    }
    
    return laborData;
  } catch (error) {
    throw new Error('Failed to parse labor hours data. Please check the format and try again.');
  }
}

// Update TM data with actual labor hours
function integrateLaborHours() {
  if (!laborHoursData || Object.keys(laborHoursData).length === 0) {
    return;
  }
  
  let integratedCount = 0;
  let missingLaborData = [];
  
  // Update existing processed TM data with actual labor hours
  Object.keys(processedTMData).forEach(tmId => {
    const tmData = processedTMData[tmId];
    
    // Try to find matching labor data by exact name match first
    let laborRecord = laborHoursData[tmId];
    
    // If no exact match, try advanced matching strategies
    if (!laborRecord) {
      // Strategy 1: Match by first and last name initials + partial name
      const tmIdLower = tmId.toLowerCase();
      const possibleMatches = Object.keys(laborHoursData).filter(fullName => {
        const nameParts = fullName.toLowerCase().split(' ');
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          // Check if tmId contains first letter + last name or first name + first letter of last
          return (
            tmIdLower.includes(firstName.charAt(0) + lastName) ||
            tmIdLower.includes(firstName + lastName.charAt(0)) ||
            (firstName.startsWith(tmIdLower.charAt(0)) && lastName.includes(tmIdLower.slice(1))) ||
            tmIdLower.includes(firstName) ||
            tmIdLower.includes(lastName)
          );
        }
        return false;
      });
      
      // Strategy 2: If Strategy 1 doesn't work, try reverse matching
      if (possibleMatches.length === 0) {
        Object.keys(laborHoursData).forEach(fullName => {
          const nameParts = fullName.toLowerCase().split(' ');
          if (nameParts.length >= 2) {
            // Create possible ID variations from full name
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];
            const middleName = nameParts.length > 2 ? nameParts[1] : '';
            
            const variations = [
              firstName.charAt(0) + lastName,
              firstName + lastName.charAt(0),
              firstName.charAt(0) + middleName.charAt(0) + lastName,
              firstName.charAt(0) + lastName + '2',
              firstName.substring(0,3) + lastName.substring(0,3)
            ].filter(v => v);
            
            if (variations.some(v => tmIdLower.includes(v) || v.includes(tmIdLower))) {
              possibleMatches.push(fullName);
            }
          }
        });
      }
      
      if (possibleMatches.length === 1) {
        laborRecord = laborHoursData[possibleMatches[0]];
      } else if (possibleMatches.length > 1) {
        // Take the first match for now, but log for manual review
        laborRecord = laborHoursData[possibleMatches[0]];
      }
    }
    
    if (laborRecord) {
      // Update the TM data with actual labor hours
      const originalPutawayRate = tmData.performanceMetrics.avgPutawayRate;
      const actualHours = laborRecord.totalHours;
      const actualRate = actualHours > 0 ? tmData.totalPutaways / actualHours : 0;
      
      tmData.actualLaborHours = actualHours;
      tmData.actualPutawayRate = actualRate;
      tmData.laborSystemUPH = laborRecord.uph;
      tmData.laborSystemTPH = laborRecord.tph; // Use TPH from CLMS as the official RT Rate
      tmData.laborSystemTransactions = laborRecord.totalTransactions;
      tmData.supervisor = laborRecord.supervisor;
      
      // Update performance metrics with actual data
      tmData.performanceMetrics.actualPutawayRate = actualRate;
      tmData.performanceMetrics.laborHoursUsed = actualHours;
      
      integratedCount++;
      const originalRate = parseFloat(originalPutawayRate) || 0;
    } else {
      missingLaborData.push(tmId);
    }
  });
  
  if (missingLaborData.length > 0) {
  }
  
  // Set CLMS data flag
  hasCLMSData = true;
  
  // Update heatmap TM selector if it exists
  if (document.getElementById('heatmapTMSelector')) {
    populateHeatmapTMSelector();
  }
  
  // Check if both data sources are available and initialize if ready
  checkAndInitializePage();
  
  
  return { integratedCount, missingLaborData };
}

// Show labor hours section after data is loaded
function showLaborHoursSection() {
  const section = document.getElementById('laborHoursSection');
  if (section) {
    section.style.display = 'block';
  }
}

// Hide labor hours section
function hideLaborHoursSection() {
  const section = document.getElementById('laborHoursSection');
  if (section) {
    section.style.display = 'none';
  }
}

// Show labor status with summary
function showLaborStatus(integratedCount, totalTMs, missingData) {
  const statusDiv = document.getElementById('laborStatus');
  const summaryDiv = document.getElementById('laborSummary');
  
  if (statusDiv && summaryDiv) {
    statusDiv.style.display = 'block';
    
    let summaryHTML = `
      <strong>Integration Summary:</strong><br>
      • ${integratedCount} of ${totalTMs} team members updated with actual labor hours<br>
      • Rates recalculated based on actual working time
    `;
    
    if (missingData.length > 0) {
      summaryHTML += `<br>• <span style="color: #856404;">Missing labor data for: ${missingData.join(', ')}</span>`;
    }
    
    summaryDiv.innerHTML = summaryHTML;
  }
}

// Event Listeners for Labor Hours Integration
document.addEventListener('DOMContentLoaded', function() {
  // Open CLMS button (top left)
  const openCLMSBtn = document.getElementById('openCLMSBtn');
  if (openCLMSBtn) {
    openCLMSBtn.addEventListener('click', function() {
      const url = generateLaborMgmtURL();
      window.open(url, '_blank');
    });
  }
  
  // Get Labor Data button (original - keep for backward compatibility)
  const getLaborDataBtn = document.getElementById('getLaborDataBtn');
  if (getLaborDataBtn) {
    getLaborDataBtn.addEventListener('click', function() {
      const url = generateLaborMgmtURL();
      window.open(url, '_blank');
    });
  }
  
  // Process labor data directly from clipboard
  async function processLaborDataFromClipboard() {
    try {
      // Check if we have clipboard API support
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        throw new Error('Clipboard access not supported. Please use a modern browser (Chrome, Firefox, Safari, Edge).');
      }
      
      // Request clipboard permission and read data
      const clipboardData = await navigator.clipboard.readText();
      
      if (!clipboardData.trim()) {
        throw new Error('Clipboard is empty. Please copy the labor data from CLMS first.');
      }
      
      // Parse the clipboard data
      laborHoursData = parseLaborHoursData(clipboardData);
      
      if (Object.keys(laborHoursData).length === 0) {
        throw new Error('No valid employee data found in clipboard. Please ensure you copied the complete CLMS report.');
      }
      
      // Integrate the labor hours
      const result = integrateLaborHours();
      showLaborStatus(result.integratedCount, Object.keys(processedTMData).length, result.missingLaborData);
      
      // Show checkmark for labor data
      showLaborDataLoaded();
      
      
    } catch (error) {
      
      // Provide user-friendly error messages
      if (error.name === 'NotAllowedError') {
      } else {
      }
    }
  }
  
  // Paste Labor Data buttons (both top and original) - now read directly from clipboard
  const pasteLaborDataBtn = document.getElementById('pasteLaborDataBtn');
  const pasteLaborDataBtnTop = document.getElementById('pasteLaborDataBtnTop');
  
  if (pasteLaborDataBtn) {
    pasteLaborDataBtn.addEventListener('click', processLaborDataFromClipboard);
  }
  
  if (pasteLaborDataBtnTop) {
    pasteLaborDataBtnTop.addEventListener('click', processLaborDataFromClipboard);
  }
});

// Function to show sections after TM data is processed
function onTMDataProcessed() {
  showLaborHoursSection();
  calculateDepartmentAverages();
  generateUnifiedTMList();
  updatePickupZoneMetric(); // Calculate pickup zone metrics when data is loaded
}

// Department averages for STU comparison
let departmentAverages = {
  avgTravelAisles: 0,
  avgTravelDepth: 0,
  avgRackHeight: 0,
  avgEstimatedTravelTime: 0
};

// Calculate department-wide averages for travel metrics
function calculateDepartmentAverages() {
  if (!processedTMData || Object.keys(processedTMData).length === 0) {
    return {
      avgTravelAisles: 0,
      avgTravelDepth: 0,
      avgRackHeight: 0,
      avgEstimatedTravelTime: 0
    };
  }
  
  const tmIds = Object.keys(processedTMData);
  let totalAisles = 0, totalDepth = 0, totalHeight = 0, totalTravelTime = 0;
  
  tmIds.forEach(tmId => {
    const tmData = processedTMData[tmId];
    totalAisles += parseFloat(tmData.performanceMetrics.avgTravelAisles) || 0;
    totalDepth += parseFloat(tmData.performanceMetrics.avgTravelDepth) || 0;
    totalHeight += parseFloat(tmData.performanceMetrics.avgRackHeight) || 0;
    totalTravelTime += parseFloat(tmData.performanceMetrics.avgEstimatedTravelTime) || 0;
  });
  
  const averages = {
    avgTravelAisles: totalAisles / tmIds.length,
    avgTravelDepth: totalDepth / tmIds.length,
    avgRackHeight: totalHeight / tmIds.length,
    avgEstimatedTravelTime: totalTravelTime / tmIds.length
  };
  
  // Store globally and return
  departmentAverages = averages;
  return averages;
}

// Generate and populate unified TM performance list
function generateUnifiedTMList() {
  const section = document.getElementById('unifiedTMSection');
  const stuLogicSection = document.getElementById('stuLogicSection');
  const stuFlaggedSection = document.getElementById('stuFlaggedSection');
  const stuFlaggedContainer = document.getElementById('stuFlaggedContainer');
  const otherTMsSection = document.getElementById('otherTMsSection');
  const otherTMsContainer = document.getElementById('otherTMsContainer');
  
  if (!section || !stuFlaggedContainer || !otherTMsContainer || !processedTMData) return;
  
  // Show the sections
  section.style.display = 'block';
  stuLogicSection.style.display = 'block';
  
  // Clear existing data
  stuFlaggedContainer.innerHTML = '';
  otherTMsContainer.innerHTML = '';
  
  // Get long transactions data
  const longTransactionsByTM = {};
  const tmLongTxCounts = [];
  
  if (longTransactions && longTransactions.length > 0) {
    longTransactions.forEach(lt => {
      const tmId = lt.putaway.employeeId;
      if (!longTransactionsByTM[tmId]) {
        longTransactionsByTM[tmId] = [];
      }
      longTransactionsByTM[tmId].push(lt);
    });
    
    // Create array of TMs with their long transaction counts for top 3 calculation
    Object.keys(processedTMData).forEach(tmId => {
      tmLongTxCounts.push({
        tmId: tmId,
        count: longTransactionsByTM[tmId]?.length || 0
      });
    });
    
    // Sort to find top 3 long transaction offenders
    tmLongTxCounts.sort((a, b) => b.count - a.count);
  }
  
  // First collect all eligible TMs (2+ hours, CLMS data)
  const eligibleTMs = [];
  
  Object.keys(processedTMData).forEach(tmId => {
    const tmData = processedTMData[tmId];
    const hasLaborData = tmData.actualLaborHours !== undefined;
    
    // Skip TMs without CLMS data - they may be doing problem solve or other non-putaway work
    if (!hasLaborData) {
      return; // Skip this TM
    }
    
    // Skip TMs with 0 labor hours - they didn't work putaway during this period
    if (tmData.actualLaborHours === 0) {
      return; // Skip this TM
    }
    
    // Skip TMs with less than 2 hours - not enough time for fair evaluation
    if (tmData.actualLaborHours < 2) {
      return; // Skip this TM
    }
    
    // Use TPH from CLMS data as RT Rate if available, otherwise use calculated rate
    const rtRate = hasLaborData && tmData.laborSystemTPH ? tmData.laborSystemTPH : 
                   hasLaborData ? tmData.actualPutawayRate : 
                   parseFloat(tmData.performanceMetrics.avgPutawayRate) || 0;
    
    const laborHours = hasLaborData ? tmData.actualLaborHours : 'No Data';
    const longTxCount = longTransactionsByTM[tmId]?.length || 0;
    const longTxDetails = longTransactionsByTM[tmId] || [];
    
    // Calculate UPT (Units Per Transaction) from CLMS data
    // We need to get the original CLMS data to calculate totalUnits / totalTransactions
    let upt = 'No Data';
    if (hasLaborData) {
      // Find the matching labor record to get totalUnits and totalTransactions
      const matchingLaborRecord = Object.values(laborHoursData || {}).find(record => 
        record.totalHours === tmData.actualLaborHours && record.tph === tmData.laborSystemTPH
      );
      
      if (matchingLaborRecord && matchingLaborRecord.totalTransactions > 0) {
        upt = (matchingLaborRecord.totalUnits / matchingLaborRecord.totalTransactions).toFixed(1);
      }
    }
    
    // Store eligible TM data for later STU determination
    eligibleTMs.push({
      tmId,
      tmData,
      hasLaborData,
      rtRate,
      laborHours: hasLaborData ? tmData.actualLaborHours : 'No Data',
      longTxCount,
      longTxDetails,
      upt
    });
  });
  
  // Now determine STU flags based on new criteria
  // 1. Get top 2 TMs for long transactions (from eligible TMs only)
  const eligibleLongTxTMs = eligibleTMs
    .filter(tm => tm.longTxCount > 0)
    .sort((a, b) => b.longTxCount - a.longTxCount)
    .slice(0, 2)
    .map(tm => tm.tmId);
  
  // 2. Get bottom 3 TMs for TPH (from eligible TMs only)
  const eligibleLowTPHTMs = eligibleTMs
    .sort((a, b) => a.rtRate - b.rtRate)
    .slice(0, 3)
    .map(tm => tm.tmId);
  
  // 3. Combine lists and remove duplicates to create STU list
  const stuFlaggedTMs = new Set([...eligibleLongTxTMs, ...eligibleLowTPHTMs]);
  
  
  // Now create cards for all eligible TMs
  eligibleTMs.forEach(tm => {
    const { tmId, tmData, hasLaborData, rtRate, laborHours, longTxCount, longTxDetails, upt } = tm;
    
    // Determine if this TM is flagged for STU
    const hasSTUFlag = stuFlaggedTMs.has(tmId);
    
    // Build STU reason for flagged TMs
    let stuReason = [];
    if (hasSTUFlag) {
      if (eligibleLongTxTMs.includes(tmId)) {
        const rank = eligibleLongTxTMs.indexOf(tmId) + 1;
        stuReason.push(`Top ${rank} Long Transactions (${longTxCount})`);
      }
      if (eligibleLowTPHTMs.includes(tmId)) {
        const rank = eligibleLowTPHTMs.indexOf(tmId) + 1;
        stuReason.push(`Bottom ${rank} TPH (${rtRate.toFixed(1)})`);
      }
    }
    
    // Store STU reasons on TM data for later access (e.g., STU form)
    tmData.stuReasons = stuReason;
    
    // Get travel metrics for display (these were removed during STU logic replacement)
    const tmAisles = parseFloat(tmData.performanceMetrics.avgTravelAisles) || 0;
    const tmDepth = parseFloat(tmData.performanceMetrics.avgTravelDepth) || 0;
    const tmHeight = parseFloat(tmData.performanceMetrics.avgRackHeight) || 0;
    const tmEstimatedTravelTime = parseFloat(tmData.performanceMetrics.avgEstimatedTravelTime) || 0;
    
    // Determine overall status
    let statusClass = 'status-good';
    if (hasSTUFlag) {
      statusClass = 'status-problem';
    } else if (rtRate < 7.0 || longTxCount > 0) {
      statusClass = 'status-warning';
    }
    
    // Rate styling
    let rateClass = 'rate-good';
    if (rtRate < 6.3) {
      rateClass = 'rate-problem';
    } else if (rtRate < 7.0) {
      rateClass = 'rate-warning';
    }
    
    // Create card
    const card = document.createElement('div');
    card.className = `tm-card ${statusClass}`;
    card.setAttribute('data-tm-id', tmId);
    card.style.cursor = 'pointer';
    
    // Add click handler for detailed transaction breakdown
    card.addEventListener('click', () => {
      showTMTransactionDetails(tmId, tmData, longTxDetails);
    });
    
    card.innerHTML = `
      <div class="tm-card-name-section">
        <div class="tm-card-name">${tmId}</div>
        <div class="tm-card-rate ${rateClass}">${rtRate.toFixed(1)} TPH</div>
      </div>
      
      <div class="tm-card-section">
        <div class="tm-card-section-title">Labor Data</div>
        <div class="tm-card-section-content">
          <div class="tm-card-metric-row">
            <span class="metric-label">Hours:</span>
            <span class="metric-value">${hasLaborData ? laborHours.toFixed(2) : 'No Data'}</span>
          </div>
          <div class="tm-card-metric-row">
            <span class="metric-label">UPT:</span>
            <span class="metric-value">${upt}</span>
          </div>
          <div class="tm-card-metric-row">
            <span class="metric-label">Putaways:</span>
            <span class="metric-value">${tmData.totalPutaways}</span>
          </div>
        </div>
      </div>
      
      <div class="tm-card-section">
        <div class="tm-card-section-title">Travel Metrics</div>
        <div class="tm-card-section-content">
          <div class="tm-card-metric-row" title="Department Average: ${departmentAverages.avgTravelAisles.toFixed(1)}">
            <span class="metric-label">Aisles:</span>
            <div class="metric-with-comparison">
              <span class="metric-value ${tmAisles < departmentAverages.avgTravelAisles ? 'below-average' : ''}">${tmAisles.toFixed(1)}</span>
              <span class="metric-comparison ${tmAisles < departmentAverages.avgTravelAisles ? 'comparison-good' : 'comparison-bad'}">
                ${((tmAisles - departmentAverages.avgTravelAisles) / departmentAverages.avgTravelAisles * 100).toFixed(0)}% vs dept avg
              </span>
            </div>
          </div>
          <div class="tm-card-metric-row" title="Department Average: ${departmentAverages.avgTravelDepth.toFixed(1)}">
            <span class="metric-label">Bays:</span>
            <div class="metric-with-comparison">
              <span class="metric-value ${tmDepth < departmentAverages.avgTravelDepth ? 'below-average' : ''}">${tmDepth.toFixed(1)}</span>
              <span class="metric-comparison ${tmDepth < departmentAverages.avgTravelDepth ? 'comparison-good' : 'comparison-bad'}">
                ${((tmDepth - departmentAverages.avgTravelDepth) / departmentAverages.avgTravelDepth * 100).toFixed(0)}% vs dept avg
              </span>
            </div>
          </div>
          <div class="tm-card-metric-row" title="Department Average: ${departmentAverages.avgRackHeight.toFixed(1)}">
            <span class="metric-label">Height:</span>
            <div class="metric-with-comparison">
              <span class="metric-value ${tmHeight < departmentAverages.avgRackHeight ? 'below-average' : ''}">${tmHeight.toFixed(1)}</span>
              <span class="metric-comparison ${tmHeight < departmentAverages.avgRackHeight ? 'comparison-good' : 'comparison-bad'}">
                ${((tmHeight - departmentAverages.avgRackHeight) / departmentAverages.avgRackHeight * 100).toFixed(0)}% vs dept avg
              </span>
            </div>
          </div>
          <div class="tm-card-metric-row" title="Department Average: ${departmentAverages.avgEstimatedTravelTime.toFixed(2)} minutes">
            <span class="metric-label">Raw Travel:</span>
            <div class="metric-with-comparison">
              <span class="metric-value ${tmEstimatedTravelTime < departmentAverages.avgEstimatedTravelTime ? 'below-average' : ''}">${tmEstimatedTravelTime.toFixed(2)}min</span>
              <span class="metric-comparison ${tmEstimatedTravelTime < departmentAverages.avgEstimatedTravelTime ? 'comparison-good' : 'comparison-bad'}">
                ${((tmEstimatedTravelTime - departmentAverages.avgEstimatedTravelTime) / departmentAverages.avgEstimatedTravelTime * 100).toFixed(0)}% vs dept avg
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div class="tm-card-section">
        <div class="tm-card-section-header">
          <div class="tm-card-section-title">Performance Issues</div>
          ${hasSTUFlag ? `<span class="stu-flag-corner stu-flag-yes">STU: Required</span>` : ''}
        </div>
        <div class="tm-card-section-content">
          <div class="tm-card-metric-row">
            <span class="metric-label">Long TX:</span>
            <span class="metric-value ${longTxCount > 0 ? 'has-issues' : ''}">${longTxCount}</span>
          </div>
          ${hasSTUFlag ? `<div class="stu-reasons">${stuReason.join(' • ')}</div>` : ''}
          
          <div class="performance-buttons-row">
            ${hasSTUFlag ? `
              <button class="stu-conversation-btn-compact" onclick="openSTUConversationForm('${tmId}')">
                💬 Create STU
              </button>
            ` : ''}
            ${longTxCount > 0 ? `
              <button class="long-tx-details-btn-compact" onclick="showLongTransactionDetails('${tmId}', ${JSON.stringify(longTxDetails).replace(/"/g, '&quot;')})">
                📝 View ${longTxCount} Long Transaction${longTxCount > 1 ? 's' : ''}
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
    
    // Append to appropriate container based on STU flag
    if (hasSTUFlag) {
      stuFlaggedContainer.appendChild(card);
    } else {
      otherTMsContainer.appendChild(card);
    }
  });
  
  // Show/hide sections based on content
  if (stuFlaggedContainer.children.length > 0) {
    stuFlaggedSection.style.display = 'block';
  }
  
  if (otherTMsContainer.children.length > 0) {
    otherTMsSection.style.display = 'block';
  }
  
}

// Show long transaction details in a popup modal
function showLongTransactionDetails(tmId, longTxDetails) {
  const modalHTML = `
    <div id="longTxModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        background: white;
        border-radius: 10px;
        padding: 2rem;
        max-width: 600px;
        max-height: 70vh;
        overflow-y: auto;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        margin: 1rem;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <h3 style="margin: 0; color: #dc3545;">🚨 Long Transactions for ${tmId}</h3>
          <button onclick="closeLongTxModal()" style="
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #6c757d;
            padding: 0;
            width: 30px;
            height: 30px;
          ">×</button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
          ${longTxDetails.map(tx => `
            <div style="
              border: 1px solid #dee2e6;
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1rem;
              background: #f8f9fa;
              display: flex;
              justify-content: space-between;
              align-items: center;
            ">
              <div>
                <div style="font-weight: bold; color: #212529; margin-bottom: 0.25rem;">
                  ${tx.putaway.quantity || 'N/A'} units
                </div>
                <div style="font-size: 0.9rem; color: #6c757d; margin-bottom: 0.25rem;">
                  ${tx.pickup?.fromLocation || 'N/A'} → ${tx.putaway.toLocation}
                </div>
                <div style="font-size: 0.9rem; color: #dc3545; font-weight: 600;">
                  ⏱️ ${((tx.putaway.timeToExecute || 0) / 60).toFixed(1)} minutes
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="text-align: center; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #dee2e6;">
          <button onclick="closeLongTxModal()" style="
            background: #6c757d;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            cursor: pointer;
          ">Close</button>
        </div>
      </div>
    </div>
  `;
  
  // Remove existing modal if present
  const existingModal = document.getElementById('longTxModal');
  if (existingModal) {
    existingModal.remove();
  }
  
  // Add modal to body
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Add keyboard support for ESC key
  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      closeLongTxModal();
      document.removeEventListener('keydown', handleKeyPress);
    }
  };
  document.addEventListener('keydown', handleKeyPress);
}

// Close long transaction modal
function closeLongTxModal() {
  const modal = document.getElementById('longTxModal');
  if (modal) {
    modal.remove();
    // Remove event listener if it exists
    document.removeEventListener('keydown', arguments.callee.handleKeyPress);
  }
}

// Show detailed transaction breakdown for a TM (similar to long transactions detail view)
function showTMTransactionDetails(tmId, tmData, longTxDetails) {
  // This will show a detailed breakdown similar to the existing long transaction details
  // For now, let's show a simple alert - this can be expanded later
  let details = `=== ${tmId} Transaction Details ===\n\n`;
  details += `Total Putaways: ${tmData.totalPutaways}\n`;
  details += `Average Travel: ${tmData.performanceMetrics.avgTravelAisles} aisles, ${tmData.performanceMetrics.avgTravelDepth} bays, ${tmData.performanceMetrics.avgRackHeight} height\n\n`;
  
  if (longTxDetails.length > 0) {
    details += `Long Transactions (${longTxDetails.length}):\n`;
    longTxDetails.forEach((lt, index) => {
      details += `${index + 1}. ${lt.pickup.fromLocation} → ${lt.putaway.toLocation}: ${(lt.putaway.timeToExecute/60).toFixed(1)} minutes\n`;
    });
  } else {
    details += `No long transactions recorded.\n`;
  }
  
}

// Update unified list when labor hours are integrated
function updateUnifiedTMList() {
  calculateDepartmentAverages();
  generateUnifiedTMList();
}