const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
const session = fs.readFileSync(path.join(root, 'sesion-clinica.html'), 'utf8');
const agenda = fs.readFileSync(path.join(root, 'agenda.html'), 'utf8');
const homepage = fs.readFileSync(path.join(root, 'psicologa-luz-adriana.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('copia la autenticación antes de navegar a la pestaña clínica', () => {
  const openAt = panel.indexOf("window.open('about:blank','_blank')");
  const tokenAt = panel.indexOf("clinicalWindow.sessionStorage.setItem('opsToken',token)");
  const navigateAt = panel.indexOf('clinicalWindow.location.replace');
  assert.ok(openAt >= 0 && tokenAt > openAt && navigateAt > tokenAt);
});

test('sincroniza el indicador de registro con la agenda abierta', () => {
  assert.match(panel, /BroadcastChannel\('clinical-session-updates'\)/);
  assert.match(panel, /currentView==='agenda'/);
  assert.match(session, /type:'clinical-note-updated'/);
});

test('la pestaña clínica corta la referencia al panel después del traspaso', () => {
  assert.match(session, /if\(window\.opener\)window\.opener=null/);
});

test('frontend y API conservan la subruta pública actual', () => {
  for (const document of [homepage, agenda, panel, session]) {
    assert.match(document, /APP_BASE=location\.pathname/);
    assert.match(document, /appUrl=path/);
  }
  assert.match(agenda, /const API=appUrl\('api\/v1'\)/);
  assert.match(panel, /const API=appUrl\('api\/v1'\)/);
  assert.match(session, /const API=appUrl\('api\/v1'\)/);
  assert.doesNotMatch(homepage, /fetch\('\/api\/v1/);
});

test('manifest y service worker usan rutas relativas a su ámbito', () => {
  assert.equal(manifest.start_url, './agenda.html');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.icons[0].src, './icon.svg');
  assert.match(serviceWorker, /self\.registration\.scope/);
  assert.match(serviceWorker, /scoped\('api\/'\)/);
});

test('la navegación pública no escapa a la raíz del dominio', () => {
  for (const document of [homepage, agenda]) {
    assert.doesNotMatch(document, /(?:href|src)="\/(?:agenda\.html|manifest\.webmanifest|icon\.svg)/);
  }
  assert.doesNotMatch(homepage, /window\.open\('\/agenda\.html/);
});
