# Silia

Silia no razona con Gemini/Anthropic como los demas modos: cuando este modo
esta activo, cada mensaje se delega al orquestador Cerebro
(`python -m cerebro.cli`, ver `src/services/cerebro.service.js`), que combina
Jira, Notion, GitHub y un RAG de transcripciones para responder.

Este archivo existe solo para que `promptLoader`/`get-skill-prompt` tengan
contenido consistente al listar el modo en la UI; no se usa para construir
el prompt real (ese vive en Cerebro, `cerebro/prompts/system_prompt.py`,
persona `"silia"`).

Comandos disponibles en este modo:
- Cualquier pregunta libre: dudas de stakeholders, estado de asignaciones,
  riesgos de cronograma.
- `/silia daily`: checkpoint diario (tickets vencidos, PRs bloqueados, riesgos).
- `/incidente <descripcion>`: pipeline de diagnostico de incidentes; genera un
  prompt listo para pegar en Claude Code, lo copia al portapapeles y lo
  registra en `incidentes.log`.
