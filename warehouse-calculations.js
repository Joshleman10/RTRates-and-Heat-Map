// Warehouse Travel Calculation Module
let warehouseMapping = null;

// Load warehouse mapping data
async function loadWarehouseMapping() {
  try {
    const response = await fetch('warehouse-mapping.json');
    warehouseMapping = await response.json();
  } catch (error) {
  }
}

// Parse location string (actual formats: "REC7201", "30-35-M02", "RECVASOUT", etc.)
function parseLocation(location) {
  if (!location) return null;
  
  // Handle pickup zones (REC7201, REC7401, RECVASOUT, BPFLIP, etc.)
  if (location.match(/^[A-Z]+\d*$/)) {
    // Extract aisle number from pickup zones like REC7201, REC7401
    let pairedAisle = null;
    if (location.match(/REC(\d+)/)) {
      const match = location.match(/REC(\d+)/);
      pairedAisle = parseInt(match[1].substring(0, 2)); // Extract first 2 digits as aisle
    } else if (location === 'RECVASOUT') {
      pairedAisle = 20; // Based on your original description
    } else if (location === 'BPFLIP') {
      pairedAisle = 43; // Assuming aisle 43 based on common patterns
    }
    
    return {
      type: 'pickupZone',
      zone: location,
      aisle: pairedAisle || 0,
      bay: null,
      position: null,
      level: null,
      coordinates: { x: 0, y: pairedAisle || 0 }
    };
  }
  
  // Parse S-aisle locations (format: "S01-16-A01" = S-aisle-location-level)
  const sAisleMatch = location.match(/^S(\d+)-(\d+)-([A-Z])(\d+)$/);
  if (sAisleMatch) {
    const sAisleNum = parseInt(sAisleMatch[1]);
    const locationNum = parseInt(sAisleMatch[2]); // This is location 01-44, not bay
    const level = sAisleMatch[3];
    const position = parseInt(sAisleMatch[4]);
    
    // Convert location number to bay number (locations 01-44 map to bays 1-22)
    // Each bay has 2 locations: bay 1 = locations 01-02, bay 2 = locations 03-04, etc.
    const bayNumber = Math.ceil(locationNum / 2);
    
    // Return S-aisle identifier as string (S01, S02, etc.) for consistency with heat map
    const sAisleId = `S${sAisleNum.toString().padStart(2, '0')}`;
    
    return {
      type: 'sAisleLocation',
      zone: 'S-AISLE',
      aisle: sAisleId, // Use S01, S02, etc. instead of numeric mapping
      sAisle: sAisleNum,
      bay: bayNumber, // Use calculated bay number (1-22)
      location: locationNum, // Keep original location number (01-44)
      position: position,
      level: level,
      coordinates: { x: sAisleId, y: bayNumber }
    };
  }
  
  // Parse regular putaway locations (format: "30-35-M02" or "105-31-D01" = aisle-bay-level)
  const putawayMatch = location.match(/^(\d+)-(\d+)-([A-Z])(\d+)$/);
  if (putawayMatch) {
    const aisle = parseInt(putawayMatch[1]);
    const bay = parseInt(putawayMatch[2]);
    const level = putawayMatch[3];
    const position = parseInt(putawayMatch[4]);
    
    // Debug specific case and check if aisle is in valid range
    if (location === '105-31-D01') {
    }
    
    // Check if aisle seems valid (most warehouses don't go above 100)
    if (aisle > 100) {
    }
    
    return {
      type: 'putawayLocation',
      zone: 'PUTAWAY',
      aisle: aisle,
      bay: bay,
      position: position,
      level: level,
      coordinates: { x: aisle, y: bay }
    };
  }
  
  // Handle special cases like "IBVC", "LG.SHRNKWRP", etc.
  if (location.match(/^[A-Z]{4}$/) || location.includes('.') || location.includes('LG')) {
    return {
      type: 'specialZone',
      zone: location,
      aisle: 0,
      bay: null,
      position: null,
      level: null,
      coordinates: { x: 0, y: 0 }
    };
  }
  
  
  // Log the specific case for debugging
  if (location === '105-31-D01') {
  }
  
  return null;
}

