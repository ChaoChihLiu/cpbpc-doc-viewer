import fs from 'fs'
import JavaScriptObfuscator from 'javascript-obfuscator'

// Read your original JavaScript file
const originalCode = fs.readFileSync('src/viewer.js', 'utf8');

// Obfuscate the code
const obfuscatedCode = JavaScriptObfuscator.obfuscate(originalCode, {
    compact: true,
    controlFlowFlattening: true,
}).getObfuscatedCode();


// Ensure output directory exists
if (!fs.existsSync('public/js/')) {
    fs.mkdirSync('public/js/',{ recursive: true });
}
// Write the obfuscated code to a new file
fs.writeFileSync('public/js/obfuscated-script.js', obfuscatedCode);
