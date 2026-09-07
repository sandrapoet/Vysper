// ============================================================
// Pegado tecleado (Ctrl+Shift+V): traduccion de texto a keysyms de X11
// ============================================================
// Ctrl+Shift+V teclea el portapapeles caracter por caracter con xdotool para
// que la app destino vea eventos de tecla reales y no un evento `paste`. El
// problema del enfoque ingenuo (`xdotool type`) es que xdotool solo puede
// teclear un caracter si su keysym esta en el keymap activo; si no esta,
// REMAPEA un keycode libre al vuelo (XChangeKeyboardMapping), manda la tecla y
// deshace el remapeo. Eso tiene dos consecuencias medidas en esta maquina
// (layout latam+deadtilde, GNOME/XKB):
//
//   1. Cada remapeo hace que el servidor X emita MappingNotify a TODOS los
//      clientes conectados, y GNOME reaplica el layout. Con `aacute`, `eacute`,
//      etc. ausentes del keymap, un texto en espanol dispara cientos de
//      recargas globales de keymap -> se pasma el escritorio entero.
//   2. El cliente traduce keycode->caracter cuando PROCESA el evento, con su
//      keymap de ese momento. Si va atrasado, procesa la tecla cuando el
//      remapeo ya se deshizo y el caracter se pierde. Medido: `xdotool type
//      --delay 0` se come todos los acentos, y las mayusculas acentuadas
//      salen mal incluso con delay alto (se teclea "ÁN" y llega "áN").
//
// La salida es no remapear nunca: se usan solo keysyms que YA estan en el
// keymap, y los acentos se alcanzan con la secuencia de dead key real que el
// layout ofrece (dead_acute + a = á). Medido: 600 caracteres con acentos en
// 91 ms y texto exacto, contra 3570 ms del camino anterior.
//
// Este modulo es la parte pura (texto -> tokens); el envio vive en main.js.

// Puntuacion y signos ASCII / Latin-1 con nombre de keysym estandar.
const PUNCT_KEYSYMS = {
  ' ': 'space', '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar',
  '%': 'percent', '&': 'ampersand', "'": 'apostrophe', '(': 'parenleft',
  ')': 'parenright', '*': 'asterisk', '+': 'plus', ',': 'comma', '-': 'minus',
  '.': 'period', '/': 'slash', ':': 'colon', ';': 'semicolon', '<': 'less',
  '=': 'equal', '>': 'greater', '?': 'question', '@': 'at', '[': 'bracketleft',
  '\\': 'backslash', ']': 'bracketright', '^': 'asciicircum', '_': 'underscore',
  '`': 'grave', '{': 'braceleft', '|': 'bar', '}': 'braceright', '~': 'asciitilde',
  '\t': 'Tab', '\n': 'Return',
  '¿': 'questiondown', '¡': 'exclamdown', '°': 'degree', 'ª': 'ordfeminine',
  'º': 'masculine', '«': 'guillemotleft', '»': 'guillemotright',
  '·': 'periodcentered', '¬': 'notsign', '±': 'plusminus', '×': 'multiply',
  '÷': 'division', '£': 'sterling', '¥': 'yen', '¢': 'cent', '¤': 'currency',
  '§': 'section', '¶': 'paragraph', '©': 'copyright', '®': 'registered',
  'µ': 'mu', '¹': 'onesuperior', '²': 'twosuperior', '³': 'threesuperior',
  '¼': 'onequarter', '½': 'onehalf', '¾': 'threequarters', '€': 'EuroSign',
  '—': 'emdash', '–': 'endash', '…': 'ellipsis',
  '“': 'leftdoublequotemark', '”': 'rightdoublequotemark',
  '‘': 'leftsinglequotemark', '’': 'rightsinglequotemark',
  '•': 'enfilledcircbullet', '†': 'dagger', '‡': 'doubledagger', '™': 'trademark'
};

