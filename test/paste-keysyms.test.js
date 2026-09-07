const {
  keysymName,
  parseKeymapKeysyms,
  charToKeysyms,
  planTypedPaste,
  batchRuns
} = require('../src/core/paste-keysyms');

// Keymap real de la maquina de desarrollo (layout latam+deadtilde): tiene
// dead_acute/dead_diaeresis, ntilde y questiondown, pero NO aacute/eacute/
// emdash/ellipsis. Es el caso que provocaba el remapeo por caracter.
const LATAM = new Set([
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  ...'0123456789'.split(''),
  'space', 'Return', 'Tab', 'comma', 'period', 'minus', 'colon', 'semicolon',
  'exclam', 'question', 'questiondown', 'exclamdown', 'apostrophe', 'quotedbl',
  'parenleft', 'parenright', 'slash', 'numbersign', 'periodcentered',
  'ntilde', 'Ntilde', 'dead_acute', 'dead_diaeresis', 'dead_grave',
  'dead_circumflex', 'dead_tilde', 'dead_cedilla'
]);

describe('parseKeymapKeysyms', () => {
  test('extrae los keysyms de la salida de xmodmap -pke', () => {
    const out = [
      'keycode  38 = a A a A ae AE',
      'keycode  47 = ntilde Ntilde semicolon colon asciitilde dead_doubleacute',
      'keycode  93 ='
    ].join('\n');
    const present = parseKeymapKeysyms(out);
    expect(present.has('a')).toBe(true);
    expect(present.has('ntilde')).toBe(true);
    expect(present.has('dead_doubleacute')).toBe(true);
    expect(present.has('aacute')).toBe(false);
  });

  test('ignora NoSymbol y keycodes vacios', () => {
    const present = parseKeymapKeysyms('keycode 8 =\nkeycode 9 = NoSymbol NoSymbol');
    expect(present.size).toBe(0);
  });

  test('tolera entradas vacias', () => {
    expect(parseKeymapKeysyms('').size).toBe(0);
    expect(parseKeymapKeysyms(null).size).toBe(0);
  });
});

describe('keysymName', () => {
  test('nombra letras y digitos por si mismos', () => {
    expect(keysymName('a')).toBe('a');
    expect(keysymName('Z')).toBe('Z');
    expect(keysymName('7')).toBe('7');
  });

  test('nombra puntuacion y signos del espanol', () => {
    expect(keysymName(' ')).toBe('space');
    expect(keysymName('\n')).toBe('Return');
    expect(keysymName('¿')).toBe('questiondown');
    expect(keysymName('ñ')).toBe('ntilde');
  });

  test('devuelve null para lo que no tiene nombre estandar conocido', () => {
    expect(keysymName('☃')).toBeNull();
    expect(keysymName('漢')).toBeNull();
  });
});

describe('charToKeysyms', () => {
  test('usa el keysym directo cuando esta en el keymap', () => {
    expect(charToKeysyms('a', LATAM)).toEqual(['a']);
    expect(charToKeysyms('ñ', LATAM)).toEqual(['ntilde']);
    expect(charToKeysyms('¿', LATAM)).toEqual(['questiondown']);
  });

  test('alcanza los acentos con dead key cuando falta el keysym Latin-1', () => {
    // Esto es lo que evita el remapeo de keycodes: en latam no existe 'aacute'
    // pero si 'dead_acute' + 'a'.
    expect(charToKeysyms('á', LATAM)).toEqual(['dead_acute', 'a']);
    expect(charToKeysyms('ó', LATAM)).toEqual(['dead_acute', 'o']);
    expect(charToKeysyms('ü', LATAM)).toEqual(['dead_diaeresis', 'u']);
  });

  test('respeta las mayusculas acentuadas (el camino viejo las tecleaba mal)', () => {
    expect(charToKeysyms('Á', LATAM)).toEqual(['dead_acute', 'A']);
  });

  test('prefiere el keysym directo si el layout si lo tiene', () => {
    const conAacute = new Set([...LATAM, 'aacute']);
    expect(charToKeysyms('á', conAacute)).toEqual(['aacute']);
  });

  test('devuelve null cuando no hay forma de teclearlo sin remapear', () => {
    expect(charToKeysyms('—', LATAM)).toBeNull();
    expect(charToKeysyms('漢', LATAM)).toBeNull();
  });
});