// Calculate travel distance between two locations
function calculateTravelDistance(fromLocation, toLocation) {
  if (!warehouseMapping) {
    return null;
  }
  
  const from = parseLocation(fromLocation);
  const to = parseLocation(toLocation);
  
  if (!from || !to) {
    return null;
  }
  
  // Calculate aisle travel distance
  const aisleDistance = Math.abs(to.aisle - from.aisle);
  
  // Calculate bay depth - how many bays deep from starting point (bay 05) to destination
  let bayDepth = 0;
  if (to.bay && typeof to.bay === 'number') {
    // Bay depth is distance from bay 05 (starting point) to destination bay
    const startingBay = 5; // All aisles start at bay 05
    bayDepth = Math.abs(to.bay - startingBay);
  }
  
  // Calculate height travel (rack level)
  let heightTravel = 0;
  if (to.level && warehouseMapping.rackLevels[to.level]) {
    // Height is the actual rack level (A/B/C = 1, D = 2, G = 3, etc.)
    heightTravel = warehouseMapping.rackLevels[to.level].height;
  }
  
  return {
    fromLocation: fromLocation,
    toLocation: toLocation,
    fromParsed: from,
    toParsed: to,
    aisleDistance: aisleDistance,
    bayDepth: bayDepth,
    heightTravel: heightTravel,
    totalDistance: (
      (aisleDistance * warehouseMapping.travelCalculations.aisleDistanceMultiplier) +
      (bayDepth * warehouseMapping.travelCalculations.bayDistanceMultiplier) +
      (heightTravel * warehouseMapping.travelCalculations.heightDistanceMultiplier)
    ),
    metrics: {
      aislesTraversed: aisleDistance,
      bayDepth: bayDepth,
      rackHeight: heightTravel
    }
  };
}

// Calculate travel metrics for a complete putaway transaction
function calculatePutawayTravelMetrics(transaction) {
  if (!transaction || !transaction.pickup || !transaction.putaway) {
    return null;
  }
  
  const pickup = transaction.pickup;
  const putaway = transaction.putaway;
  
  // Calculate travel from pickup location to putaway location
  const travelMetrics = calculateTravelDistance(pickup.fromLocation, putaway.toLocation);
  
  if (travelMetrics) {
    return {
      ...travelMetrics,
      employeeId: putaway.employeeId,
      fromLP: transaction.fromLP,
      totalTime: transaction.totalTime,
      efficiency: travelMetrics.totalDistance > 0 ? (transaction.totalTime / travelMetrics.totalDistance) : 0
    };
  }
  
  return null;
}

// Generate heat map data for warehouse visualization
function generateHeatMapData(transactions) {
  if (!warehouseMapping || !transactions.length) {
    return null;
  }
  
  const heatMapData = {};
  const aisleActivity = {};
  const bayActivity = {};
  const heightActivity = {};
  
  transactions.forEach(transaction => {
    const metrics = calculatePutawayTravelMetrics(transaction);
    if (metrics && metrics.toParsed) {
      const location = metrics.toParsed;
      
      // Track aisle activity
      if (location.aisle) {
        aisleActivity[location.aisle] = (aisleActivity[location.aisle] || 0) + 1;
      }
      
      // Track bay activity
      if (location.bay) {
        const bayKey = `${location.aisle}-${location.bay}`;
        bayActivity[bayKey] = (bayActivity[bayKey] || 0) + 1;
      }
      
      // Track height activity
      if (location.level) {
        heightActivity[location.level] = (heightActivity[location.level] || 0) + 1;
      }
    }
  });
  
  return {
    aisleActivity: aisleActivity,
    bayActivity: bayActivity,
    heightActivity: heightActivity,
    totalTransactions: transactions.length
  };
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadWarehouseMapping,
    parseLocation,
    calculateTravelDistance,
    calculatePutawayTravelMetrics,
    generateHeatMapData
  };
}

// Convert numeric height back to level letter
function getHeightLevelLetter(numericHeight) {
  if (!warehouseMapping || !warehouseMapping.rackLevels) return '';
  
  // Find the level letter that corresponds to this numeric height
  for (const [level, data] of Object.entries(warehouseMapping.rackLevels)) {
    if (data.height === numericHeight) {
      return level;
    }
  }
  
  // Fallback mapping if exact match not found
  const levelMap = {
    1: 'A-C', // Ground levels
    2: 'D',
    3: 'G', 
    4: 'J',
    5: 'M',
    6: 'P',
    7: 'S'
  };
  
  return levelMap[numericHeight] || '';
}

// Auto-load warehouse mapping when script loads
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', loadWarehouseMapping);
}