// Letras acentuadas con nombre de keysym Latin-1. Se consultan primero por si
// el layout las tiene directas (mas rapido que la secuencia de dead key).
const LATIN1_KEYSYMS = {
  'á': 'aacute', 'é': 'eacute', 'í': 'iacute', 'ó': 'oacute', 'ú': 'uacute',
  'ñ': 'ntilde', 'ü': 'udiaeresis', 'ç': 'ccedilla',
  'Á': 'Aacute', 'É': 'Eacute', 'Í': 'Iacute', 'Ó': 'Oacute', 'Ú': 'Uacute',
  'Ñ': 'Ntilde', 'Ü': 'Udiaeresis', 'Ç': 'Ccedilla',
  'à': 'agrave', 'è': 'egrave', 'ì': 'igrave', 'ò': 'ograve', 'ù': 'ugrave',
  'À': 'Agrave', 'È': 'Egrave', 'Ì': 'Igrave', 'Ò': 'Ograve', 'Ù': 'Ugrave',
  'â': 'acircumflex', 'ê': 'ecircumflex', 'î': 'icircumflex',
  'ô': 'ocircumflex', 'û': 'ucircumflex',
  'ä': 'adiaeresis', 'ë': 'ediaeresis', 'ï': 'idiaeresis', 'ö': 'odiaeresis',
  'ã': 'atilde', 'õ': 'otilde', 'Ã': 'Atilde', 'Õ': 'Otilde'
};

// Combinantes Unicode (lo que deja NFD) -> dead key del layout.
const COMBINING_TO_DEAD = {
  '́': 'dead_acute',
  '̀': 'dead_grave',
  '̈': 'dead_diaeresis',
  '̂': 'dead_circumflex',
  '̃': 'dead_tilde',
  '̧': 'dead_cedilla',
  '̊': 'dead_abovering'
};

// Tipografia que suele venir en texto de LLM y que casi ningun keymap tiene.
// Se translitera a su equivalente ASCII para que no haya que remapear (ver
// cabecera): la alternativa medida es que el caracter se pierda a mitad del
// pegado o que se pasme el escritorio.
const TRANSLITERATIONS = {
  '—': '-', '–': '-', '‑': '-', '‒': '-', '―': '-',
  '…': '...',
  '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '‘': "'", '’': "'", '‚': "'",
  '•': '-', '·': '-', '‣': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  '​': '', '‌': '', '‍': '', '﻿': '',
  '‐': '-',
  '′': "'", '″': '"', '‹': '<', '›': '>',
  '™': 'TM', '€': 'EUR'
};

/**
 * Nombre de keysym X11 para un caracter, sin mirar el keymap.
 * Devuelve null si no se conoce un nombre estandar.
 */
function keysymName(ch) {
  if (Object.prototype.hasOwnProperty.call(PUNCT_KEYSYMS, ch)) return PUNCT_KEYSYMS[ch];
  if (Object.prototype.hasOwnProperty.call(LATIN1_KEYSYMS, ch)) return LATIN1_KEYSYMS[ch];
  if (/^[A-Za-z0-9]$/.test(ch)) return ch;
  return null;
}

/**
 * Parsea la salida de `xmodmap -pke` y devuelve el Set de keysyms presentes
 * en el keymap activo. Es lo unico que se puede teclear sin remapear.
 */
function parseKeymapKeysyms(xmodmapOutput) {
  const present = new Set();
  for (const line of String(xmodmapOutput || '').split('\n')) {
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    for (const token of line.slice(eq + 1).trim().split(/\s+/)) {
      if (token && token !== 'NoSymbol') present.add(token);
    }
  }
  return present;
}

/**
 * Traduce un caracter a la lista de keysyms que hay que pulsar para producirlo,
 * usando solo lo que el keymap ya tiene. Devuelve null si no se puede.
 */
function charToKeysyms(ch, present) {
  const direct = keysymName(ch);
  if (direct && present.has(direct)) return [direct];

  // Via dead key: NFD parte 'á' en 'a' + combinante agudo, y el layout casi
  // siempre expone dead_acute aunque no exponga 'aacute'.
  const decomposed = ch.normalize('NFD');
  if (decomposed.length === 2) {
    const dead = COMBINING_TO_DEAD[decomposed[1]];
    const base = keysymName(decomposed[0]);
    if (dead && base && present.has(dead) && present.has(base)) {
      return [dead, base];
    }
  }
  return null;
}

