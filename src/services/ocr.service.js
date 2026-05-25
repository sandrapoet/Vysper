const { desktopCapturer } = require('electron');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('OCR');
const config = require('../core/config');

class OCRService {
  constructor() {
    this.isProcessing = false;
    this.tempFiles = new Set();
    this.scaleCache = new Map();
  }

  async captureAndProcess() {
    if (this.isProcessing) {
      throw new Error('OCR operation already in progress');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    
    try {
      logger.info('Starting screenshot capture and OCR processing');
      
      const screenshot = await this.captureScreenshot();
      const extractedText = await this.performOCR(screenshot);
      
      logger.logPerformance('OCR processing', startTime, {
        textLength: extractedText.length,
        hasContent: extractedText.trim().length > 0
      });

      return {
        text: extractedText.trim(),
        metadata: {
          timestamp: new Date().toISOString(),
          source: screenshot.metadata,
          processingTime: Date.now() - startTime
        }
      };
    } finally {
      this.isProcessing = false;
      this.cleanup();
    }
  }

  async captureScreenshot() {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available for capture');
    }

    const primarySource = sources[0];
    const image = primarySource.thumbnail;

    if (!image) {
      throw new Error('Failed to capture screen thumbnail');
    }

    logger.debug('Screenshot captured successfully', {
      sourceName: primarySource.name,
      imageSize: image.getSize()
    });

    return {
      image,
      metadata: {
        sourceName: primarySource.name,
        dimensions: image.getSize(),
        captureTime: new Date().toISOString()
      }
    };
  }

  async captureAndProcessRegion(bounds) {
    if (this.isProcessing) {
      throw new Error('OCR operation already in progress');
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const { screen } = require('electron');
      const requestedDisplay = this.normalizeDisplay(bounds.display) || screen.getPrimaryDisplay();
      const requestedCropRect = this.normalizeCropRect(bounds);
      const { display, cropRect } = this.resolveCaptureTarget(requestedDisplay, requestedCropRect);

      logger.info('Starting regional screenshot capture and OCR processing', {
        displayId: display.id,
        cropRect,
        requestedDisplayId: requestedDisplay.id
      });

      const croppedImage = await this.robustScreenCapture(display, cropRect);
      let extractedText = await this.performOCR({ image: croppedImage });

      if (this.isLowConfidenceOCRText(extractedText)) {
        const candidateText = await this.performOCRFromCandidateSources(display, cropRect, extractedText);
        if (this.getOCRTextScore(candidateText) > this.getOCRTextScore(extractedText)) {
          logger.warn('Using better OCR text from alternate screen source', {
            originalText: extractedText,
            originalScore: this.getOCRTextScore(extractedText),
            candidateLength: candidateText.length,
            candidateScore: this.getOCRTextScore(candidateText)
          });
          extractedText = candidateText;
        }
      }

      logger.logPerformance('Regional OCR processing', startTime, {
        textLength: extractedText.length,
        hasContent: extractedText.trim().length > 0,
        displayId: display.id
      });

      return {
        text: extractedText.trim(),
        image: croppedImage,
        metadata: {
          timestamp: new Date().toISOString(),
          region: cropRect,
          display: {
            id: display.id,
            bounds: display.bounds,
            scaleFactor: display.scaleFactor
          },
          processingTime: Date.now() - startTime
        }
      };
    } finally {
      this.isProcessing = false;
      this.cleanup();
    }
  }

