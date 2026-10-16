import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
  } from '@nestjs/common';
  
  import { PDFParse } from 'pdf-parse';
  import mammoth from 'mammoth';
  
  @Injectable()
  export class CvTextExtractorService {
    async extractText(
      buffer: Buffer,
      mimeType: string,
    ): Promise<string> {
      let text: string;
  
      if (mimeType === 'application/pdf') {
        text = await this.extractPdf(buffer);
      } else if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        text = await this.extractDocx(buffer);
      } else {
        throw new BadRequestException(
          'Unsupported CV file type',
        );
      }
  
      const cleanedText = this.cleanText(text);
  
      if (!cleanedText) {
        throw new BadRequestException(
          'No readable text was found in the CV',
        );
      }
  
      return cleanedText;
    }
  
    private async extractPdf(
      buffer: Buffer,
    ): Promise<string> {
      try {
        const parser = new PDFParse({
          data: buffer,
        });
  
        const result =
          await parser.getText();
  
        await parser.destroy();
  
        return result.text;
      } catch {
        throw new InternalServerErrorException(
          'Failed to extract text from PDF',
        );
      }
    }
  
    private async extractDocx(
      buffer: Buffer,
    ): Promise<string> {
      try {
        const result =
          await mammoth.extractRawText({
            buffer,
          });
  
        return result.value;
      } catch {
        throw new InternalServerErrorException(
          'Failed to extract text from DOCX',
        );
      }
    }
  
    private cleanText(
      text: string,
    ): string {
      return text
        .replace(/\r/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }