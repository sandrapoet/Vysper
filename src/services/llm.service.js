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
    return process.env.VYSPER_RAG_ENV_FILE || '/media/san/Miscosas6/Desarrollo/MiRag/LightRAG/.env';
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
    const isCompensationQuestion = this.isCompensationQuestion(text);
    return skillName === 'behavioral' ||
      (skillName === 'negotiation' && isCompensationQuestion) ||
      isCompensationQuestion;
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
    return /\b(salary|compensation|pay|gross|net|annual|annually|monthly|month|yearly|expectation|expected|desired|benefits|working conditions|sueldo|salario|compensaci[oó]n|bruto|neto|mensual|anual|prestaciones|beneficios)\b/i.test(normalized);
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

  async enrichGeminiRequestWithBehavioralRag(geminiRequest, userQuestion, activeSkill) {
    if (!this.shouldUseRagFirst(activeSkill, userQuestion)) {
      return { geminiRequest, ragUsed: false, ragEndpoint: null, ragContextLength: 0 };
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

    const compensationRules = this.isCompensationQuestion(userQuestion)
      ? `\n\n# Mandatory Compensation Grounding Rules\nFor salary, benefits, or working-condition questions:\n- Use ONLY current compensation target evidence from Retrieved Behavioral RAG Context, especially category: compensation_target and time_scope: current.\n- Ignore compensation_history for setting expectations unless the user explicitly asks for history.\n- Confirm currency, gross/net, period, modality, and location when available.\n- If the retrieved target is monthly and the interviewer asks for desired annual salary, annualize by multiplying the monthly gross range by 12. State that conversion clearly.\n- Use ranges when range_min and range_max are available. Do not collapse a range into a single fixed number unless the user explicitly asks.\n- Do NOT infer salary expectations from resume HTML, role seniority, market averages, or generic salary data.`
      : '';

    const profileGroundingRules = `\n\n# Mandatory Profile Grounding Rules\nFor behavioral interview answers about the user's specific profile, resume, past roles, companies, projects, metrics, agentic coding experience, achievements, or career history:\n- Use ONLY facts present in the Retrieved Behavioral RAG Context and the user's current transcript.\n- Treat Retrieved Behavioral RAG Context as raw source evidence, not as a draft to embellish. Preserve company names, job titles, dates, project names, and metrics exactly as stated.\n- Do NOT invent job titles, employers, dates, seniority, teams, products, metrics, credentials, or projects.\n- If the retrieved context does not contain enough evidence, say so briefly and ask for the missing detail or offer a generic answer template without personal claims.\n- You may provide general behavioral interview structure, but label it as a generic template when it is not grounded in retrieved profile context.\n- Never include shell commands, curl commands, environment variable snippets, or RAG diagnostics in behavioral answers unless the user explicitly asks for debugging help.${compensationRules}`;

    const ragInstruction = ragContext
      ? `\n\n# Retrieved Behavioral RAG Context\nUse this retrieved context first when crafting the behavioral interview answer. Prefer these facts over generic examples. Do not invent facts beyond the transcript and retrieved context.\n\n${ragContext}`
      : `\n\n# Retrieved Behavioral RAG Context\nNo usable profile context was retrieved from RAG for this question. For any profile-specific answer, explicitly say that no matching profile evidence was found in RAG and avoid personal claims.`;

    const fullRagInstruction = `${profileGroundingRules}${ragInstruction}`;

    if (geminiRequest.systemInstruction?.parts?.[0]?.text) {
      geminiRequest.systemInstruction.parts[0].text = `${geminiRequest.systemInstruction.parts[0].text}${fullRagInstruction}`;
    } else {
      geminiRequest.systemInstruction = {
        parts: [{ text: `# Behavioral Interview Helper Agent${fullRagInstruction}` }]
      };
    }

    if (!ragContext) {
      logger.warn('Behavioral RAG returned no usable context; profile-specific claims are disabled', {
        endpoint: ragResult.endpoint
      });
      return { geminiRequest, ragUsed: false, ragEndpoint: ragResult.endpoint, ragContextLength: 0 };
    }

    logger.info('Behavioral RAG context attached to Gemini request', {
      endpoint: ragResult.endpoint,
      contextLength: ragContext.length
    });

    return {
      geminiRequest,
      ragUsed: true,
      ragEndpoint: ragResult.endpoint,
      ragContextLength: ragContext.length
    };
  }

  async processTextWithSkill(text, activeSkill, sessionMemory = [], programmingLanguage = null) {
    if (!this.isInitialized) {
      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (this.shouldFallbackToSecondaryCodingModel(initError, activeSkill)) {
        return this.processTextWithSecondaryCodingFallback(
          text,
          activeSkill,
          sessionMemory,
          programmingLanguage,
          initError
        );
      }
      throw initError;
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

      if (this.shouldUseRagFirst(activeSkill, text) && !ragMetadata.ragUsed) {
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

      if (this.shouldFallbackToSecondaryCodingModel(error, activeSkill)) {
        return this.processTextWithSecondaryCodingFallback(text, activeSkill, sessionMemory, programmingLanguage, error, startTime);
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

    const apiKey = config.getApiKey('ANTHROPIC');
    if (!apiKey || apiKey === 'your-api-key-here') {
      throw new Error('Secondary coding model is not configured. Set ANTHROPIC_API_KEY in .env.');
    }

    const startTime = Date.now();
    this.requestCount++;

    try {
      logger.info('Processing text with secondary coding model', {
        activeSkill,
        textLength: text.length,
        hasSessionMemory: sessionMemory.length > 0,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });

      const response = await this.executeSecondaryCodingRequest(
        text,
        activeSkill,
        programmingLanguage,
        apiKey
      );

      logger.logPerformance('Secondary coding model processing', startTime, {
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
          usedFallback: false
        }
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Secondary coding model processing failed', {
        error: error.message,
        activeSkill,
        programmingLanguage: programmingLanguage || 'not specified',
        requestId: this.requestCount
      });
      throw error;
    }
  }

  async processTextWithSecondaryCodingFallback(text, activeSkill, sessionMemory, programmingLanguage, primaryError, startTime = Date.now()) {
    logger.warn('Primary LLM quota/billing issue detected, falling back to secondary coding model', {
      activeSkill,
      primaryError: primaryError.message
    });

    const fallbackResult = await this.processTextWithSecondaryCodingModel(
      text,
      activeSkill,
      sessionMemory,
      programmingLanguage
    );

    fallbackResult.metadata = {
      ...fallbackResult.metadata,
      usedFallback: true,
      fallbackReason: 'primary_llm_billing_or_quota',
      primaryErrorMessage: primaryError.message,
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
    if (!this.isInitialized) {
      const initError = new Error('LLM service not initialized. Check Gemini API key configuration.');
      if (config.getApiKey('ANTHROPIC')) {
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
      throw new Error('LLM service not initialized. Check Gemini API key configuration.');
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

      if (this.shouldUseRagFirst(activeSkill, text) && !ragMetadata.ragUsed) {
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
      !!config.getApiKey('ANTHROPIC');
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
    const maxRetries = config.get('llm.anthropic.maxRetries') || 3;
    const postData = JSON.stringify({
      model: config.get('llm.anthropic.model'),
      max_tokens: config.get('llm.anthropic.maxTokens'),
      temperature: 0,
      system: this.buildSecondaryCodingSystemInstruction(activeSkill, programmingLanguage),
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
        const shouldRetry = this.isRetryableSecondaryCodingError(error) && attempt < maxRetries;

        logger.warn('Secondary coding request attempt failed', {
          attempt,
          maxRetries,
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
              reject(new Error('Secondary coding request returned empty content'));
              return;
            }

            resolve(responseText);
          } catch (error) {
            reject(new Error(`Failed to parse secondary coding response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Secondary coding request error: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Secondary coding request timeout'));
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
      return `Secondary coding request failed with HTTP ${statusCode}${type}${message}`;
    } catch {
      return `Secondary coding request failed with HTTP ${statusCode}`;
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
