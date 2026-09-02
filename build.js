#!/usr/bin/env node
/* Inline style.css + demo.js + app.js into public/index.html (self-contained). */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const css = fs.readFileSync(path.join(dir, 'public', 'style.css'), 'utf8');
const demo = fs.readFileSync(path.join(dir, 'public', 'demo.js'), 'utf8');
const app = fs.readFileSync(path.join(dir, 'public', 'app.js'), 'utf8');

let html = fs.readFileSync(path.join(dir, 'public', 'index.html'), 'utf8');

// style block (single <style> in the file)
html = html.replace(/<style>[\s\S]*?<\/style>/, () => '<style>\n' + css + '\n</style>');

// demo script block (unique marker inside the block)
html = html.replace(
  /<script>(?:(?!<\/script>)[\s\S])*?OFFLINE DEMO ENGINE(?:(?!<\/script>)[\s\S])*?<\/script>/,
  () => '<script>\n' + demo + '\n</script>'
);

// app script block (unique marker inside the block)
html = html.replace(
  /<script>(?:(?!<\/script>)[\s\S])*?frontend logic(?:(?!<\/script>)[\s\S])*?<\/script>/,
  () => '<script>\n' + app + '\n</script>'
);

fs.writeFileSync(path.join(dir, 'public', 'index.html'), html);
console.log('✓ built public/index.html (' + html.length + ' bytes)');
