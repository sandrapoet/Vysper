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
      const display = this.normalizeDisplay(bounds.display) || screen.getPrimaryDisplay();
      const cropRect = this.normalizeCropRect(bounds);

      logger.info('Starting regional screenshot capture and OCR processing', {
        displayId: display.id,
        cropRect
      });

      const croppedImage = await this.robustScreenCapture(display, cropRect);
      const extractedText = await this.performOCR({ image: croppedImage });

      logger.logPerformance('Regional OCR processing', startTime, {
        textLength: extractedText.length,
        hasContent: extractedText.trim().length > 0,
        displayId: display.id
      });

      return {
        text: extractedText.trim(),
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
      scaleFactor: Number(display.scaleFactor) || 1
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
    const byId = sources.find(source => source.display_id === String(targetDisplay.id));
    if (byId) {
      return byId;
    }

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

    const nonGlobal = sources.filter(source => {
      const name = String(source.name || '').toLowerCase();
      return !name.includes('entire') && !name.includes('toda la pantalla');
    });

    const fallback = nonGlobal[0] || sources[0];
    if (fallback) {
      logger.warn('Falling back to best available screen source', {
        displayId: targetDisplay.id,
        sourceName: fallback.name,
        sourceDisplayId: fallback.display_id,
        sourceCount: sources.length
      });
    }

    return fallback;
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

  getCaptureFrame(source, display, sourceCount) {
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
    const tempPath = this.createTempFile(screenshot.image);
    
    try {
      logger.debug('Starting OCR text extraction', { tempPath });
      
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
