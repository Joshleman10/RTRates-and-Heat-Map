# Debug Cleanup Plan

## Keep (Name Matching Related):
- All debug statements in `calculateNameMatchScore()` function
- All debug statements in `integrateLaborHours()` related to CLMS name matching
- Process of elimination debug statements

## Remove:
- Transaction processing debug (🔍 [DEBUG_TARGET_TM] Starting transaction processing)
- Transaction filtering debug (🔍 [DEBUG_TARGET_TM] Filtering transaction)
- LP matching debug (🔍 [DEBUG_TARGET_TM] LP matching)
- General TM creation debug (🔍 [DEBUG_TARGET_TM] Creating/adding to processedTMData)
- STU flagging debug (🎓 STU Flagging, 🚩 STU Flagged TMs)
- LC functionality debug (🎓 LC flags reset, 🎓 LC functionality initialized)
- CLMS import debug (🔍 CLMS IMPORT)
- General console.log statements not related to name matching

The name matching is working perfectly now. The user primarily wants to remove the verbose transaction processing debug output while keeping the core name matching functionality intact for future troubleshooting.