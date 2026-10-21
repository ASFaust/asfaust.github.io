// Presets: built-in ones and ones saved in this browser (localStorage). The URL holds the settings too, so sharing
// needs no files (JSON export and import were removed, 2026-10-21).
import { st, KEYS, BUILTIN } from './state.js';
import { stamp } from './files.js';

var STORE = 'buddhabrot-presets';
function savedPresets() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
}
function storePresets(p) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); return true; } catch (e) { return false; }
}
function currentPreset() {
  var out = {};
  KEYS.forEach(function(k) { out[k] = st[k]; });
  return out;
}

// apply(data) loads a preset's settings and starts a render.
export function initPresets(apply) {
  var $ = function(id) { return document.getElementById(id); };

  function fill(selected) {
    var sel = $('p-preset'), saved = savedPresets();
    sel.innerHTML = '<option value="">Select preset…</option>';
    function group(label, names, prefix) {
      if (!names.length) return;
      var g = document.createElement('optgroup');
      g.label = label;
      names.forEach(function(name) {
        var o = document.createElement('option');
        o.value = prefix + name;
        o.textContent = name;
        g.appendChild(o);
      });
      sel.appendChild(g);
    }
    group('Built-in', Object.keys(BUILTIN), 'b:');
    group('Saved in this browser', Object.keys(saved).sort(), 's:');
    sel.value = selected || '';
    $('deletePresetBtn').disabled = sel.value.slice(0, 2) !== 's:';
  }

  $('p-preset').addEventListener('change', function() {
    var v = this.value;
    $('deletePresetBtn').disabled = v.slice(0, 2) !== 's:';
    if (!v) return;
    var data = v.slice(0, 2) === 'b:' ? BUILTIN[v.slice(2)] : savedPresets()[v.slice(2)];
    if (data) apply(data);
  });
  $('savePresetBtn').addEventListener('click', function() {
    var name = $('p-pname').value.trim() || 'preset_' + stamp();
    var saved = savedPresets();
    saved[name] = currentPreset();
    if (!storePresets(saved)) { alert('Could not save: browser storage is unavailable.'); return; }
    $('p-pname').value = '';
    fill('s:' + name);
  });
  $('deletePresetBtn').addEventListener('click', function() {
    var v = $('p-preset').value;
    if (v.slice(0, 2) !== 's:') return;
    var saved = savedPresets();
    delete saved[v.slice(2)];
    storePresets(saved);
    fill();
  });
  fill();
}
