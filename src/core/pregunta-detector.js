/**
 * Detector de preguntas, etapa 1 (pura, gratis).
 *
 * Filtra el ruido de reconocimiento de voz ANTES de gastar una llamada al
 * modelo rapido (etapa 2, ver detectarPregunta mas abajo). Existe porque el
 * commit e48a0a2 (2026-09-23) mando TODO fragmento de dictado a Cerebro,
 * incluidos los errores de reconocimiento de una reunion real:
 *
 *   "para liar ver las cosas, digamos, en este maldado."
 *   "y vamos a llamar ahi mas empo, y eso es lo que llamar el empo de crear."
 *
 * cada uno pagando 5-48s de Cerebro para volver con un rechazo del modelo.
 *
 * Tres criterios (los tres deben cumplirse, salvo las excepciones que se
 * explican en cada uno):
 *
 *   1. Longitud util >= MIN_CARACTERES: menos de eso no es una consulta
 *      ("ok", "ajá"). EXCEPCION: no aplica si el fragmento trae un "?"
 *      explicito -- un seguimiento como "¿y eso?" (12 caracteres) es
 *      justo lo que motiva tener memoria conversacional, y el piso lo
 *      mataba en silencio antes de llegar a ella.
 *   2. Marcador interrogativo: "?" o una palabra/frase interrogativa
 *      ("que", "como", "existe", "tenemos", "hay", "se puede"...).
 *   3. Coherencia lexica: de las palabras "largas" (>=LONGITUD_PALABRA_LARGA
 *      letras) del fragmento, no puede ser mas de UMBRAL_RATIO_RUIDO ajena a
 *      la FORMA tipica de una palabra pronunciable. NO aplica cuando el
 *      fragmento trae un "?" explicito o el marcador aparece como apertura
 *      clara (primera palabra) -- ahi la intencion ya es inequivoca y este
 *      criterio no tiene nada que aportar, solo riesgo de falso negativo.
 *
 * REVISION (correccion, post primera version): el criterio 3 arranco como
 * una lista blanca de vocabulario conocido (espanol comun + dominio Vysper/
 * Cerebro). Eso resulto CRITICO: cualquier pregunta tecnica de un tema
 * distinto al fixture original quedaba fuera de la lista y se descartaba en
 * silencio -- exactamente el modo de fallo que la regla de desempate del
 * plan prohibe. Probado contra el modulo real, preguntas legitimas como
 * "existe alguna manera de revisar los permisos del usuario nuevo" volvian
 * {candidato:false, motivo:'incoherente-lexicamente'} solo porque
 * "permisos" y "usuario" no estaban en la lista. Ademas la calibracion era
 * circular: el propio fixture de prueba definia la lista que el fixture
 * evaluaba.
 *
 * El criterio 3 se invirtio: en vez de preguntar "¿conozco esta palabra?"
 * (vocabulario, depende del TEMA) pregunta "¿tiene esta palabra la FORMA de
 * una palabra pronunciable?" (fonotactica, no depende del tema en absoluto).
 * Una palabra sin ninguna vocal, con una letra repetida 3+ veces seguidas, o
 * con una tira larga de consonantes seguidas, no es pronunciable en espanol
 * ni en ingles -- eso es la forma tipica del ruido de reconocimiento de voz
 * ("empo", "bntxr"), y es indiferente a si la palabra real es "subagentes"
 * o "facturacion". Vocabulario nuevo de cualquier dominio pasa igual.
 *
 * CALIBRACION (obligatoria, contra el fixture real + el ampliado de
 * test/pregunta-detector.test.js, que ya no define ninguna lista): con las
 * 8 preguntas y los 5 ruidos, los criterios 1 y 2 (longitud + marcador, con
 * las excepciones de arriba) ya separan limpio los dos grupos -- el
 * criterio 3 nunca es el que decide para ESTE fixture (todas las preguntas
 * abren con un marcador o traen "?", asi que quedan exceptuadas de el). Se
 * implementa y se cubre igual con casos construidos aparte (no derivados
 * del fixture, para que la prueba de que discrimina de verdad no dependa de
 * el) porque en una reunion real habra fragmentos con marcador a mitad de
 * frase rodeado de ruido de reconocimiento, que es el caso que existe para
 * atajar.
 *
 * ZONA GRIS QUE NO SE PUDO SEPARAR LIMPIO: "que" sin tilde es interrogativo
 * ("que son los subagentes") o relativo ("eso es lo que llamar el empo de
 * crear"), y el reconocimiento de voz nunca pone tildes para distinguirlos.
 * Se resuelve con una heuristica: "que" NO cuenta como marcador cuando el
 * token inmediatamente anterior es un articulo/demostrativo (lo/el/la/los/
 * las) -- captura el caso real del fixture ("...es LO QUE llamar..."). Esa
 * heuristica falla con construcciones como "digo que..." o "es que..." (el
 * "que" relativo/subordinante sin articulo delante cuela como marcador). Por
 * la regla de desempate del plan -- preferir un FALSO POSITIVO (una consulta
 * de mas) antes que perder una pregunta en silencio -- se deja asi a
 * proposito: no se amplia la lista de exclusiones mas alla de lo verificado
 * contra el fixture real, porque cada exclusion nueva es una forma nueva de
 * perder una pregunta real sin aviso.
 *
 * SEGUNDA ZONA GRIS (introducida por el cambio de requisito que exime del
 * piso de MIN_CARACTERES a los fragmentos con "?"): una charla social corta
 * con signo de interrogacion ("Hola, ¿que tal? Si.", 19 caracteres) ya no
 * puede rechazarse en esta etapa -- trae "?", asi que longitud, marcador y
 * coherencia quedan todos exceptuados. Es una consecuencia real y aceptada
 * del cambio, no un descuido: la etapa 1 es deliberadamente permisiva
 * (mismo criterio de desempate de arriba) y la etapa 2 (detectarPregunta),
 * que ve el fragmento completo con un modelo real y no solo senales
 * estructurales, es la que tiene que reconocer que un saludo no es una
 * consulta tecnica. Ver el test 'una charla social con "?" pasa la etapa 1
 * pero la etapa 2 la descarta' en test/pregunta-detector.test.js.
 */