  async captureRegionImage(bounds) {
    if (this.isProcessing) {
      throw new Error('OCR operation already in progress');
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const { screen } = require('electron');
      const requestedDisplay = this.normalizeDisplay(bounds.display) || screen.getPrimaryDisplay();
      const requestedCropRect = this.normalizeCropRect(bounds);
      const { display, cropRect } = this.resolveCaptureTarget(requestedDisplay, requestedCropRect);

      logger.info('Starting regional screenshot capture without OCR', {
        displayId: display.id,
        cropRect,
        requestedDisplayId: requestedDisplay.id
      });

      const croppedImage = await this.robustScreenCapture(display, cropRect);

      logger.logPerformance('Regional image capture', startTime, {
        hasImage: !!croppedImage,
        displayId: display.id
      });

      return {
        image: croppedImage,
        metadata: {
          timestamp: new Date().toISOString(),
          region: cropRect,
          display: {
            id: display.id,
            bounds: display.bounds,
            scaleFactor: display.scaleFactor
          },
          processingTime: Date.now() - startTime,
          source: 'screenshot-region-image'
        }
      };
    } finally {
      this.isProcessing = false;
      this.cleanup();
    }
  }

  normalizeDisplay(display) {
    if (!display || !display.bounds) {
      return null;
    }

    return {
      id: display.id,
      bounds: {
        x: Number(display.bounds.x) || 0,
        y: Number(display.bounds.y) || 0,
        width: Number(display.bounds.width) || 0,
        height: Number(display.bounds.height) || 0
      },
      workArea: display.workArea,
      scaleFactor: Number(display.scaleFactor) || 1,
      isVirtual: display.isVirtual || false
    };
  }

  normalizeCropRect(bounds) {
    const cropRect = {
      x: Math.max(0, Number(bounds?.x) || 0),
      y: Math.max(0, Number(bounds?.y) || 0),
      width: Math.max(0, Number(bounds?.width) || 0),
      height: Math.max(0, Number(bounds?.height) || 0)
    };

    if (cropRect.width < 10 || cropRect.height < 10) {
      throw new Error('Selected region is too small for OCR');
    }

    return cropRect;
  }

  resolveCaptureTarget(display, cropRect) {
    if (!display?.isVirtual) {
      return { display, cropRect };
    }

    const { screen } = require('electron');
    const displays = screen.getAllDisplays().map(item => this.normalizeDisplay(item));
    const globalRect = {
      x: display.bounds.x + cropRect.x,
      y: display.bounds.y + cropRect.y,
      width: cropRect.width,
      height: cropRect.height
    };

    const targetDisplay = this.findDisplayForGlobalRect(displays, globalRect) ||
      this.normalizeDisplay(screen.getPrimaryDisplay());
    const localCropRect = {
      x: Math.max(0, globalRect.x - targetDisplay.bounds.x),
      y: Math.max(0, globalRect.y - targetDisplay.bounds.y),
      width: cropRect.width,
      height: cropRect.height
    };

    const clampedCropRect = this.clampLogicalRectToDisplay(localCropRect, targetDisplay);

    if (clampedCropRect.width < 10 || clampedCropRect.height < 10) {
      throw new Error('Selected region does not fit inside a single display');
    }

    logger.debug('Resolved virtual selection to physical display', {
      virtualBounds: display.bounds,
      globalRect,
      targetDisplayId: targetDisplay.id,
      targetDisplayBounds: targetDisplay.bounds,
      localCropRect,
      clampedCropRect
    });

    return {
      display: targetDisplay,
      cropRect: clampedCropRect
    };
  }

  findDisplayForGlobalRect(displays, globalRect) {
    const center = {
      x: globalRect.x + (globalRect.width / 2),
      y: globalRect.y + (globalRect.height / 2)
    };

    const containingCenter = displays.find(display =>
      center.x >= display.bounds.x &&
      center.x < display.bounds.x + display.bounds.width &&
      center.y >= display.bounds.y &&
      center.y < display.bounds.y + display.bounds.height
    );

    if (containingCenter) {
      return containingCenter;
    }

    return displays
      .map(display => ({
        display,
        area: this.getIntersectionArea(globalRect, display.bounds)
      }))
      .sort((a, b) => b.area - a.area)[0]?.display || null;
  }

  getIntersectionArea(rect, bounds) {
    const x1 = Math.max(rect.x, bounds.x);
    const y1 = Math.max(rect.y, bounds.y);
    const x2 = Math.min(rect.x + rect.width, bounds.x + bounds.width);
    const y2 = Math.min(rect.y + rect.height, bounds.y + bounds.height);

    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  }

