const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const panel = fs.readFileSync(path.join(root, 'panel.html'), 'utf8');
const session = fs.readFileSync(path.join(root, 'sesion-clinica.html'), 'utf8');

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