const MIN_CARACTERES = 20;
const LONGITUD_PALABRA_LARGA = 4;
const UMBRAL_RATIO_RUIDO = 0.5;

// Palabras interrogativas de una sola palabra, sin tilde (el reconocimiento
// de voz casi nunca las pone). "que" se maneja aparte por la ambiguedad de
// arriba.
const MARCADORES_UNA_PALABRA = [
  'que', 'como', 'cual', 'cuales', 'donde', 'quien', 'quienes', 'cuando',
  'cuanto', 'cuantos', 'existe', 'existen', 'tenemos', 'hay', 'puedo', 'podemos'
];

// Frases interrogativas de mas de una palabra: se buscan como sub-secuencia
// de tokens, no como substring crudo (para no matchear "porque" pegado).
const MARCADORES_FRASE = ['por que', 'se puede'];

// "que" bare inmediatamente despues de uno de estos es relativo ("lo que",
// "el que dijo"), no interrogativo. Ver la nota de calibracion arriba.
const PRECEDENTES_RELATIVOS = ['lo', 'el', 'la', 'los', 'las'];

function normalize(text) {
  // \p{M} (Unicode category "Mark") cubre toda marca combinante que deja la
  // normalizacion NFD -- tildes, dieresis, la virgulilla de la "ñ" -- sin
  // tener que escribir el rango de puntos de codigo a mano. Se prefiere a
  // /[̀-ͯ]/ a proposito: ese rango, tecleado como texto, puede
  // terminar guardado como los caracteres combinantes crudos en vez de la
  // secuencia de escape (paso silenciosamente en una version anterior de
  // este archivo) si algo en el camino de edicion decodifica \uXXXX antes de
  // que llegue a disco. \p{M} es ASCII puro: no hay bytes invisibles que un
  // reformateo pueda corromper.
  return (typeof text === 'string' ? text.trim().toLowerCase() : '').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Extrae solo secuencias de letras (unicode) -- descarta puntuacion, numeros, guiones. */
function tokensDeLetras(normalizado) {
  return normalizado.match(/\p{L}+/gu) || [];
}

/**
 * Analiza los marcadores interrogativos de un texto ya normalizado.
 *
 * @returns {{tieneMarcador: boolean, aperturaClara: boolean}} `aperturaClara`
 *   es true cuando el marcador es la PRIMERA palabra del fragmento (o la
 *   frase interrogativa arranca ahi) -- ahi la intencion no es ambigua, y
 *   el criterio 3 (coherencia lexica) no debe poder rechazarlo (ver C1).
 */
function analizarMarcador(normalizado) {
  const tokens = tokensDeLetras(normalizado);
  const reconstruido = tokens.join(' ');

  let tieneMarcador = MARCADORES_FRASE.some((frase) => reconstruido.includes(frase));

  if (!tieneMarcador) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!MARCADORES_UNA_PALABRA.includes(token)) continue;
      if (token === 'que' && PRECEDENTES_RELATIVOS.includes(tokens[i - 1])) continue;
      tieneMarcador = true;
      break;
    }
  }

  const primerToken = tokens[0];
  const aperturaClara = Boolean(
    (primerToken && MARCADORES_UNA_PALABRA.includes(primerToken)) ||
    MARCADORES_FRASE.some((frase) => reconstruido.startsWith(frase))
  );

  return { tieneMarcador, aperturaClara };
}

