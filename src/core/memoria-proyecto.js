/**
 * De que proyecto se habla y que fuente sirve para responder (D8). Cerebro
 * recibe esto como guia en el --contexto-file: el project_key que pasar a
 * las herramientas de Jira, el repo de GitHub y las fuentes sugeridas.
 *
 * Por defecto, el motor de agentes: es el proyecto de casi toda pregunta y,
 * sin project_key, jira_search corre contra TODA la instancia de Jira y lo
 * relevante queda tapado por ruido de otros proyectos.
 */

const PROYECTOS_POR_DEFECTO = Object.freeze([
  {
    dominio: 'agentes',
    nombre: 'motor de agentes',
    projectKey: 'AGE',
    repo: 'Silia-mx/Agent',
    epic: 'AGE-133',
    alias: ['motor de agentes', 'agentes', 'agent', 'engine', 'motor']
  }
]);

// Que fuente responde que tipo de pregunta. El orden no importa: se
// devuelven todas las que coinciden.
const FUENTES = [
  { fuente: 'notion', re: /\b(?:documentaci[oó]n|document\w*|doc|docs|diseñ\w*|spec\w*|especificaci\w*|arquitectura|adr|wiki|manual|gu[ií]a|notion)\b/i },
  { fuente: 'jira', re: /\b(?:estado|estatus|status|avance|sprint|ticket\w*|historia|subtarea\w*|asignad\w*|responsable|bloquead\w*|pendiente\w*|backlog|[eé]pica|jira|[A-Z][A-Z0-9]+-\d+)\b/i },
  { fuente: 'github', re: /\b(?:dev|develop|staging|main|producci[oó]n|prod|desplegad\w*|deploy\w*|release|merge\w*|mergead\w*|rama|branch|pr|prs|pull request|commit\w*|github|#\d+)\b/i },
  { fuente: 'slack', re: /\b(?:se dijo|dijeron|coment[oó]|comentaron|hablamos|hablaron|acordamos|acordaron|platicamos|canal|hilo|slack|mensaje\w*)\b/i },
  { fuente: 'rag', re: /\b(?:reuni[oó]n\w*|minuta\w*|transcripci[oó]n\w*|se dijo|acordamos|acordaron|historial|antecedente\w*)\b/i }
];

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * `proyectos`: el registro (config memoria.proyectos). El primero es el
 * default. Gana el que se nombra en la pregunta; si no, el que se nombra en
 * el resumen de la sesion (se esta hablando de el); si no, el default.
 */
function identificarProyecto(pregunta, resumen = '', proyectos = PROYECTOS_POR_DEFECTO) {
  const lista = Array.isArray(proyectos) && proyectos.length ? proyectos : PROYECTOS_POR_DEFECTO;
  const menciona = (texto) =>
    lista.find((p) => {
      const t = normalizar(texto);
      const clave = new RegExp(`\\b${p.projectKey}-\\d+\\b`, 'i');
      return clave.test(texto) || (p.alias || []).some((a) => new RegExp(`\\b${normalizar(a)}\\b`).test(t));
    });
  const proyecto = menciona(pregunta) || menciona(resumen) || lista[0];
  const origen = menciona(pregunta) ? 'pregunta' : menciona(resumen) ? 'sesion' : 'default';
  // \b de JS es ASCII: "épica" o "producción" sin acentos se prueban tambien.
  const sinAcentos = normalizar(pregunta);
  const fuentes = FUENTES.filter(({ re }) => re.test(pregunta) || re.test(sinAcentos)).map(({ fuente }) => fuente);
  return {
    dominio: proyecto.dominio,
    nombre: proyecto.nombre,
    project_key: proyecto.projectKey,
    repo: proyecto.repo,
    epic: proyecto.epic || null,
    fuentes: [...new Set(fuentes)],
    origen
  };
}

module.exports = { identificarProyecto, PROYECTOS_POR_DEFECTO, FUENTES };