describe('planTypedPaste', () => {
  test('agrupa todo el texto en un solo tramo de teclas', () => {
    const plan = planTypedPaste('Hola', LATAM);
    expect(plan.runs).toEqual([
      { kind: 'keys', tokens: ['H', 'o', 'l', 'a'], chars: 4 }
    ]);
    expect(plan.unsupported).toEqual([]);
  });

  test('un texto en espanol completo no necesita ningun remapeo', () => {
    const texto = '¿Quién envió la minuta del área técnica? José, añade la validación.';
    const plan = planTypedPaste(texto, LATAM);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].kind).toBe('keys');
    expect(plan.unsupported).toEqual([]);
    expect(plan.chars).toBe(texto.length);
  });

  test('los saltos de linea son un token mas, no una invocacion aparte', () => {
    const plan = planTypedPaste('a\nb', LATAM);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].tokens).toEqual(['a', 'Return', 'b']);
  });

  test('normaliza CRLF y CR a Return', () => {
    expect(planTypedPaste('a\r\nb', LATAM).runs[0].tokens).toEqual(['a', 'Return', 'b']);
    expect(planTypedPaste('a\rb', LATAM).runs[0].tokens).toEqual(['a', 'Return', 'b']);
  });

  test('translitera la tipografia que el keymap no tiene', () => {
    const plan = planTypedPaste('a—b…c', LATAM);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].tokens).toEqual(
      ['a', 'minus', 'b', 'period', 'period', 'period', 'c']
    );
    expect(plan.transliterated).toEqual(['—', '…']);
    expect(plan.unsupported).toEqual([]);
  });

  test('cuenta el progreso sobre el texto original, no sobre el reemplazo', () => {
    // '…' son 3 tokens pero 1 caracter de origen.
    const plan = planTypedPaste('…', LATAM);
    expect(plan.runs[0].chars).toBe(1);
    expect(plan.runs[0].tokens).toHaveLength(3);
  });

  test('descarta los invisibles sin dejar tokens', () => {
    const plan = planTypedPaste('a​b', LATAM);
    expect(plan.runs[0].tokens).toEqual(['a', 'b']);
    expect(plan.transliterated).toEqual(['​']);
  });

  test('con transliterate:false lo tipografico cae al camino lento', () => {
    const plan = planTypedPaste('a—b', LATAM, { transliterate: false });
    expect(plan.runs.map((r) => r.kind)).toEqual(['keys', 'type', 'keys']);
    expect(plan.unsupported).toEqual(['—']);
  });

  test('lo irreproducible queda en tramos type, agrupado', () => {
    const plan = planTypedPaste('hola 漢字 chau', LATAM);
    expect(plan.runs.map((r) => r.kind)).toEqual(['keys', 'type', 'keys']);
    expect(plan.runs[1].text).toBe('漢字');
    expect(plan.unsupported).toEqual(['漢', '字']);
  });

  test('trata los emoji como un solo caracter (pares surrogados)', () => {
    const plan = planTypedPaste('ok 🎙 ya', LATAM);
    const typeRun = plan.runs.find((r) => r.kind === 'type');
    expect(typeRun.text).toBe('🎙');
    expect(plan.unsupported).toEqual(['🎙']);
  });

  test('texto vacio no produce tramos', () => {
    expect(planTypedPaste('', LATAM).runs).toEqual([]);
    expect(planTypedPaste(null, LATAM).runs).toEqual([]);
  });
});

describe('batchRuns', () => {
  test('parte los tramos de teclas para poder cancelar a mitad', () => {
    const plan = planTypedPaste('abcdefghij', LATAM);
    const batches = batchRuns(plan.runs, 4);
    expect(batches.map((b) => b.tokens.join(''))).toEqual(['abcd', 'efgh', 'ij']);
  });

  test('reparte los caracteres del progreso entre los lotes', () => {
    const plan = planTypedPaste('abcdefghij', LATAM);
    const batches = batchRuns(plan.runs, 4);
    expect(batches.reduce((n, b) => n + b.chars, 0)).toBe(10);
  });

  test('parte tambien los tramos type', () => {
    const plan = planTypedPaste('漢字漢字', LATAM);
    const batches = batchRuns(plan.runs, 2);
    expect(batches.map((b) => b.text)).toEqual(['漢字', '漢字']);
  });

  test('un tamano invalido cae al valor por defecto en vez de colgarse', () => {
    const plan = planTypedPaste('abc', LATAM);
    expect(batchRuns(plan.runs, 0)).toHaveLength(1);
    expect(batchRuns(plan.runs, -5)).toHaveLength(1);
  });
});
