const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../core/logger').createServiceLogger('LLM');
const config = require('../core/config');
const { promptLoader } = require('../../prompt-loader');

class LLMService {
  constructor() {
    this.client = null;
    this.model = null;
    this.isInitialized = false;
    this.requestCount = 0;
    this.errorCount = 0;
    this.primaryQuotaExhaustedUntil = 0;

    this.initializeClient();
  }

  initializeClient() {
    const apiKey = config.getApiKey('GEMINI');
    
    if (!apiKey || apiKey === 'your-api-key-here') {
      logger.warn('Gemini API key not configured', { 
        keyExists: !!apiKey,
        isPlaceholder: apiKey === 'your-api-key-here'
      });
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      this.model = this.client.getGenerativeModel({ 
        model: config.get('llm.gemini.model') 
      });
      this.isInitialized = true;
      
      logger.info('Gemini AI client initialized successfully', {
        model: config.get('llm.gemini.model')
      });
    } catch (error) {
      logger.error('Failed to initialize Gemini client', { 
        error: error.message 
      });
    }
  }

  getRagBaseUrl() {
    return (process.env.VYSPER_RAG_URL || 'http://localhost:9621').replace(/\/$/, '');
  }

  getRagDataEndpoint() {
    return `${this.getRagBaseUrl()}/query/data`;
  }

  getRagTimeoutMs() {
    const timeoutMs = Number.parseInt(process.env.VYSPER_RAG_TIMEOUT_MS || '20000', 10);
    return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20000;
  }

  getRagEnvFilePath() {
    if (process.env.VYSPER_RAG_ENV_FILE) return process.env.VYSPER_RAG_ENV_FILE;

    return process.platform === 'win32'
      ? 'F:\\Desarrollo\\MiRag\\LightRAG\\.env'
      : '/media/san/Miscosas6/Desarrollo/MiRag/LightRAG/.env';
  }

  getRagStorageDir() {
    const configuredStorageDir = process.env.VYSPER_RAG_STORAGE_DIR ||
      this.readEnvValue(this.getRagEnvFilePath(), 'WORKING_DIR');

    if (configuredStorageDir) {
      return configuredStorageDir.endsWith('rag_storage')
        ? configuredStorageDir
        : path.join(configuredStorageDir, 'rag_storage');
    }

    return path.join(path.dirname(this.getRagEnvFilePath()), 'data', 'rag_storage');
  }

  readEnvValue(filePath, key) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return '';

      const envContent = fs.readFileSync(filePath, 'utf8');
      const linePattern = new RegExp(`^(?:export\\s+)?${key}\\s*=`);
      const line = envContent
        .split(/\r?\n/)
        .map(rawLine => rawLine.trim())
        .find(rawLine => linePattern.test(rawLine));

      if (!line) return '';

      const value = line.slice(line.indexOf('=') + 1).trim();
      return value.replace(/^['"]|['"]$/g, '');
    } catch (error) {
      logger.warn('Unable to read LightRAG env file for API key', {
        envFile: filePath,
        error: error.message
      });
      return '';
    }
  }

  getRagApiKey() {
    const ragEnvApiKey = this.readEnvValue(this.getRagEnvFilePath(), 'LIGHTRAG_API_KEY');
    return ragEnvApiKey || process.env.LIGHTRAG_API_KEY || '';
  }

  readJsonFile(filePath) {
    try {
      if (!filePath || !fs.existsSync(filePath)) return null;
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      logger.warn('Unable to read JSON file', {
        filePath,
        error: error.message
      });
      return null;
    }
  }

  getRagCurlExample(query = 'Sandra Esmeralda Senior Software Engineer experience') {
    const isCompensationQuery = this.isCompensationQuestion(query);
    const payload = JSON.stringify({
      query,
      mode: 'mix',
      top_k: isCompensationQuery ? 16 : 8,
      chunk_top_k: isCompensationQuery ? 12 : 6
    });
    const ragDir = path.dirname(this.getRagEnvFilePath());
    return `cd '${ragDir}' && set -a && source .env && set +a && curl -sS -X POST '${this.getRagDataEndpoint()}' -H "X-API-Key: $LIGHTRAG_API_KEY" -H 'Content-Type: application/json' --data '${payload}'`;
  }

  buildRagHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = this.getRagApiKey();

    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    } else {
      logger.warn('Behavioral RAG API key is not configured', {
        expectedEnvFile: this.getRagEnvFilePath(),
        expectedEnvVar: 'LIGHTRAG_API_KEY',
        curlExample: this.getRagCurlExample()
      });
    }

    return headers;
  }

  shouldUseRagFirst(activeSkill, text = '') {
    const skillName = this.normalizeSkillName(activeSkill);
    return skillName === 'behavioral' ||
      skillName === 'negotiation' ||
      this.isCompensationQuestion(text);
  }

  isBehavioralRagDebugRequest(text) {
    return /^\s*\/rag(?:\s|$)/i.test(String(text || ''));
  }

  getBehavioralRagDebugQuestion(text) {
    return String(text || '')
      .replace(/^\s*\/rag\b\s*/i, '')
      .trim();
  }

  isCompensationQuestion(text) {
    const normalized = String(text || '').toLowerCase();
    // Spanish adjectives inflect for gender/number (salario/salarial/salariales,
    // bruto/bruta/brutos/brutas, mensual/mensuales), so word-for-word \b matches on
    // only the singular masculine form missed the plural/feminine phrasing people
    // actually say in interviews ("expectativas salariales brutas mensuales").
    // Also covers common EN/ES phrasing beyond the literal word "salary/salario":
    // package, take-home, base pay, pretensión/aspiración salarial, remuneración.
    return /\b(salary|salaries|compensation|pay|payroll|wage(?:s)?|earn(?:ings)?|bonus(?:es)?|package|take-home|take home|base pay|base salary|gross|net|annual(?:ly)?|monthly|month|yearly|expectation(?:s)?|expected|desired|benefit(?:s)?|working conditions?|salary range|pay range|sueldo(?:s)?|salari(?:o|os|al|ales)|compensaci[oó]n(?:es)?|remuneraci[oó]n(?:es)?|brut[oa](?:s)?|net[oa](?:s)?|mensual(?:es)?|anual(?:es)?|prestaci[oó]n(?:es)?|beneficio(?:s)?|pretensi[oó]n(?:es)?|aspiraci[oó]n(?:es)?|paquete(?:s)?|rango salarial|cu[aá]nto (?:ganas|esperas ganar|te gustar[ií]a ganar))\b/i.test(normalized);
  }

  buildCompensationRagQuery(userQuestion) {
    const question = String(userQuestion || '').trim();
    return [
      'Sandra Esmeralda Reyes Galvan',
      'Sandra Esmeralda Reyes Galván',
      'category: compensation_target',
      'time_scope: current',
      'intent: compensation_expectation',
      'desired salary expectations',
      'gross net monthly annual currency range_min range_max period modality payroll contractor negotiable_items non_negotiables',
      'If the target period is monthly and the interviewer asks annual salary, retrieve the monthly gross target so it can be multiplied by 12.',
      `Interview question: ${question}`
    ].join(' | ');
  }

  hasCurrentCompensationTargetEvidence(context) {
    const normalized = String(context || '').toLowerCase();
    return normalized.includes('category: compensation_target') &&
      normalized.includes('time_scope: current') &&
      normalized.includes('period: monthly') &&
      normalized.includes('type: gross') &&
      (normalized.includes('range_min') || normalized.includes('range_max'));
  }

  extractLocalCompensationTargetContext() {
    const storageDir = this.getRagStorageDir();
    const stores = [
      path.join(storageDir, 'kv_store_text_chunks.json'),
      path.join(storageDir, 'kv_store_full_docs.json')
    ];

    const matches = [];
    const seenContent = new Set();
    for (const storePath of stores) {
      const store = this.readJsonFile(storePath);
      if (!store || typeof store !== 'object') continue;

      for (const [id, item] of Object.entries(store)) {
        if (!item || typeof item !== 'object') continue;
        const content = String(item.content || item.text || item.page_content || '');
        if (!this.hasCurrentCompensationTargetEvidence(content)) continue;
        const cleanedContent = this.cleanRagContent(content);
        if (seenContent.has(cleanedContent)) continue;
        seenContent.add(cleanedContent);

        matches.push({
          id,
          filePath: item.file_path || item.source || path.basename(storePath),
          content: cleanedContent
        });
      }
    }

    if (!matches.length) return '';

    return matches
      .map(match => `${match.filePath} / ${match.id}: ${match.content}`)
      .join('\n\n')
      .trim();
  }

  buildDerivedCompensationContext(context) {
    if (!this.hasCurrentCompensationTargetEvidence(context)) return '';

    const minLine = String(context).match(/range_min:\s*([^\n]+)/i)?.[1] || '';
    const maxLine = String(context).match(/range_max:\s*([^\n]+)/i)?.[1] || '';
    const contractorMin = Number.parseInt(minLine.match(/(\d+(?:,\d+)*)\s+as contractor/i)?.[1]?.replace(/,/g, '') || '', 10);
    const contractorMax = Number.parseInt(maxLine.match(/(\d+(?:,\d+)*)\s+as contractor/i)?.[1]?.replace(/,/g, '') || '', 10);
    const payrollMin = Number.parseInt(minLine.match(/(\d+(?:,\d+)*)\s+as employee/i)?.[1]?.replace(/,/g, '') || '', 10);
    const payrollMax = Number.parseInt(maxLine.match(/(\d+(?:,\d+)*)\s+as employee/i)?.[1]?.replace(/,/g, '') || '', 10);

    const lines = [
      'Derived compensation calculations from current monthly gross target:',
      'currency: USD',
      'period_source: monthly',
      'type: gross',
      'annualization_rule: monthly gross amount * 12'
    ];

    if (Number.isFinite(contractorMin) && Number.isFinite(contractorMax)) {
      lines.push(`contractor_annual_gross_range: ${contractorMin * 12}-${contractorMax * 12} USD`);
    }

    if (Number.isFinite(payrollMin) && Number.isFinite(payrollMax)) {
      lines.push(`employee_payroll_annual_gross_range: ${payrollMin * 12}-${payrollMax * 12} USD`);
    }

    return lines.length > 5 ? lines.join('\n') : '';
  }

  buildBehavioralRagQuery(userQuestion) {
    const question = String(userQuestion || '').trim();
    if (this.isCompensationQuestion(question)) {
      return this.buildCompensationRagQuery(question);
    }

    const profileAnchor = [
      'Sandra Esmeralda Reyes Galvan',
      'personal resume CV professional profile',
      'software engineering leadership experience',
      'VestaOS Scotiabank AI ML MLOps RAG systems cloud transformation projects'
    ].join(' | ');

    if (/sandra|esmeralda|reyes|galv[aá]n/i.test(question)) {
      return `${profileAnchor}. Interview question: ${question}`;
    }

    return `${profileAnchor}. The interviewer is asking about Sandra's own background and past experience. Interview question: ${question}`;
  }

  async queryBehavioralRag(userQuestion) {
    const endpoint = this.getRagDataEndpoint();
    const ragQuery = this.buildBehavioralRagQuery(userQuestion);
    let lastRaw = null;
    const isCompensationQuery = this.isCompensationQuestion(userQuestion);
    const payloads = [
      {
        query: ragQuery,
        mode: 'mix',
        top_k: isCompensationQuery ? 16 : 8,
        chunk_top_k: isCompensationQuery ? 12 : 6
      },
      {
        query: ragQuery,
        mode: 'naive',
        top_k: isCompensationQuery ? 16 : 8,
        chunk_top_k: isCompensationQuery ? 12 : 6
      }
    ];

    for (const payload of payloads) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.buildRagHeaders(),
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.getRagTimeoutMs())
        });

        if (!response.ok) {
          logger.warn('Behavioral RAG query returned non-OK status', {
            endpoint,
            status: response.status,
            payloadKeys: Object.keys(payload),
            hasApiKey: !!this.getRagApiKey(),
            expectedEnvFile: this.getRagEnvFilePath(),
            expectedEnvVar: 'LIGHTRAG_API_KEY',
            curlExample: this.getRagCurlExample(userQuestion),
            timeoutMs: this.getRagTimeoutMs()
          });
          continue;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          lastRaw = data;
          const context = this.extractRagContext(data, { preferCompensation: isCompensationQuery });
          if (context && (!isCompensationQuery || this.hasCurrentCompensationTargetEvidence(context))) {
            return { context, raw: data, endpoint };
          }
        } else {
          lastRaw = await response.text();
        }
      } catch (error) {
        logger.warn('Behavioral RAG query failed', {
          endpoint,
          payloadKeys: Object.keys(payload),
          error: error.message,
          timeoutMs: this.getRagTimeoutMs()
        });
      }
    }

    if (isCompensationQuery) {
      const localCompensationContext = this.extractLocalCompensationTargetContext();
      if (localCompensationContext) {
        logger.info('Using local LightRAG compensation target fallback', {
          storageDir: this.getRagStorageDir(),
          contextLength: localCompensationContext.length
        });
        return { context: localCompensationContext, raw: lastRaw, endpoint: `${endpoint} + local_storage_fallback` };
      }
    }

    return { context: '', raw: lastRaw, endpoint };
  }

  cleanRagContent(content) {
    return String(content || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getRagEvidencePriority(item, options = {}) {
    if (!options.preferCompensation || !item || typeof item !== 'object') return 0;

    const searchable = [
      item.content,
      item.text,
      item.chunk,
      item.page_content,
      item.file_path,
      item.document_id,
      item.source,
      item.chunk_id,
      item.id
    ].map(value => String(value || '').toLowerCase()).join(' ');

    let priority = 0;
    if (searchable.includes('compensation_target')) priority += 100;
    if (searchable.includes('time_scope: current') || searchable.includes('time_scope current')) priority += 40;
    if (searchable.includes('compensation_expectation')) priority += 30;
    if (searchable.includes('range_min') || searchable.includes('range_max')) priority += 25;
    if (searchable.includes('gross') || searchable.includes('bruto')) priority += 15;
    if (searchable.includes('monthly') || searchable.includes('mensual')) priority += 10;
    if (searchable.includes('<!doctype html') || searchable.includes('<html')) priority -= 50;
    return priority;
  }

  extractRagContext(data, options = {}) {
    if (!data || typeof data === 'string') return '';

    const dataSection = data.data && typeof data.data === 'object' ? data.data : data;
    const sourceArrays = [dataSection.chunks, dataSection.references].filter(Array.isArray);

    for (const sourceArray of sourceArrays) {
      const context = [...sourceArray]
        .sort((left, right) => this.getRagEvidencePriority(right, options) - this.getRagEvidencePriority(left, options))
        .map((item, index) => {
          if (!item || typeof item !== 'object') return '';
          const content = this.cleanRagContent(item.content || item.text || item.chunk || item.page_content);
          const title = item.file_path || item.document_id || item.source || item.chunk_id || item.id || `Source ${index + 1}`;
          return content ? `${title}: ${content}` : '';
        })
        .filter(Boolean)
        .join('\n\n')
        .trim();

      if (context) return context;
    }

    return '';
  }

  isInsufficientRagContext(context) {
    const normalized = String(context || '').trim().toLowerCase();
    if (!normalized) return true;

    return [
      'i do not have enough information to answer',
      'not enough information to answer',
      'no tengo suficiente informacion',
      'no tengo suficiente información',
      'insufficient information',
      'no matching profile evidence'
    ].some(phrase => normalized.includes(phrase));
  }

  summarizeRagRawResponse(raw) {
    if (!raw || typeof raw !== 'object') {
      return { keys: [], responseLength: 0, references: [], chunks: [] };
    }

    const dataSection = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const references = Array.isArray(dataSection.references) ? dataSection.references.map(reference => ({
      filePath: reference.file_path || reference.source || reference.id || 'unknown',
      hasContent: !!reference.content,
      contentLength: String(reference.content || '').length
    })) : [];
    const chunks = Array.isArray(dataSection.chunks) ? dataSection.chunks.map(chunk => ({
      filePath: chunk.file_path || chunk.source || chunk.id || 'unknown',
      chunkId: chunk.chunk_id || chunk.id || 'unknown',
      hasContent: !!chunk.content,
      contentLength: String(chunk.content || '').length,
      preview: this.cleanRagContent(chunk.content || '').slice(0, 240)
    })) : [];

    return {
      keys: Object.keys(raw),
      dataKeys: Object.keys(dataSection),
      responseLength: String(raw.response || raw.answer || raw.result || '').length,
      references,
      chunks
    };
  }

  buildRagDebugResponse(userQuestion, ragResult, ragQuery) {
    const rawSummary = this.summarizeRagRawResponse(ragResult.raw);
    const context = ragResult.context || '';
    const hasVerifiableContext = !!context && !this.isInsufficientRagContext(context);
    const rawGeneratedAnswer = ragResult.raw && typeof ragResult.raw === 'object'
      ? String(ragResult.raw.response || ragResult.raw.answer || ragResult.raw.result || '').trim()
      : '';
    const generatedPreview = rawGeneratedAnswer
      ? rawGeneratedAnswer.slice(0, 900)
      : 'No generated response field returned.';

    const references = rawSummary.references.length
      ? rawSummary.references.map(reference => `- ${reference.filePath}: content=${reference.hasContent ? 'yes' : 'no'}, bytes=${reference.contentLength}`).join('\n')
      : '- No references returned.';
    const chunks = rawSummary.chunks.length
      ? rawSummary.chunks.map(chunk => `- ${chunk.filePath} / ${chunk.chunkId}: content=${chunk.hasContent ? 'yes' : 'no'}, bytes=${chunk.contentLength}\n  preview: ${chunk.preview}`).join('\n')
      : '- No chunks returned.';

    return `# RAG Debug\n\n## Curl usado\n\`\`\`bash\n${this.getRagCurlExample(ragQuery)}\n\`\`\`\n\n## Query enviada al RAG\n${ragQuery}\n\n## Resultado\n- Endpoint: ${ragResult.endpoint}\n- Contexto verificable usado por Vysper: ${hasVerifiableContext ? 'SI' : 'NO'}\n- Longitud de contexto verificable: ${context.length}\n- Tipo de query: ${this.isCompensationQuestion(userQuestion) ? 'compensation_target/current' : 'behavioral_profile'}\n- Keys del JSON: ${rawSummary.keys.join(', ') || 'none'}\n- Keys de data: ${(rawSummary.dataKeys || []).join(', ') || 'none'}\n- Longitud del campo generado response/answer/result: ${rawSummary.responseLength}\n\n## Chunks usados como evidencia\n${chunks}\n\n## Referencias\n${references}\n\n## Preview de respuesta generada por LightRAG\n${generatedPreview}`;
  }

  async debugBehavioralRag(userQuestion) {
    const question = this.getBehavioralRagDebugQuestion(userQuestion) || userQuestion;
    const ragQuery = this.buildBehavioralRagQuery(question);
    const ragResult = await this.queryBehavioralRag(question);
    return {
      response: this.buildRagDebugResponse(question, ragResult, ragQuery),
      metadata: {
        skill: 'behavioral',
        usedFallback: false,
        ragDebug: true,
        ragUsed: !!ragResult.context && !this.isInsufficientRagContext(ragResult.context),
        ragEndpoint: ragResult.endpoint,
        ragContextLength: ragResult.context ? ragResult.context.length : 0
      }
    };
  }

  buildNoRagEvidenceResponse(userQuestion) {
    const question = String(userQuestion || '').trim();
    const isEnglish = /^[\x00-\x7F]*$/.test(question);

    if (this.isCompensationQuestion(question)) {
      return isEnglish
        ? 'I did not find the current compensation target in RAG, so I should not infer a salary expectation. Please confirm the current gross/net amount, period, currency, and modality.'
        : 'No encontré el objetivo de compensación actual en RAG, así que no debo inferir una expectativa salarial. Confirma el monto bruto/neto actual, periodo, moneda y modalidad.';
    }

    if (isEnglish) {
      return 'I do not have matching profile evidence in the RAG for that question, so I should not claim specific roles, companies, dates, projects, or metrics. A safe generic answer structure would be: "I have worked with AI-assisted development workflows, but I would need the exact project details to give a grounded STAR example."';
    }

    return 'No encontré evidencia de perfil en el RAG para esa pregunta, así que no debo afirmar roles, empresas, fechas, proyectos o métricas específicas. Una respuesta genérica segura sería: "He trabajado con flujos de desarrollo asistidos por IA, pero necesito los detalles exactos del proyecto para dar un ejemplo STAR fundamentado."';
  }

  async getBehavioralRagContext(activeSkill, userQuestion) {
    if (!this.shouldUseRagFirst(activeSkill, userQuestion)) {
      return { applicable: false, ragContext: '', ragUsed: false, ragEndpoint: null, ragContextLength: 0 };
    }

    const ragResult = await this.queryBehavioralRag(userQuestion);
    let ragContext = ragResult.context ? ragResult.context.slice(0, 12000) : '';
    if (this.isInsufficientRagContext(ragContext)) {
      ragContext = '';
    }
    const derivedCompensationContext = this.isCompensationQuestion(userQuestion)
      ? this.buildDerivedCompensationContext(ragContext)
      : '';
    if (derivedCompensationContext) {
      ragContext = `${derivedCompensationContext}\n\n${ragContext}`;
    }

    if (!ragContext) {
      logger.warn('Behavioral RAG returned no usable context; profile-specific claims are disabled', {
        endpoint: ragResult.endpoint
      });
    } else {
      logger.info('Behavioral RAG context retrieved', {
        endpoint: ragResult.endpoint,
        contextLength: ragContext.length
      });
    }

    return {
      applicable: true,
      ragContext,
      ragUsed: !!ragContext,
      ragEndpoint: ragResult.endpoint,
      ragContextLength: ragContext.length
    };
  }

  buildBehavioralRagInstructionBlock(ragContext, userQuestion) {
    const compensationRules = this.isCompensationQuestion(userQuestion)
      ? `\n\n# Mandatory Compensation Grounding Rules\nFor salary, benefits, or working-condition questions:\n- Use ONLY current compensation target evidence from Retrieved Behavioral RAG Context, especially category: compensation_target and time_scope: current.\n- Ignore compensation_history for setting expectations unless the user explicitly asks for history.\n- Confirm currency, gross/net, period, modality, and location when available.\n- If the retrieved target is monthly and the interviewer asks for desired annual salary, annualize by multiplying the monthly gross range by 12. State that conversion clearly.\n- Use ranges when range_min and range_max are available. Do not collapse a range into a single fixed number unless the user explicitly asks.\n- Do NOT infer salary expectations from resume HTML, role seniority, market averages, or generic salary data.`
      : '';

    const profileGroundingRules = `\n\n# Mandatory Profile Grounding Rules\nFor behavioral interview answers about the user's specific profile, resume, past roles, companies, projects, metrics, agentic coding experience, achievements, or career history:\n- Use ONLY facts present in the Retrieved Behavioral RAG Context and the user's current transcript for exact names, dates, employers, titles, projects, metrics, and credentials.\n- Treat Retrieved Behavioral RAG Context as raw source evidence, not as a draft to embellish. Preserve company names, job titles, dates, project names, and metrics exactly as stated.\n- Do NOT invent job titles, employers, dates, seniority, teams, products, metrics, credentials, or projects.\n- If retrieved context is thin or missing, still produce a usable first-person STAR answer from the transcript theme. Use neutral phrasing such as "in a recent project" instead of asking for confirmation.\n- Do not pause for clarification during live behavioral interview mode. Answer as the candidate would say it.\n- Never include shell commands, curl commands, environment variable snippets, or RAG diagnostics in behavioral answers unless the user explicitly asks for debugging help.${compensationRules}`;

    const ragInstruction = ragContext
      ? `\n\n# Retrieved Behavioral RAG Context\nUse this retrieved context first when crafting the behavioral interview answer. Prefer these facts over generic examples. Do not invent facts beyond the transcript and retrieved context.\n\n${ragContext}`
      : `\n\n# Retrieved Behavioral RAG Context\nNo usable profile context was retrieved from RAG for this question. Still answer in first person using a neutral, adaptable STAR story based on the transcript theme. Avoid exact personal claims not present in the transcript.`;

    return `${profileGroundingRules}${ragInstruction}`;
  }

  async enrichGeminiRequestWithBehavioralRag(geminiRequest, userQuestion, activeSkill) {
    const ragData = await this.getBehavioralRagContext(activeSkill, userQuestion);
    if (!ragData.applicable) {
      return { geminiRequest, ragUsed: false, ragEndpoint: null, ragContextLength: 0 };
    }

    const fullRagInstruction = this.buildBehavioralRagInstructionBlock(ragData.ragContext, userQuestion);

    if (geminiRequest.systemInstruction?.parts?.[0]?.text) {
      geminiRequest.systemInstruction.parts[0].text = `${geminiRequest.systemInstruction.parts[0].text}${fullRagInstruction}`;
    } else {
      geminiRequest.systemInstruction = {
        parts: [{ text: `# Behavioral Interview Helper Agent${fullRagInstruction}` }]
      };
    }

    if (ragData.ragUsed) {
      logger.info('Behavioral RAG context attached to Gemini request', {
        endpoint: ragData.ragEndpoint,
        contextLength: ragData.ragContextLength
      });
    }

    return {
      geminiRequest,
      ragUsed: ragData.ragUsed,
      ragEndpoint: ragData.ragEndpoint,
      ragContextLength: ragData.ragContextLength
    };
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (this.shouldFallbackToSecondaryTextModel(initError)) {
        return this.processTextWithSecondaryTextFallback(
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          initError
        );
      }
      throw initError;
    }

    if (this.isPrimaryQuotaExhausted() && this.hasSecondaryTextModel()) {
      return this.processTextWithSecondaryTextFallback(
        text,
        activeSkill,
        sessionMemory,
        programmingLanguage,
        new Error('Gemini quota cooldown active; skipping primary attempt.')
      );
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing text with LLM', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.shouldUseRagFirst(activeSkill, text) && this.isBehavioralRagDebugRequest(text)) {
        const debugResult = await this.debugBehavioralRag(text);
        debugResult.metadata.processingTime = Date.now() - startTime;
        debugResult.metadata.requestId = this.requestCount;
        debugResult.metadata.programmingLanguage = programmingLanguage;
        return debugResult;
      }

      let geminiRequest = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const ragMetadata = await this.enrichGeminiRequestWithBehavioralRag(geminiRequest, text, activeSkill);
      geminiRequest = ragMetadata.geminiRequest;

      if (this.shouldUseRagFirst(activeSkill, text) &&
          !ragMetadata.ragUsed &&
          this.normalizeSkillName(activeSkill) !== 'behavioral') {
        const response = this.buildNoRagEvidenceResponse(text);
        return {
          response,
          metadata: {
            skill: activeSkill,
            programmingLanguage,
            processingTime: Date.now() - startTime,
            requestId: this.requestCount,
            usedFallback: false,
            ragUsed: false,
            ragEndpoint: ragMetadata?.ragEndpoint || null,
            ragContextLength: 0
          }
        };
      }
      
      // Try standard method first
      let response;
      try {
        response = await this.executeRequest(geminiRequest);
      } catch (error) {
        // If fetch failed, try alternative method
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          logger.warn('Standard request failed, trying alternative method', {
            error: error.message,
            requestId: this.requestCount
          });
          response = await this.executeAlternativeRequest(geminiRequest);
        } else {
          throw error;
        }
      }
      
      logger.logPerformance('LLM text processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: response.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          ragUsed: ragMetadata?.ragUsed || false,
          ragEndpoint: ragMetadata?.ragEndpoint || null,
          ragContextLength: ragMetadata?.ragContextLength || 0
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.shouldFallbackToSecondaryTextModel(error)) {
        this.markPrimaryQuotaExhausted(error);
        return this.processTextWithSecondaryTextFallback(text, activeSkill, sessionMemory, programmingLanguage, error, startTime);
      }

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateFallbackResponse(text, activeSkill);
      }

      throw error;
    }
  }

  async processTextWithSecondaryCodingModel(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (this.normalizeSkillName(activeSkill) !== 'programming') {
      return this.processTextWithSkill(text, activeSkill, sessionMemory, programmingLanguage);
    }

    return this.processTextWithSecondaryTextModel(text, activeSkill, sessionMemory, programmingLanguage);
  }

  async processTextWithSecondaryTextModel(text, activeSkill, sessionMemory = [], programmingLanguage = null, options = {}) {
    const normalizedSkill = this.normalizeSkillName(activeSkill);
    if (!this.hasSecondaryTextModel()) {
      throw new Error('Secondary text model is not configured. Set ANTHROPIC_API_KEY or ANTHROPIC_FALLBACK_API_KEY in .env.');
    }

    const startTime = Date.now();
    this.requestCount++;
    const apiKeys = this.getSecondaryTextModelApiKeys();
    let lastAccountError = null;

    // A caller with a fully custom system instruction (e.g. /hoy's dumping
    // analysis) never uses ragInstructionBlock (buildSecondaryTextSystemInstruction
    // returns customSystemInstruction verbatim, before it would be appended) --
    // skip the RAG lookup entirely rather than pay its latency for nothing.
    // Without this, isCompensationQuestion's broad keyword heuristic can false-
    // positive on large free-form dumps (confirmed live on a 240KB Jira dump).
    const ragData = options.customSystemInstruction
      ? { applicable: false, ragContext: '', ragUsed: false, ragEndpoint: null, ragContextLength: 0 }
      : await this.getBehavioralRagContext(activeSkill, text);
    const ragInstructionBlock = ragData.applicable
      ? this.buildBehavioralRagInstructionBlock(ragData.ragContext, text)
      : '';
    if (ragData.ragUsed) {
      logger.info('Behavioral RAG context attached to secondary (Anthropic) request', {
        endpoint: ragData.ragEndpoint,
        contextLength: ragData.ragContextLength
      });
    }
    const requestOptions = { ...options, ragInstructionBlock };

    for (let accountIndex = 0; accountIndex < apiKeys.length; accountIndex++) {
      const accountLabel = accountIndex === 0 ? 'primary_anthropic' : 'fallback_anthropic';
      logger.info('Processing text with secondary model', {
        activeSkill,
        textLength: text.length,
        textPreview: text.substring(0, 160),
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        isTranscriptionResponse: !!options.isTranscriptionResponse,
        accountLabel,
        accountIndex: accountIndex + 1,
        accountCount: apiKeys.length,
        requestId: this.requestCount
      });

      try {
        const userMessage = this.buildSecondaryTextUserMessage(text, activeSkill, requestOptions);
        let response = await this.executeSecondaryTextRequest(
          userMessage,
          activeSkill,
          programmingLanguage,
          apiKeys[accountIndex],
          requestOptions
        );
        response = this.normalizeSecondaryBehavioralResponse(response, text, activeSkill);

        logger.logPerformance('Secondary model processing', startTime, {
          activeSkill,
          textLength: text.length,
          responseLength: response.length,
          programmingLanguage: programmingLanguage || 'not specified',
          accountLabel,
          requestId: this.requestCount
        });

        return {
          response,
          metadata: {
            skill: activeSkill,
            programmingLanguage,
            processingTime: Date.now() - startTime,
            requestId: this.requestCount,
            usedFallback: false,
            isTranscriptionResponse: !!options.isTranscriptionResponse,
            secondaryModelUsed: true,
            secondaryModelType: normalizedSkill === 'programming' ? 'coding' : 'text',
            secondaryAccountIndex: accountIndex + 1,
            secondaryFallbackAccountUsed: accountIndex > 0,
            ragUsed: ragData.ragUsed,
            ragEndpoint: ragData.ragEndpoint,
            ragContextLength: ragData.ragContextLength
          }
        };
      } catch (error) {
        lastAccountError = error;
        const hasNextAccount = accountIndex < apiKeys.length - 1;
        logger.error('Secondary model processing failed', {
          error: error.message,
          activeSkill,
          programmingLanguage: programmingLanguage || 'not specified',
          accountLabel,
          retryingWithFallbackAccount: hasNextAccount,
          requestId: this.requestCount
        });

        if (!hasNextAccount) {
          this.errorCount++;
          throw error;
        }
      }
    }

    this.errorCount++;
    throw lastAccountError || new Error('Secondary text model failed for all configured Anthropic accounts.');
  }

  getSecondaryTextModelApiKeys() {
    const keys = [
      config.getApiKey('ANTHROPIC'),
      process.env.ANTHROPIC_FALLBACK_API_KEY,
      process.env.ANTHROPIC_SECONDARY_API_KEY
    ].filter((apiKey) => apiKey && apiKey !== 'your-api-key-here');

    return [...new Set(keys)];
  }

  hasSecondaryTextModel() {
    return this.getSecondaryTextModelApiKeys().length > 0;
  }

  async processTextWithSecondaryCodingFallback(text, activeSkill, sessionMemory, programmingLanguage, primaryError, startTime = Date.now()) {
    return this.processTextWithSecondaryTextFallback(text, activeSkill, sessionMemory, programmingLanguage, primaryError, startTime);
  }

  async processTextWithSecondaryTextFallback(text, activeSkill, sessionMemory, programmingLanguage, primaryError, startTime = Date.now(), options = {}) {
    logger.warn('Primary LLM quota/billing issue detected, falling back to secondary model', {
      activeSkill,
      primaryError: primaryError.message,
      transcriptLength: typeof text === 'string' ? text.length : 0,
      transcriptPreview: typeof text === 'string' ? text.substring(0, 160) : '',
      isTranscriptionResponse: !!options.isTranscriptionResponse
    });

    const fallbackResult = await this.processTextWithSecondaryTextModel(
      text,
      activeSkill,
      sessionMemory,
      programmingLanguage,
      options
    );

    fallbackResult.metadata = {
      ...fallbackResult.metadata,
      usedFallback: true,
      fallbackReason: 'primary_llm_billing_or_quota',
      primaryErrorMessage: primaryError.message,
      sourceTranscriptLength: typeof text === 'string' ? text.length : 0,
      sourceTranscriptPreview: typeof text === 'string' ? text.substring(0, 160) : '',
      processingTime: Date.now() - startTime,
      fallbackNotice: {
        message: 'Gemini se quedo sin saldo o cuota. Use el modelo secundario para generar esta respuesta.',
        topUpUrl: 'https://aistudio.google.com/app/billing',
        docsUrl: 'https://ai.google.dev/gemini-api/docs/billing'
      }
    };

    return fallbackResult;
  }

  async processProgrammingFinalization(text, programmingLanguage = null, imageBuffers = []) {
    const hasImages = Array.isArray(imageBuffers) && imageBuffers.some((buffer) => Buffer.isBuffer(buffer) && buffer.length > 0);

    if (!this.isInitialized) {
      if (hasImages) {
        throw new Error('No se puede finalizar con imagenes porque Gemini no esta disponible. Activa Gemini o usa captura con OCR.');
      }

      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (this.hasSecondaryTextModel()) {
        return this.processTextWithSecondaryCodingFallback(
          text,
          'programming',
          [],
          programmingLanguage,
          initError
        );
      }
      throw initError;
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing programming finalization with direct code prompt', {
        textLength: text.length,
        programmingLanguage: programmingLanguage || 'not specified',
        imageCount: Array.isArray(imageBuffers) ? imageBuffers.length : 0,
        requestId: this.requestCount
      });

      const imageParts = this.buildGeminiImageParts(imageBuffers);
      const userParts = [{ text }];
      if (imageParts.length > 0) {
        userParts.push(...imageParts);
      }

      const request = {
        systemInstruction: {
          parts: [{
            text: this.buildProgrammingFinalizationSystemInstruction(programmingLanguage)
          }]
        },
        contents: [{
          role: 'user',
          parts: userParts
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: this.getGeminiOutputTokenLimit('programming', 'finalization'),
          topK: 20,
          topP: 0.9
        }
      };

      let response;
      try {
        response = await this.executeRequest(request);
      } catch (error) {
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          response = await this.executeAlternativeRequest(request);
        } else {
          throw error;
        }
      }

      return {
        response,
        metadata: {
          skill: 'programming',
          programmingLanguage,
          imageCount: imageParts.length,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isFinalizationResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Programming finalization failed', {
        error: error.message,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.isPrimaryQuotaOrBillingError(error)) {
        if (hasImages) {
          throw new Error('Gemini no pudo procesar la finalizacion multimodal y el fallback no soporta imagenes. Reintenta con Gemini activo o usa OCR para enviar texto.');
        }

        return this.processTextWithSecondaryCodingFallback(
          text,
          'programming',
          [],
          programmingLanguage,
          error,
          startTime
        );
      }

      throw error;
    }
  }

  /**
   * Paso intermedio de /hoy: convierte el markdown crudo de Cerebro
   * ("dumping de cerebro", 50+ tickets sin estructurar) en el plan de
   * accion de 3 secciones que de verdad se muestra en el chat. Ruta
   * completamente aparte de processTextWithSkill/processTranscriptionWith*
   * (no hay un "activeSkill" real de por medio) para no arrastrar
   * behavioral RAG, session memory ni prompts de skill: el prompt de
   * sistema es fijo y completo, dado por el usuario.
   */
  async analyzeDumpingDeCerebro(dumpingText) {
    const systemInstruction = this.buildDumpingAnalysisSystemInstruction();

    if (!this.isInitialized) {
      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (this.hasSecondaryTextModel()) {
        return this.processTextWithSecondaryTextModel(dumpingText, 'dumping-analysis', [], null, {
          customSystemInstruction: systemInstruction
        });
      }
      throw initError;
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Analyzing dumping de cerebro (/hoy intermediate step)', {
        textLength: dumpingText.length,
        requestId: this.requestCount
      });

      const request = {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: dumpingText }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: this.getGeminiOutputTokenLimit(null, 'finalization'),
          topK: 20,
          topP: 0.9
        }
      };

      let response;
      try {
        response = await this.executeRequest(request);
      } catch (error) {
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          response = await this.executeAlternativeRequest(request);
        } else {
          throw error;
        }
      }

      return {
        response,
        metadata: {
          skill: 'dumping-analysis',
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Dumping de cerebro analysis failed', {
        error: error.message,
        requestId: this.requestCount
      });

      if (this.isPrimaryQuotaOrBillingError(error) && this.hasSecondaryTextModel()) {
        return this.processTextWithSecondaryTextModel(dumpingText, 'dumping-analysis', [], null, {
          customSystemInstruction: systemInstruction
        });
      }

      throw error;
    }
  }

  buildDumpingAnalysisSystemInstruction() {
    return `# Contexto y Objetivo

Actúas como un **Jefe de Proyecto Técnico (Technical Program Manager)** especializado en gestión de riesgos. Tu misión es transformar el "dumping de cerebro" que te voy a proporcionar en un **Plan de Acción Ejecutable**.

El problema actual es que el archivo contiene información no estructurada sobre 50+ tickets de Jira. No se puede usar para la gestión diaria porque es imposible identificar qué requiere atención inmediata. Tu tarea es filtrar, priorizar y estructurar la información para que sea útil para un equipo de desarrollo.

El objetivo final de tu análisis es responder a esta pregunta clave para el equipo: **"¿Qué tenemos que hacer HOY y esta SEMANA para desbloquear el proyecto?"**

---

## Instrucciones de Procesamiento

Sigue estas reglas estrictamente para procesar el archivo. Si encuentras información faltante o ambigua, **no la inventes**. En su lugar, crea una "Pregunta Abierta" para el equipo.

### Fase 1: Análisis y Filtrado (Input Processing)

1.  **Identifica los Bloqueadores Críticos:** Busca en el archivo los tickets que tienen el mayor impacto y dependencias. Estos son los que, si no se resuelven, detienen el progreso de otros equipos.
2.  **Ignora el Ruido:** Descarta los tickets marcados como "Cerrado" o "Separador de trabajo" a menos que se mencione explícitamente un riesgo de regresión (ej. "Bug ya cerrado: si la solución no fue validada...").
3.  **Extrae la Esencia de los Tickets Activos:** Para cada ticket activo ("En curso", "Por hacer", "Control de calidad"), extrae:
    *   **ID y Nombre:** (ej. AGE-137 Memoria extendida).
    *   **Propietario y Estado:** ¿Quién lo está haciendo y en qué fase está?
    *   **Riesgo Principal:** ¿Cuál es el riesgo más grave que bloquea a otros o al lanzamiento?
    *   **Dependencia Clave:** ¿De qué otro ticket depende? ¿Y quién lo bloquea a él?

### Fase 2: Síntesis y Priorización (Output Generation)

1.  **Crea un Tablero de "Acciones Inmediatas":** Genera una tabla priorizada con los tickets que requieren acción HOY (próximas 24-48 horas). La priorización debe ser: **Alto Impacto y Corto Plazo** (Quick Wins) vs. **Alto Impacto y Largo Plazo** (Riesgos Estratégicos).
2.  **Crea un Plan de "Desbloqueo Semanal":** Formula un plan de acción para desbloquear los tickets de la Fase 1. La salida debe ser tareas concretas.

### Fase 3: Generación de Preguntas (Actionable Intelligence)

Para todos los tickets donde la información era ambigua o faltaba (ej. "Owner sin asignar", "riesgo no listado en comentarios"), crea una lista de **Preguntas Pendientes** que el equipo debe resolver en la próxima reunión. **Este es tu entregable más importante para la reunión de mañana.**

---

## Formato de Salida Estricto

Genera tu respuesta EXACTAMENTE con la siguiente estructura de tres secciones. No añadas texto introductorio ni conclusión.

### SECCIÓN 1: EL TABLERO DE ACCIÓN INMEDIATA (Prioridad 1)

_Esta sección es para el equipo de desarrollo. Debe mostrar, de un vistazo, qué hacer hoy._

| Prioridad | ID y Nombre del Ticket | Propietario | Bloqueo / Riesgo Principal | **Acción Concreta para HOY** |
| :--- | :--- | :--- | :--- | :--- |
| **1 (Critico)** | **Ejemplo:** AGE-143 Orquestación | **Ejemplo:** Sandy Reyes | **Ejemplo:** Bloquea 8 features. No está avanzando. | **Ejemplo:** Realizar daily de 15 min con Sandy para revisar el mapeo de LangGraph. |
| **2** | [Ticket] | [Owner] | [Riesgo] | [Acción] |
| **...** | ... | ... | ... | ... |

### SECCIÓN 2: EL PLAN DE DESBLOQUEO SEMANAL (Prioridad 2)

_Esta sección es para el Jefe de Proyecto. Debe mostrar cómo resolver los problemas estructurales._

#### 1. Desbloquear la Dependencia "AGE-143" (El Nodo Crítico)
*   **Problema:** AGE-143 (Orquestación) bloquea a 8 features, incluyendo AGE-137 y AGE-146.
*   **Plan:**
    1.  **Sandy Reyes:** Dedicar 2 días completos a terminar el esqueleto del orquestador.
    2.  **David Alemán:** Proporcionar un mock del orquestador para que AGE-137 pueda avanzar en paralelo.
    3.  **Equipo:** Reunión de sincronización el viernes para validar la integración.

#### 2. Mitigar Riesgos de Bug Cerrados (AGE-275, AGE-276)
*   **Problema:** Bugs de flujos de procesos cerrados sin validación de regresión. Riesgo de que vuelvan a aparecer.
*   **Plan:**
    1.  **Greynner Moreno:** Crear un ticket técnico (AGE-XXX) para añadir tests automatizados de integración que cubran los escenarios de AGE-275 y AGE-276.

#### 3. Plan de Contingencia por "Guardrails" (AGE-146)
*   **Problema:** AGE-146 depende de AGE-143. Si AGE-143 se retrasa, no se puede implementar la seguridad anti-prompt-injection.
*   **Plan:**
    1.  Activar **Modo Estricto (Strict Mode)** en producción: desactivar la ejecución de herramientas hasta que AGE-146 esté listo.
    2.  Sandy Reyes continuar con el diseño de patrones de seguridad (regex) en paralelo a AGE-143.

### SECCIÓN 3: PREGUNTAS PENDIENTES PARA EL EQUIPO (Para la Daily de Mañana)

_Estas son las preguntas que, si no se responden, generarán más riesgos. Son tu principal herramienta para la reunión de mañana._

*   **¿Quién es el owner formal de AGE-143?** (El archivo menciona a Sandy Reyes, pero no está confirmado).
*   **¿Cuál es el "hueco en el mapeo" de LangGraph que menciona andresanta en AGE-143?** (No se puede avanzar sin saberlo).
*   **¿Cuál es el plan de retención de checkpoints para AGE-137?** ¿Se borran después de X días? (Impacta en el costo de RDS).
*   **¿Cómo se manejarán los secretos (API keys) para las herramientas de AGE-135?** (No está especificado en el archivo).
*   **¿Cuál es el objetivo de latencia para la recuperación RAG (AGE-134)?** (Debe cumplir con el SLA de respuesta).

Nota: los tickets/nombres de los ejemplos de arriba son ilustrativos del formato esperado, no datos reales — usa siempre los tickets, propietarios y riesgos que encuentres en el archivo real que se te entrega a continuacion como mensaje de usuario.`;
  }

  async processSkillFinalization(text, activeSkill, sessionMemory = [], programmingLanguage = null, imageBuffers = []) {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing skill finalization with active skill prompt', {
        activeSkill,
        textLength: text.length,
        programmingLanguage: programmingLanguage || 'not specified',
        imageCount: Array.isArray(imageBuffers) ? imageBuffers.length : 0,
        requestId: this.requestCount
      });

      const request = this.buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const lastUserContent = request.contents[request.contents.length - 1];

      if (!lastUserContent || !Array.isArray(lastUserContent.parts)) {
        throw new Error('Failed to build skill finalization request: missing user parts');
      }

      const imageParts = this.buildGeminiImageParts(imageBuffers);
      if (imageParts.length > 0) {
        lastUserContent.parts.push(...imageParts);
      }

      let response;
      try {
        response = await this.executeRequest(request);
      } catch (error) {
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          response = await this.executeAlternativeRequest(request);
        } else {
          throw error;
        }
      }

      return {
        response,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          imageCount: imageParts.length,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isFinalizationResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Skill finalization failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });
      throw error;
    }
  }

  async processImageWithSkill(imageBuffer, activeSkill, sessionMemory = [], programmingLanguage = null, promptText = 'Analiza la imagen adjunta y responde segun el modo activo.') {
    if (!this.isInitialized) {
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
    }

    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error('Invalid image buffer provided for multimodal processing');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing image with skill context', {
        activeSkill,
        imageBytes: imageBuffer.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const request = this.buildGeminiRequest(promptText, activeSkill, sessionMemory, programmingLanguage);
      const lastUserContent = request.contents[request.contents.length - 1];

      if (!lastUserContent || !Array.isArray(lastUserContent.parts)) {
        throw new Error('Failed to build multimodal request: missing user parts');
      }

      lastUserContent.parts.push(this.buildGeminiImagePart(imageBuffer));

      let response;
      try {
        response = await this.executeRequest(request);
      } catch (error) {
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          response = await this.executeAlternativeRequest(request);
        } else {
          throw error;
        }
      }

      return {
        response,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          imageCount: 1,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isImageResponse: true
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Multimodal image processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(promptText, activeSkill, error.message);
      }

      throw error;
    }
  }

  buildGeminiImageParts(imageBuffers = [], maxImages = 12) {
    if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
      return [];
    }

    const validBuffers = imageBuffers
      .filter((buffer) => Buffer.isBuffer(buffer) && buffer.length > 0)
      .slice(-maxImages);

    return validBuffers.map((buffer) => this.buildGeminiImagePart(buffer));
  }

  buildGeminiImagePart(imageBuffer) {
    return {
      inlineData: {
        mimeType: 'image/png',
        data: imageBuffer.toString('base64')
      }
    };
  }

  async processTranscriptionWithIntelligentResponse(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (this.shouldFallbackToSecondaryTextModel(initError)) {
        return this.processTextWithSecondaryTextFallback(
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          initError,
          Date.now(),
          { isTranscriptionResponse: true }
        );
      }
      throw initError;
    }

    if (this.isPrimaryQuotaExhausted() && this.hasSecondaryTextModel()) {
      return this.processTextWithSecondaryTextFallback(
        text,
        activeSkill,
        sessionMemory,
        programmingLanguage,
        new Error('Gemini quota cooldown active; skipping primary attempt.'),
        Date.now(),
        { isTranscriptionResponse: true }
      );
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing transcription with intelligent response', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.shouldUseRagFirst(activeSkill, text) && this.isBehavioralRagDebugRequest(text)) {
        const debugResult = await this.debugBehavioralRag(text);
        debugResult.metadata.processingTime = Date.now() - startTime;
        debugResult.metadata.requestId = this.requestCount;
        debugResult.metadata.programmingLanguage = programmingLanguage;
        debugResult.metadata.isTranscriptionResponse = true;
        return debugResult;
      }

      let geminiRequest = this.buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage);
      const ragMetadata = await this.enrichGeminiRequestWithBehavioralRag(geminiRequest, text, activeSkill);
      geminiRequest = ragMetadata.geminiRequest;

      if (this.shouldUseRagFirst(activeSkill, text) &&
          !ragMetadata.ragUsed &&
          this.normalizeSkillName(activeSkill) !== 'behavioral') {
        const response = this.buildNoRagEvidenceResponse(text);
        return {
          response,
          metadata: {
            skill: activeSkill,
            programmingLanguage,
            processingTime: Date.now() - startTime,
            requestId: this.requestCount,
            usedFallback: false,
            isTranscriptionResponse: true,
            ragUsed: false,
            ragEndpoint: ragMetadata?.ragEndpoint || null,
            ragContextLength: 0
          }
        };
      }
      
      // Try standard method first
      let response;
      try {
        response = await this.executeRequest(geminiRequest);
      } catch (error) {
        // If fetch failed, try alternative method
        if (error.message.includes('fetch failed') && config.get('llm.gemini.enableFallbackMethod')) {
          logger.warn('Standard request failed, trying alternative method', {
            error: error.message,
            requestId: this.requestCount
          });
          response = await this.executeAlternativeRequest(geminiRequest);
        } else {
          throw error;
        }
      }
      
      logger.logPerformance('LLM transcription processing', startTime, {
        activeSkill,
        textLength: text.length,
        responseLength: response.length,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      return {
        response,
        metadata: {
          skill: activeSkill,
          programmingLanguage,
          processingTime: Date.now() - startTime,
          requestId: this.requestCount,
          usedFallback: false,
          isTranscriptionResponse: true,
          ragUsed: ragMetadata?.ragUsed || false,
          ragEndpoint: ragMetadata?.ragEndpoint || null,
          ragContextLength: ragMetadata?.ragContextLength || 0
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('LLM transcription processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      if (this.shouldFallbackToSecondaryTextModel(error)) {
        this.markPrimaryQuotaExhausted(error);
        return this.processTextWithSecondaryTextFallback(
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          error,
          startTime,
          { isTranscriptionResponse: true }
        );
      }

      if (config.get('llm.gemini.fallbackEnabled')) {
        return this.generateIntelligentFallbackResponse(text, activeSkill, error.message);
      }
      
      throw error;
    }
  }

  buildGeminiRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(15);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to old method for compatibility - now with programming language support
    const requestComponents = promptLoader.getRequestComponents(
      activeSkill, 
      text, 
      sessionMemory,
      programmingLanguage
    );

    const request = {
      contents: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: this.getGeminiOutputTokenLimit(activeSkill),
        topK: 40,
        topP: 0.95
      }
    };

    // Use the skill prompt that already has programming language injected
    if (requestComponents.shouldUseModelMemory && requestComponents.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: requestComponents.skillPrompt }]
      };
      
      logger.debug('Using language-enhanced system instruction for skill', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: requestComponents.skillPrompt.length,
        requiresProgrammingLanguage: requestComponents.requiresProgrammingLanguage
      });
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatUserMessage(text, activeSkill) }]
    });

    return request;
  }

  buildGeminiRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: this.getGeminiOutputTokenLimit(activeSkill),
        topK: 40,
        topP: 0.95
      }
    };

    // Use the skill prompt from context (which may already include programming language)
    if (skillContext.skillPrompt) {
      request.systemInstruction = {
        parts: [{ text: skillContext.skillPrompt }]
      };
      
      logger.debug('Using skill context prompt as system instruction', {
        skill: activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        promptLength: skillContext.skillPrompt.length,
        requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false,
        hasLanguageInjection: programmingLanguage && skillContext.requiresProgrammingLanguage
      });
    }

    // Add conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .map(event => {
        const content = event.content.trim();
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      });

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Format and validate the current user input
    const formattedMessage = this.formatUserMessage(text, activeSkill);
    if (!formattedMessage || formattedMessage.trim().length === 0) {
      throw new Error('Failed to format user message or message is empty');
    }

    // Add the current user input
    request.contents.push({
      role: 'user',
      parts: [{ text: formattedMessage }]
    });

    logger.debug('Built Gemini request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSystemInstruction: !!request.systemInstruction,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  buildIntelligentTranscriptionRequest(text, activeSkill, sessionMemory, programmingLanguage) {
    // Validate input text first
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided to buildIntelligentTranscriptionRequest');
    }

    // Check if we have the new conversation history format
    const sessionManager = require('../managers/session.manager');
    
    if (sessionManager && typeof sessionManager.getConversationHistory === 'function') {
      const conversationHistory = sessionManager.getConversationHistory(10);
      const skillContext = sessionManager.getSkillContext(activeSkill, programmingLanguage);
      return this.buildIntelligentTranscriptionRequestWithHistory(cleanText, activeSkill, conversationHistory, skillContext, programmingLanguage);
    }

    // Fallback to basic intelligent request
    const request = {
      contents: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: this.getGeminiOutputTokenLimit(activeSkill, 'transcription'),
        topK: 40,
        topP: 0.95
      }
    };

    // Add intelligent filtering system instruction
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    if (!intelligentPrompt) {
      throw new Error('Failed to generate intelligent transcription prompt');
    }

    request.systemInstruction = {
      parts: [{ text: intelligentPrompt }]
    };

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatLiteralTranscription(cleanText) }]
    });

    logger.debug('Built basic intelligent transcription request', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      textLength: cleanText.length,
      hasSystemInstruction: !!request.systemInstruction
    });

    return request;
  }

  buildIntelligentTranscriptionRequestWithHistory(text, activeSkill, conversationHistory, skillContext, programmingLanguage) {
    const request = {
      contents: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: this.getGeminiOutputTokenLimit(activeSkill, 'transcription'),
        topK: 40,
        topP: 0.95
      }
    };

    // Build intelligent system instruction combining skill prompt and filtering rules
    const intelligentPrompt = this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage);
    let combinedInstruction = intelligentPrompt;
    
    // Use the skill prompt from context (which may already include programming language)
    if (skillContext.skillPrompt) {
      combinedInstruction = `${skillContext.skillPrompt}\n\n${intelligentPrompt}`;
    }

    request.systemInstruction = {
      parts: [{ text: combinedInstruction }]
    };

    // Add recent conversation history (excluding system messages) with validation
    const conversationContents = conversationHistory
      .filter(event => {
        // Filter out system messages and ensure content exists and is valid
        return event.role !== 'system' && 
               event.content && 
               typeof event.content === 'string' && 
               event.content.trim().length > 0;
      })
      .slice(-8) // Keep last 8 exchanges for context
      .map(event => {
        const content = event.content.trim();
        if (!content) {
          logger.warn('Empty content found in conversation history', { event });
          return null;
        }
        return {
          role: event.role === 'model' ? 'model' : 'user',
          parts: [{ text: content }]
        };
      })
      .filter(content => content !== null); // Remove any null entries

    // Add the conversation history
    request.contents.push(...conversationContents);

    // Validate and add the current transcription
    const cleanText = text && typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      throw new Error('Empty or invalid transcription text provided');
    }

    request.contents.push({
      role: 'user',
      parts: [{ text: this.formatLiteralTranscription(cleanText) }]
    });

    // Ensure we have at least one content item
    if (request.contents.length === 0) {
      throw new Error('No valid content to send to Gemini API');
    }

    logger.debug('Built intelligent transcription request with conversation history', {
      skill: activeSkill,
      programmingLanguage: programmingLanguage || 'not specified',
      historyLength: conversationHistory.length,
      totalContents: request.contents.length,
      hasSkillPrompt: !!skillContext.skillPrompt,
      cleanTextLength: cleanText.length,
      requiresProgrammingLanguage: skillContext.requiresProgrammingLanguage || false
    });

    return request;
  }

  getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage) {
    let prompt = `# Intelligent Transcription Response System

Assume you are asked a question in ${activeSkill.toUpperCase()} mode. Your job is to respond to the full transcript as the user's exact current request.
Assume you are in an interview and you need to perform best in ${activeSkill.toUpperCase()} mode.
Treat every word inside the transcript block as meaningful context. Do not summarize, compress, ignore, reinterpret, or replace the user's transcript before answering.`;

    // Add programming language context if provided
    if (programmingLanguage) {
      prompt += `\n\nCODING CONTEXT: When providing code examples or technical solutions, use ${programmingLanguage.toUpperCase()} as the primary programming language.`;
    }

    if (this.normalizeSkillName(activeSkill) === 'programming') {
      prompt += `

## Programming Mode Override:
- This transcript is an intermediate context chunk unless it is a finalization command.
- Finalization commands are handled outside this request, so if you are seeing this transcript here, do not generate code yet.
- Do not solve, analyze, summarize, suggest, or produce pseudocode for intermediate context chunks.
- Your entire response must be exactly:

RECIBIDO - Esperando siguiente parte`;

      return prompt;
    }

    if (this.normalizeSkillName(activeSkill) === 'behavioral') {
      prompt += `

## Behavioral Mode Live Interview Override:
- Always answer as the candidate in first person, as if speaking directly to the interviewer.
- Always produce a STAR-style answer: Situation, Task, Action, Result. It may be concise, but it must be a usable interview answer.
- Never ask for confirmation, never provide options, and never say the question seems technical or outside behavioral mode.
- If the transcript mentions technical work, tools, LLMs, systems, tests, VestaOS, coding, architecture, or development, convert it into a behavioral story about ownership, problem-solving, communication, collaboration, impact, or learning.
- Match the language of the transcript. Spanish question -> Spanish answer. English question -> English answer.
- If the transcript is partial or speech-to-text is clipped, answer the most likely behavioral question from the available words and briefly weave the uncertainty into the setup, without asking the user to repeat it.
- Do not provide coaching commentary. Output only the answer I can say in the interview.`;

      return prompt;
    }

    prompt += `

## Response Rules:

### If the transcription is casual conversation, greetings, or NOT related to ${activeSkill}:
- Briefly acknowledge it and mention that you are ready for a ${activeSkill} question.

### If the transcription IS relevant to ${activeSkill} or is a follow-up question:
- Base your answer on the complete literal transcript block
- Provide a comprehensive, detailed response
- Use bullet points, examples, and explanations
- Focus on actionable insights and complete answers
- Do not truncate or shorten your response
- If the transcript appears incomplete or speech-to-text looks wrong, say what seems missing instead of pretending the request was shorter

### Examples of casual/irrelevant messages:
- "Hello", "Hi there", "How are you?"
- "What's the weather like?"
- "I'm just testing this"
- Random conversations not related to ${activeSkill}

### Examples of relevant messages:
- Actual questions about ${activeSkill} concepts
- Follow-up questions to previous responses
- Requests for clarification on ${activeSkill} topics
- Problem-solving requests related to ${activeSkill}

## Response Format:
- Keep responses detailed
- Use bullet points for structured answers
- Be encouraging and helpful
- Stay focused on ${activeSkill}

Remember: the transcript block is the source of truth for the user's current request.`;

    return prompt;
  }

  formatLiteralTranscription(text) {
    return `Use the following literal speech-to-text transcript as the user's complete current request. Do not summarize it before answering.\n\nTRANSCRIPT:\n\"\"\"\n${text}\n\"\"\"`;
  }

  formatUserMessage(text, activeSkill) {
    return `Context: ${activeSkill.toUpperCase()} analysis request\n\nText to analyze:\n${text}`;
  }

  normalizeSkillName(skill) {
    return String(skill || '').trim().toLowerCase();
  }

  getGeminiOutputTokenLimit(activeSkill, mode = 'default') {
    if (mode === 'finalization') {
      return config.get('llm.gemini.finalizationMaxOutputTokens') ||
        config.get('llm.gemini.codingMaxOutputTokens') ||
        config.get('llm.gemini.maxOutputTokens') ||
        8192;
    }

    if (this.normalizeSkillName(activeSkill) === 'programming') {
      return config.get('llm.gemini.codingMaxOutputTokens') ||
        config.get('llm.gemini.maxOutputTokens') ||
        8192;
    }

    return config.get('llm.gemini.maxOutputTokens') || 8192;
  }

  shouldFallbackToSecondaryCodingModel(error, activeSkill) {
    return this.normalizeSkillName(activeSkill) === 'programming' &&
      this.isPrimaryQuotaOrBillingError(error) &&
      this.hasSecondaryTextModel();
  }

  shouldFallbackToSecondaryTextModel(error) {
    return this.hasSecondaryTextModel() &&
      (this.isPrimaryQuotaOrBillingError(error) || this.isPrimaryAvailabilityError(error));
  }

  isPrimaryAvailabilityError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('llm service not initialized') ||
      message.includes('gemini') ||
      message.includes('fetch failed') ||
      message.includes('request timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('empty response');
  }

  markPrimaryQuotaExhausted(error) {
    if (!this.isPrimaryQuotaOrBillingError(error)) return;

    const cooldownMs = config.get('llm.gemini.quotaCooldownMs') || 10 * 60 * 1000;
    this.primaryQuotaExhaustedUntil = Date.now() + cooldownMs;
    logger.warn('Gemini marked as quota-exhausted; skipping it for subsequent calls during cooldown', {
      cooldownMs,
      resumesAt: new Date(this.primaryQuotaExhaustedUntil).toISOString()
    });
  }

  isPrimaryQuotaExhausted() {
    return this.primaryQuotaExhaustedUntil > Date.now();
  }

  isPrimaryQuotaOrBillingError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('quota') ||
      message.includes('billing') ||
      message.includes('billable') ||
      message.includes('credit') ||
      message.includes('balance') ||
      message.includes('insufficient') ||
      message.includes('payment') ||
      message.includes('resource_exhausted') ||
      message.includes('429') ||
      message.includes('403');
  }

  buildSecondaryCodingSystemInstruction(activeSkill, programmingLanguage) {
    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
    const language = programmingLanguage || 'the requested language';

    return `${skillPrompt}

## Secondary Coding Fallback Rules
- You are receiving a full accumulated coding context, including the original problem, prior code, screenshots/OCR text, and failed cases.
- Produce only the corrected final program in ${language}.
- Do not mention the provider, model, fallback, hidden context, screenshots, OCR, or your reasoning.
- Do not return pseudocode, placeholders, TODOs, markdown wrappers, explanations, comments, docstrings, or complexity analysis.
- If a platform-specific class/function signature is present, preserve it exactly.
- If the accumulated context contains code snippets, use the most relevant/recent snippet as the base implementation. Preserve compatible signatures, classes, imports, names, and structure, then complete or correct that code instead of starting from scratch without need.
- Optimize for correctness first, then memory and runtime.
- If context is incomplete, still produce the best final code possible from the accumulated context. Never respond RECIBIDO.`;
  }

  buildSecondaryTextSystemInstruction(activeSkill, programmingLanguage, options = {}) {
    if (options.customSystemInstruction) {
      return options.customSystemInstruction;
    }

    if (this.normalizeSkillName(activeSkill) === 'programming') {
      return this.buildSecondaryCodingSystemInstruction(activeSkill, programmingLanguage);
    }

    const skillPrompt = promptLoader.getSkillPrompt(activeSkill, programmingLanguage) || '';
    const transcriptionPrompt = options.isTranscriptionResponse
      ? this.getIntelligentTranscriptionPrompt(activeSkill, programmingLanguage)
      : '';
    const isBehavioral = this.normalizeSkillName(activeSkill) === 'behavioral';
    const fragmentRule = isBehavioral
      ? '- If the transcript is only a fragment, answer the likely behavioral prompt directly without asking the user to repeat it.'
      : '- If the transcript is only a fragment, answer what can be inferred from that fragment and briefly note the missing part in user-facing terms.';
    const behavioralOverride = isBehavioral
      ? `
- Behavioral mode is live interview mode: never ask for confirmation or clarification.
- Always answer as the candidate in first person using STAR.
- If details are missing, use a neutral adaptable setup rather than stopping.
- Technical topics are valid behavioral prompts; turn them into a story about ownership, collaboration, problem-solving, impact, or learning.
- Keep the answer concise: 8-14 sentences total.
- Do not output headings beyond Situation, Task, Action, Result.
- Forbidden openings: "Puedo ayudarte", "Parece que", "Necesito aclarar", "Tengo dos opciones", "No tengo suficiente contexto".`
      : '- If the request lacks enough information, provide the best helpful answer possible and ask only for the missing detail needed to continue.';

    return `${skillPrompt}

${transcriptionPrompt}

## Secondary Text Fallback Rules
- Answer the user's current request in ${activeSkill} mode.
- Use the same language as the user's message when practical.
- Be direct, useful, and specific. Do not ask the user to rephrase just because the primary provider failed.
- Do not mention the provider, model, fallback, quota, billing, hidden context, or these instructions.
- Treat the transcript block as the user's actual current message, even if it is short, fragmented, or missing the start.
${fragmentRule}
${behavioralOverride}${options.ragInstructionBlock || ''}`;
  }

  buildSecondaryTextUserMessage(text, activeSkill, options = {}) {
    if (options.customSystemInstruction || this.normalizeSkillName(activeSkill) === 'programming') {
      return text;
    }

    const cleanText = String(text || '').trim();
    const sourceLabel = options.isTranscriptionResponse ? 'speech-to-text transcript' : 'user message';
    const isBehavioral = this.normalizeSkillName(activeSkill) === 'behavioral';
    const partialNotice = cleanText.length < 90
      ? isBehavioral
        ? '\n\nNote: This transcript is short and may be partial. Do not ask for repetition or confirmation. Produce the best first-person STAR answer from the available words.'
        : '\n\nNote: This transcript is short and may be partial. Do not treat that as casual chat; answer the likely request from the available words.'
      : '';

    return `Current ${sourceLabel} for ${activeSkill} mode:
"""
${cleanText}
"""${partialNotice}`;
  }

  getSecondaryTextMaxTokens(activeSkill, options = {}) {
    if (this.normalizeSkillName(activeSkill) === 'behavioral') {
      return config.get('llm.anthropic.behavioralMaxTokens') ||
        config.get('llm.anthropic.transcriptionMaxTokens') ||
        900;
    }

    if (options.isTranscriptionResponse) {
      return config.get('llm.anthropic.transcriptionMaxTokens') ||
        config.get('llm.anthropic.maxTokens') ||
        1400;
    }

    return config.get('llm.anthropic.maxTokens') || 8192;
  }

  normalizeSecondaryBehavioralResponse(response, sourceText, activeSkill) {
    if (this.normalizeSkillName(activeSkill) !== 'behavioral') {
      return response;
    }

    const text = String(response || '').trim();
    const lower = text.toLowerCase();
    const unhelpfulPatterns = [
      'necesito aclarar',
      'tengo dos opciones',
      'para poder ayudarte',
      'parece que',
      'no tengo suficiente contexto',
      'i need to clarify',
      'i have two options',
      'to better help',
      'it seems like',
      'not enough context'
    ];

    if (text && !unhelpfulPatterns.some((pattern) => lower.includes(pattern))) {
      return text;
    }

    const transcript = String(sourceText || '').trim();
    const isSpanish = /[áéíóúñ¿¡]|\b(que|como|cuando|donde|por qué|puedes|cuéntame|háblame|necesito)\b/i.test(transcript);

    if (isSpanish) {
      return `Situation: En un proyecto reciente, me encontré con una necesidad clara: convertir un reto técnico en una mejora visible para el usuario y para el equipo.

Task: Mi responsabilidad fue tomar ownership, entender el problema de fondo y asegurar que la solución no solo funcionara, sino que fuera confiable y fácil de mantener.

Action: Primero acoté el problema con la información disponible y prioricé lo que tenía mayor impacto. Después coordiné los cambios necesarios, validé los casos críticos y mantuve comunicación clara con las personas involucradas para evitar sorpresas. Cuando faltaba contexto, avancé con una hipótesis razonable, la probé rápido y ajusté con evidencia.

Result: El resultado fue una solución más estable y una mejor forma de trabajar: menos ambigüedad, mejor calidad y más confianza para iterar. Lo que me llevé fue que, incluso en problemas técnicos, el valor real está en combinar criterio, comunicación y ejecución disciplinada.`;
    }

    return `Situation: In a recent project, I had to turn an ambiguous technical challenge into something reliable and useful for the team and the end user.

Task: My responsibility was to take ownership, understand the real problem, and make sure the solution was not only working, but maintainable and easy to validate.

Action: I started by narrowing the scope and identifying the highest-impact failure points. Then I coordinated the changes, tested the critical paths, and kept communication clear so the team could move without surprises. When some context was missing, I made a reasonable assumption, validated it quickly, and adjusted based on evidence.

Result: The outcome was a more stable solution and a better execution pattern for the team: less ambiguity, stronger quality, and more confidence in future iterations. It reinforced for me that technical work becomes valuable when it is paired with ownership, communication, and disciplined follow-through.`;
  }

  buildProgrammingFinalizationSystemInstruction(programmingLanguage) {
    const language = programmingLanguage || 'the requested language';

    return `Actua como un arquitecto de software y desarrollador experto.

El usuario ya termino de enviar contexto y acaba de ejecutar el comando final !!!.
Debes generar ahora la solucion final en ${language}.

Reglas estrictas:
- Entrega solamente codigo real, completo y ejecutable o pegable en la plataforma solicitada.
- No respondas RECIBIDO.
- No esperes mas contexto.
- No expliques, no resumas, no agregues markdown, no agregues comentarios al codigo, no uses docstrings narrativos.
- No entregues pseudocodigo, TODOs, placeholders, pass, ... ni fragmentos incompletos.
- Si existe una firma/clase requerida por la plataforma, respetala exactamente.
- Usa todo el contexto acumulado: problema original, imagenes/OCR, reglas, codigo previo y casos fallidos.
- Si el contexto incluye fragmentos de codigo, usalos como base principal: conserva firmas, clases, imports, nombres y estructura compatibles, y completa o corrige sobre ese codigo en lugar de reemplazarlo desde cero sin necesidad.
- Si hay varios fragmentos, toma como base el mas reciente o el que corresponda a los casos fallidos.
- Si hay casos fallidos, corrige el codigo anterior conservando el problema original.
- Prioriza correctness; despues optimiza memoria y tiempo.
- Si el contexto esta incompleto, aun asi genera el mejor codigo final posible con lo disponible. Nunca respondas RECIBIDO.`;
  }

  async executeSecondaryCodingRequest(text, activeSkill, programmingLanguage, apiKey) {
    return this.executeSecondaryTextRequest(text, activeSkill, programmingLanguage, apiKey);
  }

  async executeSecondaryTextRequest(text, activeSkill, programmingLanguage, apiKey, fallbackOptions = {}) {
    const maxRetries = config.get('llm.anthropic.maxRetries') || 3;
    const maxTokens = this.getSecondaryTextMaxTokens(activeSkill, fallbackOptions);
    const postData = JSON.stringify({
      model: config.get('llm.anthropic.model'),
      max_tokens: maxTokens,
      temperature: 0,
      system: this.buildSecondaryTextSystemInstruction(activeSkill, programmingLanguage, fallbackOptions),
      messages: [
        {
          role: 'user',
          content: text
        }
      ]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': this.getUserAgent()
      },
      timeout: config.get('llm.anthropic.timeout')
    };

    let lastError = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeSecondaryCodingHttpRequest(options, postData);
      } catch (error) {
        lastError = error;
        const shouldRetry = this.isRetryableSecondaryCodingError(error) &&
          !this.isNonRetryableSecondaryAccountError(error) &&
          attempt < maxRetries;

        logger.warn('Secondary text request attempt failed', {
          attempt,
          maxRetries,
          maxTokens,
          retrying: shouldRetry,
          error: error.message
        });

        if (!shouldRetry) {
          throw error;
        }

        await this.sleep(1000 * attempt);
      }
    }

    throw lastError;
  }

  executeSecondaryCodingHttpRequest(options, postData) {
    const https = require('https');

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              const apiError = new Error(this.formatSecondaryCodingApiError(res.statusCode, data));
              apiError.statusCode = res.statusCode;
              apiError.apiErrorType = this.getSecondaryCodingApiErrorType(data);
              reject(apiError);
              return;
            }

            const response = JSON.parse(data);
            const textBlocks = Array.isArray(response.content)
              ? response.content
                  .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
                  .map((block) => block.text)
              : [];

            const responseText = textBlocks.join('\n').trim();
            if (!responseText) {
              reject(new Error('Secondary text request returned empty content'));
              return;
            }

            resolve(responseText);
          } catch (error) {
            reject(new Error(`Failed to parse secondary text response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Secondary text request error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Secondary text request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  isRetryableSecondaryCodingError(error) {
    const message = (error.message || '').toLowerCase();
    return (
      error.statusCode === 529 ||
      error.statusCode === 500 ||
      error.statusCode === 502 ||
      error.statusCode === 503 ||
      error.statusCode === 504 ||
      error.apiErrorType === 'overloaded_error' ||
      message.includes('overloaded') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    );
  }

  isNonRetryableSecondaryAccountError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error.statusCode === 400 ||
      error.statusCode === 401 ||
      error.statusCode === 403 ||
      error.statusCode === 404 ||
      error.statusCode === 429 ||
      message.includes('invalid api key') ||
      message.includes('authentication') ||
      message.includes('permission') ||
      message.includes('credit balance') ||
      message.includes('billing') ||
      message.includes('quota') ||
      message.includes('rate limit');
  }

  getSecondaryCodingApiErrorType(rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      return parsed.error?.type || null;
    } catch {
      return null;
    }
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  formatSecondaryCodingApiError(statusCode, rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      const error = parsed.error || {};
      const type = error.type ? ` ${error.type}` : '';
      const message = error.message ? `: ${error.message}` : '';
      return `Secondary text request failed with HTTP ${statusCode}${type}${message}`;
    } catch {
      return `Secondary text request failed with HTTP ${statusCode}`;
    }
  }

  async executeRequest(geminiRequest) {
    const maxRetries = config.get('llm.gemini.maxRetries');
    const timeout = config.get('llm.gemini.timeout');
    
    // Add request debugging
    logger.debug('Executing Gemini request', {
      hasModel: !!this.model,
      hasClient: !!this.client,
      requestKeys: Object.keys(geminiRequest),
      timeout,
      maxRetries,
      nodeVersion: process.version,
      platform: process.platform
    });
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Pre-flight check
        await this.performPreflightCheck();
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        );
        
        logger.debug(`Gemini API attempt ${attempt} starting`, {
          timestamp: new Date().toISOString(),
          timeout
        });
        
        const requestPromise = this.model.generateContent(geminiRequest);
        const result = await Promise.race([requestPromise, timeoutPromise]);
        
        if (!result.response) {
          throw new Error('Empty response from Gemini API');
        }

        const candidate = result.response.candidates?.[0];
        if (candidate?.finishReason === 'MAX_TOKENS') {
          logger.warn('Gemini response reached max output token limit', {
            attempt,
            maxOutputTokens: geminiRequest.generationConfig?.maxOutputTokens
          });
        }

        const responseText = result.response.text();
        
        if (!responseText || responseText.trim().length === 0) {
          throw new Error('Empty text content in Gemini response');
        }

        logger.debug('Gemini API request successful', {
          attempt,
          responseLength: responseText.length
        });

        return responseText.trim();
      } catch (error) {
        const errorInfo = this.analyzeError(error);
        
        // Enhanced error logging for fetch failures
        if (errorInfo.type === 'NETWORK_ERROR') {
          logger.error('Network error details', {
            attempt,
            errorMessage: error.message,
            errorStack: error.stack,
            errorName: error.name,
            nodeEnv: process.env.NODE_ENV,
            electronVersion: process.versions.electron,
            chromeVersion: process.versions.chrome,
            nodeVersion: process.versions.node,
            userAgent: this.getUserAgent()
          });
        }
        
        logger.warn(`Gemini API attempt ${attempt} failed`, {
          error: error.message,
          errorType: errorInfo.type,
          isNetworkError: errorInfo.isNetworkError,
          suggestedAction: errorInfo.suggestedAction,
          remainingAttempts: maxRetries - attempt
        });

        if (this.isPrimaryQuotaOrBillingError(error)) {
          const finalError = new Error(`Gemini API failed after ${attempt} attempt${attempt === 1 ? '' : 's'}: ${error.message}`);
          finalError.errorAnalysis = errorInfo;
          finalError.originalError = error;
          finalError.nonRetryable = true;
          logger.warn('Gemini quota/billing error is non-retryable; falling back immediately', {
            attempt,
            maxRetries,
            error: error.message
          });
          throw finalError;
        }

        if (attempt === maxRetries) {
          const finalError = new Error(`Gemini API failed after ${maxRetries} attempts: ${error.message}`);
          finalError.errorAnalysis = errorInfo;
          finalError.originalError = error;
          throw finalError;
        }

        // Use exponential backoff with jitter for network errors
        const baseDelay = errorInfo.isNetworkError ? 2000 : 1000;
        const delay = baseDelay * attempt + Math.random() * 1000;
        
        logger.debug(`Waiting ${delay}ms before retry ${attempt + 1}`, {
          baseDelay,
          isNetworkError: errorInfo.isNetworkError
        });
        
        await this.delay(delay);
      }
    }
  }

  async performPreflightCheck() {
    // Quick connectivity check
    try {
      const startTime = Date.now();
      await this.testNetworkConnection({ 
        host: 'generativelanguage.googleapis.com', 
        port: 443, 
        name: 'Gemini API Endpoint' 
      });
      const latency = Date.now() - startTime;
      
      logger.debug('Preflight check passed', { latency });
    } catch (error) {
      logger.warn('Preflight check failed', { 
        error: error.message,
        suggestion: 'Network connectivity issue detected before API call'
      });
      // Don't throw here - let the actual API call fail with more detail
    }
  }

  getUserAgent() {
    try {
      // Try to get user agent from Electron if available
      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
      }
      return `Node.js/${process.version} (${process.platform}; ${process.arch})`;
    } catch {
      return 'Unknown';
    }
  }

  analyzeError(error) {
    const errorMessage = error.message.toLowerCase();
    
    // Network connectivity errors
    if (errorMessage.includes('fetch failed') || 
        errorMessage.includes('network error') ||
        errorMessage.includes('enotfound') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('timeout')) {
      return {
        type: 'NETWORK_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check internet connection and firewall settings'
      };
    }
    
    // API key errors
    if (errorMessage.includes('unauthorized') || 
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('forbidden')) {
      return {
        type: 'AUTH_ERROR',
        isNetworkError: false,
        suggestedAction: 'Verify Gemini API key configuration'
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('quota') || 
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests')) {
      return {
        type: 'RATE_LIMIT_ERROR',
        isNetworkError: false,
        suggestedAction: 'Wait before retrying or check API quota'
      };
    }
    
    // Timeout errors
    if (errorMessage.includes('request timeout')) {
      return {
        type: 'TIMEOUT_ERROR',
        isNetworkError: true,
        suggestedAction: 'Check network latency or increase timeout'
      };
    }
    
    return {
      type: 'UNKNOWN_ERROR',
      isNetworkError: false,
      suggestedAction: 'Check logs for more details'
    };
  }

  async checkNetworkConnectivity() {
    const connectivityTests = [
      { host: 'google.com', port: 443, name: 'Google (HTTPS)' },
      { host: 'generativelanguage.googleapis.com', port: 443, name: 'Gemini API Endpoint' }
    ];

    const results = await Promise.allSettled(
      connectivityTests.map(test => this.testNetworkConnection(test))
    );

    const connectivity = {
      timestamp: new Date().toISOString(),
      tests: results.map((result, index) => ({
        ...connectivityTests[index],
        success: result.status === 'fulfilled' && result.value,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    };

    logger.info('Network connectivity check completed', connectivity);
    return connectivity;
  }

  async testNetworkConnection({ host, port, name }) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection timeout to ${host}:${port}`));
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed to ${host}:${port}: ${error.message}`));
      });

      socket.connect(port, host);
    });
  }

  generateFallbackResponse(text, activeSkill) {
    logger.info('Generating fallback response', { activeSkill });

    const fallbackResponses = {
      'dsa': 'This appears to be a data structures and algorithms problem. Consider breaking it down into smaller components and identifying the appropriate algorithm or data structure to use.',
      'system-design': 'For this system design question, consider scalability, reliability, and the trade-offs between different architectural approaches.',
      'programming': 'This looks like a programming challenge. Focus on understanding the requirements, edge cases, and optimal time/space complexity.',
      'default': 'I can help analyze this content. Please ensure your Gemini API key is properly configured for detailed analysis.'
    };

    const response = fallbackResponses[activeSkill] || fallbackResponses.default;
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true
      }
    };
  }

  generateIntelligentFallbackResponse(text, activeSkill, fallbackReason = null) {
    logger.info('Generating intelligent fallback response for transcription', { activeSkill });

    // Simple heuristic to determine if message seems skill-related
    const skillKeywords = {
      'dsa': ['algorithm', 'data structure', 'array', 'tree', 'graph', 'sort', 'search', 'complexity', 'big o'],
      'programming': ['code', 'function', 'variable', 'class', 'method', 'bug', 'debug', 'syntax'],
      'system-design': ['scalability', 'database', 'architecture', 'microservice', 'load balancer', 'cache'],
      'behavioral': ['interview', 'experience', 'situation', 'leadership', 'conflict', 'team'],
      'sales': ['customer', 'deal', 'negotiation', 'price', 'revenue', 'prospect'],
      'presentation': ['slide', 'audience', 'public speaking', 'presentation', 'nervous'],
      'data-science': ['data', 'model', 'machine learning', 'statistics', 'analytics', 'python', 'pandas'],
      'devops': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'infrastructure', 'monitoring'],
      'negotiation': ['negotiate', 'compromise', 'agreement', 'terms', 'conflict resolution']
    };

    const textLower = text.toLowerCase();
    const relevantKeywords = skillKeywords[activeSkill] || [];
    const hasRelevantKeywords = relevantKeywords.some(keyword => textLower.includes(keyword));
    
    // Check for question indicators
    const questionIndicators = ['how', 'what', 'why', 'when', 'where', 'can you', 'could you', 'should i', '?'];
    const seemsLikeQuestion = questionIndicators.some(indicator => textLower.includes(indicator));

    let response;
    if (hasRelevantKeywords || seemsLikeQuestion) {
      response = `I'm having trouble processing that right now, but it sounds like a ${activeSkill} question. Could you rephrase or ask more specifically about what you need help with?`;
    } else {
      response = `Yeah, I'm listening. Ask your question relevant to ${activeSkill}.`;
    }
    
    return {
      response,
      metadata: {
        skill: activeSkill,
        processingTime: 0,
        requestId: this.requestCount,
        usedFallback: true,
        isTranscriptionResponse: true,
        fallbackReason
      }
    };
  }

  async testConnection() {
    if (!this.isInitialized) {
      return { success: false, error: 'Service not initialized' };
    }

    try {
      // First check network connectivity
      const networkCheck = await this.checkNetworkConnectivity();
      const hasNetworkIssues = networkCheck.tests.some(test => !test.success);
      
      if (hasNetworkIssues) {
        logger.warn('Network connectivity issues detected', networkCheck);
      }

      const testRequest = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Test connection. Please respond with "OK".' }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10
        }
      };

      const startTime = Date.now();
      const result = await this.model.generateContent(testRequest);
      const latency = Date.now() - startTime;
      const response = result.response.text();
      
      logger.info('Connection test successful', { 
        response, 
        latency,
        networkCheck: hasNetworkIssues ? 'issues_detected' : 'healthy'
      });
      
      return { 
        success: true, 
        response: response.trim(),
        latency,
        networkConnectivity: networkCheck
      };
    } catch (error) {
      const errorAnalysis = this.analyzeError(error);
      logger.error('Connection test failed', { 
        error: error.message,
        errorAnalysis
      });
      
      return { 
        success: false, 
        error: error.message,
        errorAnalysis,
        networkConnectivity: await this.checkNetworkConnectivity().catch(() => null)
      };
    }
  }

  updateApiKey(newApiKey) {
    process.env.GEMINI_API_KEY = newApiKey;
    this.isInitialized = false;
    this.initializeClient();
    
    logger.info('API key updated and client reinitialized');
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount) / this.requestCount) * 100 : 0,
      config: config.get('llm.gemini')
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async executeAlternativeRequest(geminiRequest) {
    const https = require('https');
    const apiKey = config.getApiKey('GEMINI');
    const model = config.get('llm.gemini.model');
    
    logger.info('Using alternative HTTPS request method');
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    const postData = JSON.stringify(geminiRequest);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': this.getUserAgent()
      },
      timeout: config.get('llm.gemini.timeout')
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            const response = JSON.parse(data);
            
            if (!response.candidates || !response.candidates[0] || !response.candidates[0].content) {
              reject(new Error('Invalid response structure from Gemini API'));
              return;
            }
            
            const candidate = response.candidates[0];
            if (candidate.finishReason === 'MAX_TOKENS') {
              logger.warn('Alternative Gemini response reached max output token limit', {
                maxOutputTokens: geminiRequest.generationConfig?.maxOutputTokens
              });
            }

            const text = Array.isArray(candidate.content.parts)
              ? candidate.content.parts
                  .filter((part) => part && typeof part.text === 'string')
                  .map((part) => part.text)
                  .join('\n')
              : '';
            
            if (!text || text.trim().length === 0) {
              reject(new Error('Empty text content in Gemini response'));
              return;
            }
            
            logger.info('Alternative request successful', {
              responseLength: text.length,
              statusCode: res.statusCode
            });
            
            resolve(text.trim());
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new Error(`Alternative request failed: ${error.message}`));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Alternative request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }
}

module.exports = new LLMService();
