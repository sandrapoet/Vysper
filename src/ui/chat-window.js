try {
    // Check if we're in Node.js context or browser context
    let logger;
    try {
        logger = require('../core/logger').createServiceLogger('CHAT-UI');
    } catch (error) {
        logger = {
            info: (...args) => console.log('[CHAT-UI INFO]', ...args),
            debug: (...args) => console.log('[CHAT-UI DEBUG]', ...args),
            error: (...args) => console.error('[CHAT-UI ERROR]', ...args),
            warn: (...args) => console.warn('[CHAT-UI WARN]', ...args)
        };
    }

class ChatWindowUI {
    constructor() {
        this.isRecording = false;
        this.isInteractive = true; // Start in interactive mode
        this.isSynthesizingAudio = false;
        this.isWaitingForTtsText = false;
        this.elements = {};
        
        this.init();
    }

    init() {
        try {
            this.setupElements();
            this.setupEventListeners();
            this.addMessage('Chat window initialized. Click microphone or press ⌘+R to start recording.', 'system');
            
            logger.info('Chat window UI initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize chat window UI', { error: error.message });
            console.error('Chat window initialization failed:', error);
        }
    }

    setupElements() {
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            recordingIndicator: document.getElementById('recordingIndicator'),
            messageInput: document.getElementById('messageInput'),
            sendButton: document.getElementById('sendButton'),
            micButton: document.getElementById('micButton'),
            chatContainer: document.getElementById('chatContainer'),
            interactionIndicator: document.getElementById('interactionIndicator'),
            interactionText: document.getElementById('interactionText'),
            listeningContainer: document.getElementById('listeningContainer'),
            listeningDuration: document.getElementById('listeningDuration')
        };
        
        // Validate required elements
        const requiredElements = ['chatMessages', 'micButton', 'sendButton', 'messageInput'];
        for (const elementKey of requiredElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`Required element '${elementKey}' not found`);
            }
        }
        
        // Initialize listening timer
        this.listeningStartTime = null;
        this.listeningTimer = null;
        this.thinkingIndicatorTimer = null;
    }

    setupEventListeners() {
        // Interaction state handlers
        if (window.electronAPI) {
            window.electronAPI.onInteractionModeChanged((event, interactive) => {
                this.isInteractive = interactive;
                if (interactive) {
                    this.handleInteractionEnabled();
                } else {
                    this.handleInteractionDisabled();
                }
            });

            window.electronAPI.receive('focus-chat-input', () => {
                this.focusMessageInput();
            });
            
            // Speech recognition handlers
            window.electronAPI.onTranscriptionReceived((event, data) => {
                if (data && data.text) {
                    this.handleTranscription(data.text, data);
                } else {
                    console.warn('Transcription event received but no text data:', data);
                }
            });

            window.electronAPI.receive('secretaria-transcription-buffered', (event, data) => {
                if (data && data.text) {
                    this.handleSecretariaBufferedTranscription(data);
                } else {
                    console.warn('Secretaria buffer event received but no text data:', data);
                }
            });

            window.electronAPI.receive('secretaria-audio-buffered', (event, data) => {
                this.handleSecretariaBufferedAudio(data || {});
            });

            window.electronAPI.receive('secretaria-buffer-cleared', (event, data) => {
                this.handleSecretariaBufferCleared(data || {});
            });

            window.electronAPI.receive('secretaria-tts-request', () => {
                this.armSecretariaTtsInput();
            });

            window.electronAPI.receive('secretaria-tts-created', (event, data) => {
                logger.debug('Secretaria TTS audio created', data || {});
            });

            // Aviso de portapapeles (p. ej. cuantos caracteres se copiaron).
            window.electronAPI.receive('clipboard-notice', (event, data) => {
                if (data && data.text) this.addMessage(data.text, 'system');
            });
            
            // Listen for interim transcription (real-time)
            if (window.electronAPI.onInterimTranscription) {
                window.electronAPI.onInterimTranscription((event, data) => {
                    if (data && data.text) {
                        this.showInterimText(data.text);
                    }
                });
            }
            
            window.electronAPI.onSpeechStatus((event, data) => {
                if (data && data.status) {
                    this.addMessage(data.status, 'system');
                    
                    // Update recording state based on status
                    if (data.status.includes('started') || data.status.includes('Recording')) {
                        this.handleRecordingStarted();
                    } else if (data.status.includes('stopped') || data.status.includes('ended')) {
                        this.handleRecordingStopped();
                    }
                }
            });
            
            window.electronAPI.onSpeechError((event, data) => {
                if (data && data.error) {
                    this.addMessage(`Speech Error: ${data.error}`, 'error');
                    this.handleRecordingStopped(); // Stop recording on error
                }
            });

            if (window.electronAPI.onRecordingStarted) {
                window.electronAPI.onRecordingStarted(() => {
                    this.handleRecordingStarted();
                });
            }

            if (window.electronAPI.onRecordingStopped) {
                window.electronAPI.onRecordingStopped(() => {
                    this.handleRecordingStopped();
                });
            }
            
            // Skill handlers
            window.electronAPI.onSkillChanged((event, data) => {
                if (data && data.skill) {
                    this.handleSkillActivated(data.skill);
                }
            });
            
            // Session handlers
            window.electronAPI.onSessionCleared((event, data) => {
                this.clearPendingThinkingIndicator();
                this.hideListeningAnimation();
                const message = data && data.message ? data.message : 'Contexto eliminado';
                this.addMessage(message, 'system');
            });
            
            window.electronAPI.onOcrCompleted((event, data) => {
                if (data.text && data.text.trim()) {
                    this.addMessage(`📷 OCR Result: ${data.text}`, 'transcription');
                }
            });
            
            window.electronAPI.onOcrError((event, data) => {
                this.addMessage(`OCR Error: ${data.error}`, 'error');
            });
            
            window.electronAPI.onLlmResponse((event, data) => {
                if (data.metadata && data.metadata.fallbackNotice) {
                    const notice = data.metadata.fallbackNotice;
                    this.addMessage(`${notice.message} Recarga saldo aqui: ${notice.topUpUrl}`, 'error');
                }
                this.addMessage(`🤖 LLM Response: ${data.response}`, 'system');
            });
            
            window.electronAPI.onLlmError((event, data) => {
                this.addMessage(`LLM Error: ${data.error}`, 'error');
            });
            
            window.electronAPI.onTranscriptionLlmResponse((event, data) => {
                if (data && data.response) {
                    this.clearPendingThinkingIndicator();

                    if (data.metadata && data.metadata.isContextReset) {
                        return;
                    }

                    if (data.metadata && data.metadata.fallbackNotice) {
                        const notice = data.metadata.fallbackNotice;
                        const message = `${notice.message} Recarga saldo aqui: ${notice.topUpUrl}`;
                        this.addMessage(message, 'error');
                    }

                    if (data.metadata && data.metadata.usedFallback && data.metadata.fallbackReason) {
                        if (data.metadata.fallbackReason !== 'primary_llm_billing_or_quota') {
                            this.addMessage(`Gemini fallback: ${data.metadata.fallbackReason}`, 'error');
                        }
                    }
                    
                    // Add assistant response with formatting
                    this.addMessage(data.response, 'assistant');
                }
            });
        }
        
        // UI event handlers
        this.setupUIHandlers();
        
        logger.debug('Chat window event listeners set up');
    }

    setupUIHandlers() {
        // Microphone button
        this.elements.micButton.addEventListener('click', async () => {
            if (!this.isInteractive) {
                this.addMessage('Window is in non-interactive mode. Press Alt+A to enable interaction.', 'error');
                return;
            }
            
            try {
                if (this.isRecording) {
                    await window.electronAPI.stopSpeechRecognition();
                } else {
                    await window.electronAPI.startSpeechRecognition();
                }
            } catch (error) {
                this.addMessage(`Speech recognition error: ${error.message}`, 'error');
                logger.error('Speech recognition failed', { error: error.message });
            }
        });
        
        // Send button
        this.elements.sendButton.addEventListener('click', () => {
            this.sendMessage();
        });
        
        // Message input
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // Alt+R is handled globally by the main process.
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === '3') {
                e.preventDefault();
                this.armSecretariaTtsInput();
            }
        });
    }

    handleInteractionEnabled() {
        this.isInteractive = true;
        this.elements.chatContainer.classList.remove('non-interactive');
        this.focusMessageInput();
        this.showInteractionIndicator('Interactive', true);
        logger.debug('Interaction mode enabled in chat');
    }

    handleInteractionDisabled() {
        this.isInteractive = false;
        this.elements.chatContainer.classList.add('non-interactive');
        this.showInteractionIndicator('Non-Interactive', false);
        logger.debug('Interaction mode disabled in chat');
    }

    focusMessageInput() {
        if (!this.elements.messageInput) return;
        setTimeout(() => {
            this.elements.messageInput.disabled = false;
            this.elements.messageInput.focus();
            this.elements.messageInput.select();
        }, 80);
    }

    handleRecordingStarted() {
        this.isRecording = true;
        if (this.elements.recordingIndicator) {
            this.elements.recordingIndicator.style.display = 'block';
        }
        if (this.elements.micButton) {
            this.elements.micButton.classList.add('recording');
        }
        
        // Show listening animation
        this.showListeningAnimation();
        
        logger.debug('Recording started in chat window');
    }

    handleRecordingStopped() {
        this.isRecording = false;
        if (this.elements.recordingIndicator) {
            this.elements.recordingIndicator.style.display = 'none';
        }
        if (this.elements.micButton) {
            this.elements.micButton.classList.remove('recording');
        }
        
        // Hide listening animation
        this.hideListeningAnimation();
        
        logger.debug('Recording stopped in chat window');
    }

    handleTranscription(text, data = {}) {
        if (text && text.trim()) {
            if (data.mode === 'secretaria' || data.isSecretariaBuffer) {
                this.handleSecretariaBufferedTranscription(data);
                return;
            }

            // Hide listening animation first
            this.hideListeningAnimation();
            
            // Show transcribed text with a slight delay for smooth transition
            setTimeout(() => {
                this.addMessage(text, 'transcription');
                
                // Show thinking indicator after transcription
                this.thinkingIndicatorTimer = setTimeout(() => {
                    this.thinkingIndicatorTimer = null;
                    this.showThinkingIndicator();
                }, 300);
            }, 200);
            
            logger.debug('Transcription received in chat', { textLength: text.length });
        } else {
            console.warn('❌ Transcription text is empty or invalid:', text);
        }
    }

    handleSecretariaBufferedTranscription(data) {
        const text = typeof data.text === 'string' ? data.text.trim() : '';
        if (!text) return;

        this.hideListeningAnimation();
        this.clearPendingThinkingIndicator();
        this.addMessage(text, 'transcription');
        this.addMessage(`Secretaria: fragmento guardado en buffer (${data.chunks || 1})`, 'system');
        logger.debug('Secretaria transcription buffered in chat', {
            textLength: text.length,
            chunks: data.chunks,
            totalLength: data.totalLength
        });
    }

    handleSecretariaBufferedAudio(data) {
        this.hideListeningAnimation();
        this.clearPendingThinkingIndicator();
        this.addMessage(`Secretaria: audio guardado pendiente de transcripcion (${data.pendingAudioCount || 1})`, 'system');
        logger.debug('Secretaria audio buffered in chat', {
            audioPath: data.audioPath,
            chunks: data.chunks,
            pendingAudioCount: data.pendingAudioCount
        });
    }

    handleSecretariaBufferCleared(data) {
        this.hideListeningAnimation();
        this.clearPendingThinkingIndicator();
        this.addMessage(`Secretaria: buffer liberado (${data.clearedChunks || 0})`, 'system');
        logger.debug('Secretaria buffer cleared in chat', data);
    }

    async handleSkillActivated(skillName) {
        try {
            // Request the actual skill prompt from the main process
            const skillPrompt = await window.electronAPI.getSkillPrompt(skillName);
            
            if (skillPrompt) {
                // Extract the title/first line for display
                const lines = skillPrompt.split('\n').filter(line => line.trim());
                const title = lines.find(line => line.startsWith('#')) || `# ${skillName.toUpperCase()} Mode`;
                const cleanTitle = title.replace(/^#+\s*/, '').trim();
                
                // Show a brief activation message with the skill title
                const icons = {
                    'dsa': '🧠',
                    'behavioral': '💼', 
                    'sales': '💰',
                    'presentation': '🎤',
                    'data-science': '📊',
                    'programming': '💻',
                    'devops': '🚀',
                    'system-design': '🏗️',
                    'negotiation': '🤝',
                    'secretaria': '📝',
                    'labelling': '🏷️'
                };
                
                const icon = icons[skillName] || '🎯';
                this.addMessage(`${icon} ${cleanTitle} - Ready to help!`, 'system');
            } else {
                // Fallback if prompt not found
                this.addMessage(`🎯 ${skillName.toUpperCase()} Mode: Ready to help!`, 'system');
            }
        } catch (error) {
            logger.error('Failed to load skill prompt', { skill: skillName, error: error.message });
            // Fallback message
            this.addMessage(`🎯 ${skillName.toUpperCase()} Mode: Ready to help!`, 'system');
        }
        
        logger.info('Skill activated in chat', { skill: skillName });
    }

    async sendMessage() {
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.addMessage(text, 'user');
            this.elements.messageInput.value = '';

            if (this.isWaitingForTtsText) {
                this.isWaitingForTtsText = false;
                await this.synthesizeChatText(text);
                return;
            }
            
            // Send to main process for session memory storage
            try {
                if (window.electronAPI && window.electronAPI.sendChatMessage) {
                    const command = this.normalizeCommandText(text);
                    if (command === '!!!' || command === '<<!!!>>' || command === '<<<!!!>>>') {
                        await window.electronAPI.finalizeProgrammingContext();
                    } else if (command === '|||') {
                        await window.electronAPI.runSecondaryCodingFallback();
                    } else {
                        await window.electronAPI.sendChatMessage(text);
                    }
                }
            } catch (error) {
                logger.error('Failed to send chat message to main process', { error: error.message });
            }
            
            logger.debug('User message sent', { textLength: text.length });
        }
    }

    armSecretariaTtsInput() {
        if (this.isSynthesizingAudio) return;

        this.isWaitingForTtsText = true;
        this.addMessage('Secretaria: esperando texto para generar MP3. Edge es la voz base; usa ¬|1 para Piper y |1.5 para ritmo.', 'system');
        this.focusMessageInput();
    }

    async synthesizeChatText(text) {
        if (this.isSynthesizingAudio) return;

        const cleanText = String(text || '').trim();
        if (!cleanText) {
            this.addMessage('Secretaria: escribe texto y presiona Enviar para generar el audio.', 'error');
            return;
        }

        if (!window.electronAPI || !window.electronAPI.synthesizeChatAudio) {
            this.addMessage('Secretaria: la sintesis de audio no esta disponible en esta ventana.', 'error');
            return;
        }

        this.addMessage('Secretaria: generando audio con Piper...', 'system');
        this.isSynthesizingAudio = true;

        try {
            const result = await window.electronAPI.synthesizeChatAudio(cleanText);
            if (!result || !result.success) {
                throw new Error(result?.error || 'No se pudo generar el audio.');
            }

            this.addMessage(`Secretaria: audio guardado en ${result.audioPath}`, 'system');
            logger.info('Secretaria chat text synthesized', {
                audioPath: result.audioPath,
                textLength: result.textLength,
                sizeBytes: result.sizeBytes
            });
        } catch (error) {
            this.addMessage(`Secretaria TTS Error: ${error.message}`, 'error');
            logger.error('Failed to synthesize current chat text', { error: error.message });
        } finally {
            this.isSynthesizingAudio = false;
        }
    }

    normalizeCommandText(text) {
        return String(text || '')
            .trim()
            .replace(/\s+/g, '')
            .replace(/[.。]+$/g, '');
    }

    addMessage(text, type = 'user') {        
        if (!this.elements.chatMessages) {
            console.error('❌ Chat messages element not found!');
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        
        // Format assistant messages as markdown
        if (type === 'assistant') {
            textDiv.innerHTML = this.formatMarkdown(text);
        } else {
            textDiv.textContent = text;
        }
        
        messageDiv.appendChild(timeDiv);
        messageDiv.appendChild(textDiv);
        
        this.elements.chatMessages.appendChild(messageDiv);
        
        // Auto-scroll to bottom
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    formatMarkdown(text) {
        if (!text) return '';
        
        try {
            // Use the markdown.js library for proper markdown parsing
            // Try to access markdown library in different contexts
            let markdownLib;
            
            // First try global markdown object (from script tag)
            if (typeof markdown !== 'undefined' && markdown.toHTML) {
                markdownLib = markdown;
            }
            // Then try require (Node.js context)
            else if (typeof require !== 'undefined') {
                try {
                    markdownLib = require('markdown');
                } catch (requireError) {
                    logger.debug('Could not require markdown library:', requireError.message);
                }
            }
            // Finally try window.markdown (browser context)
            else if (typeof window !== 'undefined' && window.markdown) {
                markdownLib = window.markdown;
            }
            
            if (markdownLib && markdownLib.toHTML) {
                return markdownLib.toHTML(text);
            } else {
                logger.warn('Markdown library not available, falling back to basic formatting');
                // Fallback to basic formatting
                return text
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.+?)\*/g, '<em>$1</em>')
                    .replace(/`(.+?)`/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');
            }
        } catch (error) {
            logger.warn('Failed to parse markdown, falling back to plain text', { error: error.message });
            // Fallback to basic formatting
            return text.replace(/\n/g, '<br>');
        }
    }

    showThinkingIndicator() {
        if (!this.elements.chatMessages) return;
        this.hideThinkingIndicator();

        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message assistant thinking';
        thinkingDiv.id = 'thinking-indicator';

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        const textDiv = document.createElement('div');
        textDiv.className = 'message-text thinking-dots';
        textDiv.innerHTML = '<span class="dot">•</span><span class="dot">•</span><span class="dot">•</span>';

        thinkingDiv.appendChild(timeDiv);
        thinkingDiv.appendChild(textDiv);

        this.elements.chatMessages.appendChild(thinkingDiv);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    hideThinkingIndicator() {
        const thinkingIndicator = document.getElementById('thinking-indicator');
        if (thinkingIndicator) {
            thinkingIndicator.remove();
        }
    }

    clearPendingThinkingIndicator() {
        if (this.thinkingIndicatorTimer) {
            clearTimeout(this.thinkingIndicatorTimer);
            this.thinkingIndicatorTimer = null;
        }
        this.hideThinkingIndicator();
    }

    showInteractionIndicator(text, interactive) {
        if (!this.elements.interactionIndicator || !this.elements.interactionText) return;
        
        this.elements.interactionText.textContent = text;
        this.elements.interactionIndicator.className = `interaction-indicator show ${interactive ? 'interactive' : 'non-interactive'}`;
        
        setTimeout(() => {
            this.elements.interactionIndicator.classList.remove('show');
        }, 2000);
    }

    showListeningAnimation() {
        if (!this.elements.listeningContainer) {
            console.warn('❌ Listening container not found');
            return;
        }
        
        // Show the listening animation
        this.elements.listeningContainer.classList.add('active');
        
        // Start the duration timer
        this.listeningStartTime = Date.now();
        this.listeningTimer = setInterval(() => {
            this.updateListeningDuration();
        }, 100);
        
        // Auto-scroll to show the listening animation
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = 0;
        }
    }

    hideListeningAnimation() {
        if (this.elements.listeningContainer) {
            this.elements.listeningContainer.classList.remove('active');
        }
        
        // Clear interim text
        this.clearInterimText();
        
        // Clear the duration timer
        if (this.listeningTimer) {
            clearInterval(this.listeningTimer);
            this.listeningTimer = null;
        }
        
        this.listeningStartTime = null;
    }

    updateListeningDuration() {
        if (!this.listeningStartTime || !this.elements.listeningDuration) return;
        
        const elapsed = Date.now() - this.listeningStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const milliseconds = Math.floor((elapsed % 1000) / 100);
        
        const formattedTime = `${seconds.toString().padStart(2, '0')}:${milliseconds}`;
        this.elements.listeningDuration.textContent = formattedTime;
    }

    showInterimText(text) {
        if (!this.elements.listeningContainer) return;
        
        // Find or create interim text element
        let interimElement = this.elements.listeningContainer.querySelector('.interim-text');
        if (!interimElement) {
            interimElement = document.createElement('div');
            interimElement.className = 'interim-text';
            interimElement.style.cssText = `
                color: rgba(255, 255, 255, 0.8);
                font-size: 12px;
                font-style: italic;
                margin-top: 10px;
                padding: 8px;
                background: rgba(76, 175, 80, 0.2);
                border-radius: 6px;
                min-height: 20px;
                border: 1px dashed rgba(76, 175, 80, 0.4);
            `;
            this.elements.listeningContainer.appendChild(interimElement);
        }
        
        interimElement.textContent = text || 'Waiting for speech...';
    }

    clearInterimText() {
        if (!this.elements.listeningContainer) return;
        
        const interimElement = this.elements.listeningContainer.querySelector('.interim-text');
        if (interimElement) {
            interimElement.remove();
        }
    }
}

    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new ChatWindowUI();
        });
    } else {
        new ChatWindowUI();
    }

} catch (error) {
    console.error('💥 CHAT-WINDOW.JS: Script execution failed!', error);
    console.error('💥 CHAT-WINDOW.JS: Error stack:', error.stack);
} 