/**
 * Heuristica ESTRUCTURAL (fonotactica), no de vocabulario: no le importa el
 * TEMA de la palabra, solo su forma. Vocabulario tecnico nuevo de cualquier
 * dominio pasa igual que "subagentes" o "facturacion"; lo que se atrapa es
 * la forma tipica del ruido de reconocimiento de voz visto en produccion
 * ("empo", construcciones sin ninguna vocal o con tiras largas de
 * consonantes que no se pronuncian ni en espanol ni en ingles).
 */
function pareceRuidoDeReconocimiento(palabra) {
  if (!/[aeiou]/.test(palabra)) return true; // ninguna vocal -> impronunciable
  if (/(.)\1\1/.test(palabra)) return true; // 3+ repeticiones seguidas de la misma letra
  if (/[^aeiou]{5,}/.test(palabra)) return true; // 5+ consonantes seguidas
  return false;
}

function coherenciaLexica(normalizado) {
  const palabrasLargas = tokensDeLetras(normalizado).filter((t) => t.length >= LONGITUD_PALABRA_LARGA);
  if (palabrasLargas.length === 0) {
    // Sin palabras largas no hay senal para este criterio. Preferimos el
    // falso positivo (dejar pasar) al falso negativo, igual que en el resto
    // de esta calibracion.
    return { ok: true, ratioRuido: 0 };
  }
  const ruidosas = palabrasLargas.filter(pareceRuidoDeReconocimiento);
  const ratio = ruidosas.length / palabrasLargas.length;
  // "mas de la mitad" -> estrictamente mayor, no >=, para no descartar un
  // empate.
  return { ok: ratio <= UMBRAL_RATIO_RUIDO, ratioRuido: ratio };
}

/**
 * Etapa 1 del detector: decide si un fragmento de dictado PUEDE ser una
 * pregunta, sin gastar ninguna llamada a un modelo.
 *
 * @param {string} texto
 * @returns {{candidato: boolean, motivo: string|null}}
 */
function puedeSerPregunta(texto) {
  if (typeof texto !== 'string') {
    return { candidato: false, motivo: 'invalido' };
  }

  const util = texto.trim();
  const tieneSigno = util.includes('?');

  if (!tieneSigno && util.length < MIN_CARACTERES) {
    return { candidato: false, motivo: 'demasiado-corto' };
  }

  const normalizado = normalize(util);
  const { tieneMarcador, aperturaClara } = analizarMarcador(normalizado);

  if (!tieneSigno && !tieneMarcador) {
    return { candidato: false, motivo: 'sin-marcador-interrogativo' };
  }

  // El "?" o una apertura interrogativa clara ya hacen inequivoca la
  // intencion: el criterio 3 no puede rechazar nada de esto (ver C1).
  if (!tieneSigno && !aperturaClara) {
    const { ok } = coherenciaLexica(normalizado);
    if (!ok) {
      return { candidato: false, motivo: 'incoherente-lexicamente' };
    }
  }

  return { candidato: true, motivo: null };
}

