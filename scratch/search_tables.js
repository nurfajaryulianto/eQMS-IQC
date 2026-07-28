const fs = require('fs');
const path = require('path');

const adminHtmlPath = path.join(__dirname, '..', 'material', 'admin.html');
const content = fs.readFileSync(adminHtmlPath, 'utf8');

console.log('--- TABLES IN ADMIN.HTML ---');
const regex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
let match;
let count = 0;
while ((match = regex.exec(content)) !== null) {
    count++;
    console.log(`Table ${count}:`);
    const tableContent = match[0];
    const headMatch = tableContent.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
    if (headMatch) {
        console.log('  Head:', headMatch[0].trim());
    } else {
        console.log('  No thead found');
    }
    const tbodyMatch = tableContent.match(/<tbody[^>]*>/i);
    if (tbodyMatch) {
        console.log('  Tbody:', tbodyMatch[0]);
    }
}