/**
 * Planifica el pegado tecleado de `text`.
 *
 * Devuelve { runs, chars, tokens, transliterated, unsupported }:
 *  - runs: tramos consecutivos a enviar, en orden. Cada tramo es
 *      { kind: 'keys', tokens: [...], chars: n }  -> un solo `xdotool key`,
 *        rapido y sin remapeo (todo esta en el keymap);
 *      { kind: 'type', text: '...', chars: n }    -> caracteres sin keysym
 *        alcanzable (emoji, CJK...). Van por `xdotool type`, que remapea; es
 *        el camino lento de siempre, ahora reservado a lo verdaderamente raro.
 *  - transliterated: caracteres sustituidos por su equivalente ASCII.
 *  - unsupported: caracteres que quedaron en tramos 'type'.
 */
function planTypedPaste(text, present, options = {}) {
  const transliterate = options.transliterate !== false;
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const runs = [];
  const transliterated = [];
  const unsupported = [];
  let tokens = 0;

  const pushKeys = (toks, chars) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === 'keys') {
      last.tokens.push(...toks);
      last.chars += chars;
    } else {
      runs.push({ kind: 'keys', tokens: [...toks], chars });
    }
    tokens += toks.length;
  };

  const pushType = (ch) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === 'type') {
      last.text += ch;
      last.chars += 1;
    } else {
      runs.push({ kind: 'type', text: ch, chars: 1 });
    }
    unsupported.push(ch);
  };

  for (const ch of normalized) {
    let keys = charToKeysyms(ch, present);
    if (keys) {
      pushKeys(keys, 1);
      continue;
    }

    // Sin keysym en el keymap: intentar el equivalente ASCII antes de caer al
    // camino lento que remapea.
    if (transliterate && Object.prototype.hasOwnProperty.call(TRANSLITERATIONS, ch)) {
      const replacement = TRANSLITERATIONS[ch];
      const replacementKeys = [];
      let ok = true;
      for (const rc of replacement) {
        const k = charToKeysyms(rc, present);
        if (!k) { ok = false; break; }
        replacementKeys.push(...k);
      }
      if (ok) {
        transliterated.push(ch);
        // Un caracter de origen aunque el reemplazo tenga varios ('…' -> '...'):
        // el progreso se cuenta sobre el texto original.
        if (replacementKeys.length) pushKeys(replacementKeys, 1);
        continue;
      }
    }

    pushType(ch);
  }

  return {
    runs,
    chars: normalized.length,
    tokens,
    transliterated,
    unsupported
  };
}

/**
 * Parte los tramos en lotes de como maximo `batchTokens` tokens, para que el
 * pegado se pueda cancelar (Ctrl+Shift+L) e informar progreso sin esperar a
 * que termine un texto entero. Los tramos 'type' se parten por caracteres.
 */
function batchRuns(runs, batchTokens = 200) {
  const requested = Number(batchTokens);
  const size = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 200;
  const batches = [];
  for (const run of runs) {
    if (run.kind === 'keys') {
      // Los tokens no llevan cuenta propia de caracteres, asi que se reparte
      // proporcionalmente: es solo para la barra de progreso.
      const total = run.tokens.length;
      for (let i = 0; i < total; i += size) {
        const slice = run.tokens.slice(i, i + size);
        const chars = Math.round(run.chars * (slice.length / total));
        batches.push({ kind: 'keys', tokens: slice, chars });
      }
    } else {
      for (let i = 0; i < run.text.length; i += size) {
        const slice = run.text.slice(i, i + size);
        batches.push({ kind: 'type', text: slice, chars: slice.length });
      }
    }
  }
  return batches;
}

module.exports = {
  PUNCT_KEYSYMS,
  LATIN1_KEYSYMS,
  COMBINING_TO_DEAD,
  TRANSLITERATIONS,
  keysymName,
  parseKeymapKeysyms,
  charToKeysyms,
  planTypedPaste,
  batchRuns
};
