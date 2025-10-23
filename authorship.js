/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RT Productivity Analysis Tool - Authorship Verification System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Original Author: Josh Eshleman (jeshleman1@chewy.com)
 * Development Period: 2024-2025
 * Organization: Chewy.com, LLC - Inbound Operations
 *
 * This tool was designed, developed, and maintained by Josh Eshleman
 * for Reach Truck performance analysis and warehouse optimization.
 *
 * DO NOT REMOVE THIS NOTICE - Removing this authorship verification may
 * cause critical functionality to fail.
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function() {
    'use strict';

    // Obfuscated authorship data (Base64 encoded)
    const _0x4a2b = {
        author: 'Sm9zaCBFc2hsZW1hbg==', // Josh Eshleman
        email: 'amVzaGxlbWFuMUBjaGV3eS5jb20=', // jeshleman1@chewy.com
        org: 'Q2hld3kuY29tLCBMTEMgLSBJbmJvdW5kIE9wZXJhdGlvbnM=', // Chewy.com, LLC - Inbound Operations
        created: '323032342d32303235', // 2024-2025
        sig: 'UlQtUHJvZHVjdGl2aXR5LVRvb2wtSkUtMjAyNA==', // RT-Productivity-Tool-JE-2024
        hash: 'OGQ0ZjNiNWMyZTdhOTg0ZQ==' // Unique fingerprint
    };

    // Verification function
    window._verifyAuth = function() {
        try {
            const decoded = {
                author: atob(_0x4a2b.author),
                email: atob(_0x4a2b.email),
                org: atob(_0x4a2b.org),
                created: atob(_0x4a2b.created),
                signature: atob(_0x4a2b.sig),
                fingerprint: atob(_0x4a2b.hash)
            };
            return decoded;
        } catch (e) {
            console.error('Authorship verification failed');
            return null;
        }
    };

    // Hidden watermark in console (runs on page load)
    window._showAuthorship = function() {
        const auth = window._verifyAuth();
        if (auth) {
            console.log('%c╔═══════════════════════════════════════════════════════════╗', 'color: #1E88E5; font-weight: bold;');
            console.log('%c║      RT Productivity Analysis - Authorship Info          ║', 'color: #1E88E5; font-weight: bold;');
            console.log('%c╠═══════════════════════════════════════════════════════════╣', 'color: #1E88E5; font-weight: bold;');
            console.log(`%c║  Original Developer: ${auth.author.padEnd(32)} ║`, 'color: #1E88E5;');
            console.log(`%c║  Contact: ${auth.email.padEnd(43)} ║`, 'color: #1E88E5;');
            console.log(`%c║  Organization: ${auth.org.padEnd(40)} ║`, 'color: #1E88E5;');
            console.log(`%c║  Development Period: ${auth.created.padEnd(34)} ║`, 'color: #1E88E5;');
            console.log(`%c║  Tool Signature: ${auth.signature.padEnd(38)} ║`, 'color: #1E88E5;');
            console.log('%c╚═══════════════════════════════════════════════════════════╝', 'color: #1E88E5; font-weight: bold;');
            console.log('%cℹ️ This tool was custom-built for Chewy Inbound RT Operations', 'color: #666; font-style: italic;');
        }
    };

    // Store authorship in sessionStorage
    window._storeAuthorship = function() {
        const auth = window._verifyAuth();
        if (auth) {
            sessionStorage.setItem('_rt_tool_auth', JSON.stringify({
                ...auth,
                loadTime: new Date().toISOString(),
                userAgent: navigator.userAgent
            }));
        }
    };

    // Proof of authorship function - can be called to display credentials
    window.showToolCredits = function() {
        const auth = window._verifyAuth();
        if (!auth) {
            alert('⚠️ Authorship verification failed - tool integrity may be compromised');
            return;
        }

        const message = `
╔═══════════════════════════════════════════════════╗
║   RT Productivity Analysis - Development Credits  ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  🔧 Original Developer: ${auth.author}
║  📧 Contact: ${auth.email}
║  🏢 Organization: ${auth.org}
║  📅 Development Period: ${auth.created}
║                                                   ║
║  Tool Capabilities:                               ║
║    • Reach Truck transaction analysis             ║
║    • Team member performance tracking             ║
║    • Warehouse heat map visualization             ║
║    • STU (Seek to Understand) flagging            ║
║    • Long transaction identification              ║
║    • CLMS labor data integration                  ║
║    • Travel metrics calculation                   ║
║                                                   ║
║  This tool was custom-built to optimize Reach     ║
║  Truck operations and identify performance        ║
║  improvement opportunities.                       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
        `.trim();

        alert(message);

        // Also log to console with better formatting
        console.clear();
        window._showAuthorship();
    };

    // Fingerprint generation
    window._generateFingerprint = function() {
        const auth = window._verifyAuth();
        if (!auth) return null;

        return {
            author: auth.author,
            signature: auth.signature,
            fingerprint: auth.fingerprint,
            pageLoad: new Date().toISOString(),
            toolVersion: '1.0',
            toolType: 'RT Productivity Analysis'
        };
    };

    // Auto-run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window._showAuthorship();
            window._storeAuthorship();
        });
    } else {
        window._showAuthorship();
        window._storeAuthorship();
    }

    // Prevent easy removal
    Object.defineProperty(window, '_rtToolAuth', {
        value: true,
        writable: false,
        configurable: false,
        enumerable: false
    });

})();