  clampLogicalRectToDisplay(rect, display) {
    const x = Math.max(0, Math.min(rect.x, display.bounds.width - 1));
    const y = Math.max(0, Math.min(rect.y, display.bounds.height - 1));
    const maxWidth = display.bounds.width - x;
    const maxHeight = display.bounds.height - y;

    return {
      x,
      y,
      width: Math.max(0, Math.min(rect.width, maxWidth)),
      height: Math.max(0, Math.min(rect.height, maxHeight))
    };
  }

  calculateOptimalThumbnailSize(display) {
    const width = Math.ceil(display.bounds.width * display.scaleFactor);
    const height = Math.ceil(display.bounds.height * display.scaleFactor);
    const maxDimension = 4096;

    return {
      width: Math.min(width, maxDimension),
      height: Math.min(height, maxDimension),
      wasScaled: width > maxDimension || height > maxDimension
    };
  }

  findSourceForDisplay(sources, targetDisplay) {
    // Virtual desktop overlay: prefer the global/combined source
    if (targetDisplay.isVirtual) {
      const global = sources.find(s => {
        const name = String(s.name || '').toLowerCase();
        return name.includes('entire') || name.includes('toda la pantalla') ||
          name.includes('whole') || name.includes('desktop');
      });
      const fallback = global || sources[0];
      logger.debug('Virtual display: using global source for capture', {
        sourceName: fallback?.name,
        sourceDisplayId: fallback?.display_id
      });
      return fallback;
    }

    // 1. Exact match por display_id (funciona en X11, Windows, macOS)
    const byId = sources.find(source => source.display_id === String(targetDisplay.id));
    if (byId) {
      return byId;
    }

    // 2. Regex de posición en nombre (formato varía por plataforma)
    const byPosition = sources.find(source => {
      const match = String(source.name || '').match(/screen[-\s](\d+)[-\s](\d+)/i);
      if (!match) {
        return false;
      }

      return Number.parseInt(match[1], 10) === targetDisplay.bounds.x &&
        Number.parseInt(match[2], 10) === targetDisplay.bounds.y;
    });

    if (byPosition) {
      logger.warn('Matched display source by position heuristic', {
        displayId: targetDisplay.id,
        sourceName: byPosition.name
      });
      return byPosition;
    }

    // Clasificar sources en globales y por-display
    const isGlobalName = name => name.includes('entire') || name.includes('toda la pantalla') ||
      name.includes('whole') || name.includes('desktop');
    const globalSources = sources.filter(s => isGlobalName(String(s.name || '').toLowerCase()));
    const nonGlobalSources = sources.filter(s => !isGlobalName(String(s.name || '').toLowerCase()));

    // 3. Match por índice posicional cuando conteo de sources coincide con displays del sistema.
    // En Linux, desktopCapturer devuelve sources en el mismo orden que los displays físicos.
    const { screen } = require('electron');
    const allDisplays = screen.getAllDisplays();
    if (nonGlobalSources.length > 0 && nonGlobalSources.length === allDisplays.length) {
      const sortedDisplays = [...allDisplays].sort((a, b) =>
        a.bounds.x !== b.bounds.x ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y
      );
      const displayIndex = sortedDisplays.findIndex(d => d.id === targetDisplay.id);
      if (displayIndex !== -1 && displayIndex < nonGlobalSources.length) {
        const candidate = nonGlobalSources[displayIndex];
        logger.warn('Matched display source by positional index', {
          displayId: targetDisplay.id,
          displayIndex,
          sourceName: candidate.name,
          sourceDisplayId: candidate.display_id,
          totalDisplays: allDisplays.length
        });
        return candidate;
      }
    }

    // 4. Preferir source global sobre source per-display arbitrario.
    // getCaptureFrame maneja globales correctamente con frame de virtual desktop.
    const globalFallback = globalSources[0];
    if (globalFallback) {
      logger.warn('Falling back to global screen source — positional match failed', {
        displayId: targetDisplay.id,
        sourceName: globalFallback.name,
        nonGlobalCount: nonGlobalSources.length,
        displayCount: allDisplays.length
      });
      return globalFallback;
    }

    if (allDisplays.length > 1 && sources.length > 1) {
      const sourceSummary = sources.map(source => ({
        name: source.name,
        displayId: source.display_id
      }));

      logger.error('Unable to match screen source to target display', {
        displayId: targetDisplay.id,
        displayBounds: targetDisplay.bounds,
        sources: sourceSummary
      });

      throw new Error(`Unable to match screen source for display ${targetDisplay.id}`);
    }

    // Último recurso para setups de una sola fuente/display.
    const lastResort = nonGlobalSources[0] || sources[0];
    if (lastResort) {
      logger.warn('Last resort: returning arbitrary screen source', {
        displayId: targetDisplay.id,
        sourceName: lastResort.name,
        sourceDisplayId: lastResort.display_id,
        sourceCount: sources.length
      });
    }
    return lastResort;
  }