/**
 * Etapa 2 del detector (modelo rapido, una llamada).
 *
 * Solo corre sobre lo que la etapa 1 dejo pasar -- sin eso, cada fragmento
 * de dictado costaria una llamada al modelo, incluido "ok" y "ajá".
 *
 * Recibe el candidato (el ultimo fragmento) mas los 2 fragmentos anteriores,
 * porque una pregunta real puede partirse entre dos fragmentos de dictado
 * ("y un endpoint" / "para ver eso?"). `preguntar(texto)` es inyectado -- en
 * produccion llama a processTextWithSecondaryTextModel (main.js, Task 8);
 * aca solo se le exige la forma: recibe un string y devuelve (o promete)
 * `{esPregunta, preguntaNormalizada}`.
 *
 * Un fallo del clasificador (timeout, JSON invalido, lo que sea) NUNCA puede
 * romper el dictado en vivo: se atrapa y se responde "no es pregunta" en vez
 * de propagar la excepcion.
 *
 * @param {string[]} fragmentos - transcripcion reciente, en orden; el ultimo es el candidato.
 * @param {(texto: string) => Promise<{esPregunta: boolean, preguntaNormalizada: string|null}>} preguntar
 * @returns {Promise<{esPregunta: boolean, preguntaNormalizada: string|null, motivo: string|null}>}
 */
async function detectarPregunta(fragmentos, preguntar) {
  const lista = Array.isArray(fragmentos) ? fragmentos : [];
  const candidato = lista[lista.length - 1];

  const { candidato: esCandidato, motivo } = puedeSerPregunta(candidato);
  if (!esCandidato) {
    return { esPregunta: false, preguntaNormalizada: null, motivo };
  }

  const previos = lista.slice(Math.max(0, lista.length - 3), lista.length - 1);
  const texto = [...previos, candidato].join('\n');

  try {
    const resultado = await preguntar(texto);
    if (!resultado || !resultado.esPregunta) {
      return { esPregunta: false, preguntaNormalizada: null, motivo: 'el-modelo-descarto', clasificadorFallo: false };
    }
    return {
      esPregunta: true,
      preguntaNormalizada: resultado.preguntaNormalizada,
      motivo: null,
      clasificadorFallo: false
    };
  } catch (error) {
    // No rompe el dictado, pero tampoco se hace pasar por un "no es
    // pregunta": `clasificadorFallo` le deja al llamador avisar. Callarlo
    // dejaba el modo pasmado, sin respuesta y sin decir por que.
    return {
      esPregunta: false,
      preguntaNormalizada: null,
      motivo: `fallo del clasificador: ${error.message}`,
      clasificadorFallo: true,
      error: error.message
    };
  }
}

const MAX_DEDUP = 3;

/**
 * Evita relanzar la misma consulta cuando el dictado la parte y la repite
 * (la etapa 2 la normaliza distinto cada vez que se corta distinto). Solo
 * recuerda las MAX_DEDUP mas recientes -- no hace falta mas: una asesoria
 * en vivo no vuelve sobre un tema de hace 10 preguntas con la misma
 * redaccion exacta, y guardar todo el historial no aporta nada mas.
 */
class Deduplicador {
  constructor() {
    this.recientes = [];
  }

  _normalizar(pregunta) {
    return normalize(String(pregunta || '')).replace(/\s+/g, ' ');
  }

  yaConsultada(pregunta) {
    return this.recientes.includes(this._normalizar(pregunta));
  }

  registrar(pregunta) {
    this.recientes.push(this._normalizar(pregunta));
    if (this.recientes.length > MAX_DEDUP) {
      this.recientes = this.recientes.slice(-MAX_DEDUP);
    }
  }
}

module.exports = {
  puedeSerPregunta,
  detectarPregunta,
  Deduplicador,
  MIN_CARACTERES,
  MAX_DEDUP,
  LONGITUD_PALABRA_LARGA,
  UMBRAL_RATIO_RUIDO
};