  getAdjustedScale(display, actualImageSize) {
    const key = `${display.id}-${display.bounds.width}x${display.bounds.height}`;

    if (!this.scaleCache.has(key)) {
      const scaleX = actualImageSize.width / display.bounds.width;
      const scaleY = actualImageSize.height / display.bounds.height;
      const scale = Math.abs(scaleX - scaleY) < 0.05
        ? (scaleX + scaleY) / 2
        : Math.min(scaleX, scaleY);

      this.scaleCache.set(key, scale);
    }

    return this.scaleCache.get(key);
  }

  async robustScreenCapture(display, cropRect, maxRetries = 2) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.captureAndCropDisplay(display, cropRect);
      } catch (error) {
        lastError = error;
        const retryableMessages = [
          'Thumbnail empty',
          'No screen source',
          'source for display',
          'timeout'
        ];
        const canRetry = retryableMessages.some(message => error.message.includes(message));

        if (!canRetry || attempt === maxRetries) {
          throw error;
        }

        logger.warn('Retrying regional screen capture', {
          attempt: attempt + 1,
          maxRetries,
          error: error.message
        });
      }
    }

    throw lastError;
  }

  async captureAndCropDisplay(display, cropRect) {
    const thumbnailSize = this.calculateOptimalThumbnailSize(display);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: thumbnailSize.width,
        height: thumbnailSize.height
      }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available for regional capture');
    }

    const source = this.findSourceForDisplay(sources, display);
    if (!source) {
      throw new Error(`No screen source for display ${display.id}`);
    }

    const thumbnail = source.thumbnail;
    if (!thumbnail || thumbnail.isEmpty()) {
      throw new Error('Thumbnail empty or invalid');
    }

    const actualSize = thumbnail.getSize();
    const captureFrame = this.getCaptureFrame(source, display, sources.length);
    const scaleX = actualSize.width / captureFrame.width;
    const scaleY = actualSize.height / captureFrame.height;
    const adjustedScale = this.getAdjustedScale(display, actualSize);

    if (Math.abs(scaleX - scaleY) > 0.1) {
      logger.warn('Regional capture scale ratios differ significantly', {
        displayId: display.id,
        scaleX,
        scaleY,
        adjustedScale,
        sourceName: source.name,
        actualSize,
        thumbnailWasScaled: thumbnailSize.wasScaled
      });
    }

    const cropXInFrame = display.bounds.x - captureFrame.x + cropRect.x;
    const cropYInFrame = display.bounds.y - captureFrame.y + cropRect.y;
    const scaledRect = {
      x: Math.floor(cropXInFrame * scaleX),
      y: Math.floor(cropYInFrame * scaleY),
      width: Math.floor(cropRect.width * scaleX),
      height: Math.floor(cropRect.height * scaleY)
    };

    const clampedRect = this.clampCropRect(scaledRect, actualSize);
    if (clampedRect.width < 1 || clampedRect.height < 1) {
      throw new Error(`Selected crop is outside captured image bounds ${actualSize.width}x${actualSize.height}`);
    }

    logger.debug('Regional screenshot captured and cropped', {
      displayId: display.id,
      sourceName: source.name,
      sourceDisplayId: source.display_id,
      actualSize,
      captureFrame,
      cropRect,
      scaledRect,
      clampedRect
    });

    return thumbnail.crop(clampedRect);
  }

  isLowConfidenceOCRText(text) {
    const normalized = String(text || '').trim();
    return normalized.length < 20 || this.getOCRTextScore(normalized) < 30;
  }

  getOCRTextScore(text) {
    const normalized = String(text || '').trim();
    const words = normalized.match(/[a-zA-Z0-9_]{2,}/g) || [];
    const alphaNumericCount = (normalized.match(/[a-zA-Z0-9]/g) || []).length;
    return alphaNumericCount + (words.length * 4);
  }

  async performOCRFromCandidateSources(display, cropRect, currentText = '') {
    const thumbnailSize = this.calculateOptimalThumbnailSize(display);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: thumbnailSize.width,
        height: thumbnailSize.height
      }
    });

    let bestText = currentText || '';
    let bestScore = this.getOCRTextScore(bestText);

    logger.warn('Primary OCR crop was low confidence; trying alternate screen sources', {
      displayId: display.id,
      cropRect,
      currentText,
      currentScore: bestScore,
      sourceCount: sources.length,
      sources: sources.map(source => ({
        name: source.name,
        displayId: source.display_id,
        thumbnailSize: source.thumbnail?.getSize?.()
      }))
    });

    for (const source of sources) {
      try {
        const thumbnail = source.thumbnail;
        if (!thumbnail || thumbnail.isEmpty()) continue;

        const actualSize = thumbnail.getSize();
        const captureFrame = this.getCaptureFrame(source, display, sources.length);
        const scaleX = actualSize.width / captureFrame.width;
        const scaleY = actualSize.height / captureFrame.height;
        const cropXInFrame = display.bounds.x - captureFrame.x + cropRect.x;
        const cropYInFrame = display.bounds.y - captureFrame.y + cropRect.y;
        const scaledRect = {
          x: Math.floor(cropXInFrame * scaleX),
          y: Math.floor(cropYInFrame * scaleY),
          width: Math.floor(cropRect.width * scaleX),
          height: Math.floor(cropRect.height * scaleY)
        };
        const clampedRect = this.clampCropRect(scaledRect, actualSize);
        if (clampedRect.width < 1 || clampedRect.height < 1) continue;

        const candidateImage = thumbnail.crop(clampedRect);
        const candidateText = await this.performOCR({ image: candidateImage });

        logger.debug('Alternate OCR source attempted', {
          displayId: display.id,
          sourceName: source.name,
          sourceDisplayId: source.display_id,
          actualSize,
          captureFrame,
          clampedRect,
          textLength: candidateText.trim().length
        });

        const candidateScore = this.getOCRTextScore(candidateText);
        if (candidateScore > bestScore) {
          bestText = candidateText;
          bestScore = candidateScore;
          logger.warn('Alternate OCR source produced text', {
            displayId: display.id,
            sourceName: source.name,
            sourceDisplayId: source.display_id,
            textLength: candidateText.trim().length,
            candidateScore
          });
        }
      } catch (error) {
        logger.debug('Alternate OCR source failed', {
          sourceName: source.name,
          sourceDisplayId: source.display_id,
          error: error.message
        });
      }
    }

    return bestText;
  }

  getCaptureFrame(source, display, sourceCount) {
    // Virtual desktop overlay always uses the full virtual desktop frame
    if (display.isVirtual) {
      const { screen } = require('electron');
      const displays = screen.getAllDisplays();
      const minX = Math.min(...displays.map(d => d.bounds.x));
      const minY = Math.min(...displays.map(d => d.bounds.y));
      const maxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
      const maxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    const sourceName = String(source.name || '').toLowerCase();
    const isExactDisplay = source.display_id === String(display.id);
    const looksGlobal = sourceName.includes('entire') ||
      sourceName.includes('toda la pantalla') ||
      sourceName.includes('whole') ||
      sourceName.includes('desktop');

    if (isExactDisplay || (!looksGlobal && sourceCount > 1)) {
      return {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height
      };
    }

    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const minX = Math.min(...displays.map(item => item.bounds.x));
    const minY = Math.min(...displays.map(item => item.bounds.y));
    const maxX = Math.max(...displays.map(item => item.bounds.x + item.bounds.width));
    const maxY = Math.max(...displays.map(item => item.bounds.y + item.bounds.height));

    const frame = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };

    logger.warn('Using virtual desktop frame for regional crop fallback', {
      displayId: display.id,
      sourceName: source.name,
      sourceDisplayId: source.display_id,
      frame
    });

    return frame;
  }

  clampCropRect(rect, imageSize) {
    const x = Math.max(0, Math.min(rect.x, imageSize.width - 1));
    const y = Math.max(0, Math.min(rect.y, imageSize.height - 1));
    const maxWidth = imageSize.width - x;
    const maxHeight = imageSize.height - y;

    return {
      x,
      y,
      width: Math.max(0, Math.min(rect.width, maxWidth)),
      height: Math.max(0, Math.min(rect.height, maxHeight))
    };
  }

  async performOCR(screenshot) {
    const image = this.prepareImageForOCR(screenshot.image);
    const tempPath = this.createTempFile(image);

    try {
      logger.debug('Starting OCR text extraction', {
        tempPath,
        originalSize: screenshot.image.getSize(),
        ocrSize: image.getSize()
      });
      
      const { data: { text } } = await Tesseract.recognize(tempPath, config.get('ocr.language'), {
        logger: progress => {
          if (progress.status === 'recognizing text') {
            logger.debug(`OCR progress: ${Math.round(progress.progress * 100)}%`);
          }
        }
      });

      const cleanText = this.sanitizeText(text);
      
      logger.info('OCR text extraction completed', {
        originalLength: text.length,
        cleanedLength: cleanText.length,
        wordsExtracted: cleanText.split(/\s+/).filter(w => w.length > 0).length
      });

      return cleanText;
    } catch (error) {
      logger.error('OCR processing failed', { error: error.message, tempPath });
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  prepareImageForOCR(image) {
    const size = image.getSize();
    if (size.width >= 1000 && size.height >= 500) {
      return image;
    }

    const scale = size.width < 700 || size.height < 300 ? 3 : 2;
    return image.resize({
      width: Math.max(1, size.width * scale),
      height: Math.max(1, size.height * scale),
      quality: 'best'
    });
  }

  createTempFile(image) {
    const tempPath = path.join(
      config.get('ocr.tempDir'), 
      `Vysper-screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`
    );
    
    const buffer = image.toPNG();
    fs.writeFileSync(tempPath, buffer);
    
    this.tempFiles.add(tempPath);
    logger.debug('Temporary screenshot file created', { tempPath, size: buffer.length });
    
    return tempPath;
  }

  sanitizeText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[^\x20-\x7E\n]/g, '')
      .trim();
  }

  cleanup() {
    for (const tempFile of this.tempFiles) {
      try {
        fs.unlinkSync(tempFile);
        logger.debug('Cleaned up temporary file', { file: tempFile });
      } catch (error) {
        logger.warn('Failed to cleanup temporary file', { 
          file: tempFile, 
          error: error.message 
        });
      }
    }
    this.tempFiles.clear();
  }

  getStatus() {
    return {
      isProcessing: this.isProcessing,
      tempFilesCount: this.tempFiles.size,
      config: {
        language: config.get('ocr.language'),
        tempDir: config.get('ocr.tempDir')
      }
    };
  }
}

module.exports = new OCRService(); 
